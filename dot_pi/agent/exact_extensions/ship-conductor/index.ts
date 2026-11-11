import { execFileSync, spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getSupportedThinkingLevels, type Api, type Model } from "@earendil-works/pi-ai";
import { getAgentDir, type ExtensionAPI, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Box, Text } from "@earendil-works/pi-tui";
import { runImplement, type ConductorDeps, type ConductorUI, type LifecycleStageRunner } from "./_conductor.ts";
import type { ModelSelectionUI } from "./_models.ts";
import { createSessionRecovery, type SessionRecovery } from "./_recovery.ts";
import { buildRpcChildEnvironment, buildRpcStageArgs, getPiInvocation, runRpcLifecycleStage, type RpcSpawner, type RpcStageUI } from "./_spawn.ts";
import { LifecycleStateStore } from "./_state.ts";
import { captureCleanCandidate, createGitRunner, resolvePlan } from "./_worktree.ts";
import type { Stage } from "./_protocol.ts";

const CHILD_CONFIG_ENV = "PI_LIFECYCLE_CHILD_CONFIG";
// Ctrl-C is Pi's `app.clear` and Escape is `app.interrupt`; neither reaches an idle extension command, so cancellation needs its own key.
const CANCEL_SHORTCUT = "ctrl+shift+x";
const SUMMARY_ENTRY = "implement-summary";
type SummaryEntry = { summary: string; level: "info" | "warning" | "error" };

function combineSignals(signals: Array<AbortSignal | undefined>): { signal: AbortSignal | undefined; dispose(): void } {
  const active = signals.filter((signal): signal is AbortSignal => signal !== undefined);
  if (active.length === 0) return { signal: undefined, dispose: () => undefined };
  const controller = new AbortController();
  const listeners = new Map<AbortSignal, () => void>();
  for (const signal of active) {
    if (signal.aborted) controller.abort();
    else {
      const listener = () => controller.abort();
      listeners.set(signal, listener);
      signal.addEventListener("abort", listener, { once: true });
    }
  }
  return {
    signal: controller.signal,
    dispose() {
      for (const [signal, listener] of listeners) signal.removeEventListener("abort", listener);
    },
  };
}

function currentIdentity(ctx: ExtensionCommandContext): { provider: string; id: string } | undefined {
  return ctx.model ? { provider: ctx.model.provider, id: ctx.model.id } : undefined;
}

function raceWithAbort<T>(operation: Promise<T>, signal: AbortSignal | undefined, fallback: T): Promise<T> {
  if (!signal) return operation;
  if (signal.aborted) return Promise.resolve(fallback);
  return new Promise((resolve, reject) => {
    const finish = (callback: () => void) => {
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => resolve(fallback));
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

export default function implementCoordinator(pi: ExtensionAPI): void {
  let active = false;
  let activeAbort: AbortController | undefined;
  let activeRun: Promise<void> | undefined;
  let recovery: SessionRecovery | undefined;
  const extensionDirectory = dirname(fileURLToPath(import.meta.url));

  pi.on("agent_settled", () => recovery?.onSettled());

  pi.registerEntryRenderer<SummaryEntry>(SUMMARY_ENTRY, (entry, _options, theme) => {
    const data = entry.data ?? { summary: "No /implement summary recorded.", level: "info" };
    const color = data.level === "error" ? "error" : data.level === "warning" ? "warning" : "success";
    const box = new Box(1, 1, (text) => theme.bg("customMessageBg", text));
    box.addChild(new Text(theme.fg(color, data.summary), 0, 0));
    return box;
  });

  pi.on("input", (_event, ctx) => {
    if (!active || recovery?.recovering) return { action: "continue" };
    if (ctx.mode === "tui") ctx.ui.notify("A lifecycle run owns this session. Wait for it to finish or press Ctrl+Shift+X to cancel it.", "warning");
    return { action: "handled" };
  });

  // Pi awaits session_shutdown handlers, so quitting waits until the active child has stopped and ownership is resolved.
  pi.on("session_shutdown", async () => {
    activeAbort?.abort();
    await activeRun;
  });

  pi.registerShortcut(CANCEL_SHORTCUT, {
    description: "Cancel the active /implement run",
    handler: async (ctx) => {
      if (!activeAbort) {
        ctx.ui.notify("No /implement run is active.", "info");
        return;
      }
      ctx.ui.notify("Cancelling the active /implement run; waiting for the current stage to stop.", "warning");
      activeAbort.abort();
    },
  });

  pi.registerCommand("implement", {
    description: "Run each remaining plan slice through execute, simplify, and independent verify",
    handler: async (args, ctx) => {
      if (process.env[CHILD_CONFIG_ENV] !== undefined) {
        ctx.ui.notify("implement: nested lifecycle orchestration is disabled in a child stage", "error");
        return;
      }
      if (active) {
        ctx.ui.notify("implement: another lifecycle run is already active in this session", "error");
        return;
      }
      if (!ctx.hasUI) {
        ctx.ui.notify("implement: requires an interactive UI for model selection and approvals", "error");
        return;
      }

      active = true;
      const controller = new AbortController();
      activeAbort = controller;
      const onSigint = () => controller.abort();
      process.on("SIGINT", onSigint);
      const combined = combineSignals([ctx.signal, controller.signal]);

      // The run continues after this handler returns: Pi starts a turn requested with sendUserMessage only after the
      // current command handler finishes, and recovery needs that session-model turn.
      activeRun = (async () => {
        try {
          const agentDirectory = getAgentDir();
          const stagePaths: Record<Stage, string> = {
            execute: join(agentDirectory, "prompts", "execute.md"),
            simplify: join(agentDirectory, "prompts", "simplify.md"),
            verify: join(agentDirectory, "prompts", "verify.md"),
          };
          const gitRunner = createGitRunner();
          const modelUI: ModelSelectionUI = {
            select: (stage, options) => raceWithAbort(
              ctx.ui.select(`Select the ${stage} model`, options),
              combined.signal,
              undefined,
            ),
            selectThinking: (stage, model, options) => raceWithAbort(
              ctx.ui.select(`Select the ${stage} thinking level for ${model.provider}/${model.id}`, options),
              combined.signal,
              undefined,
            ),
            confirmIndependent: (verifier, writer) => raceWithAbort(
              ctx.ui.confirm(
                "Confirm verifier independence",
                `Pi does not expose upstream model-service identity. Confirm that ${verifier.provider}/${verifier.id} is independent of ${writer.provider}/${writer.id}.`,
              ),
              combined.signal,
              false,
            ),
          };
          recovery = createSessionRecovery({
            send: (prompt) => pi.sendUserMessage(prompt),
            abort: () => ctx.abort(),
            model: () => currentIdentity(ctx),
          });
          const stageUI = ctx.ui as RpcStageUI;
          const conductorUI: ConductorUI = {
            select: (title, options) => ctx.ui.select(title, options),
            confirm: (title, message) => ctx.ui.confirm(title, message),
            input: (title, placeholder) => ctx.ui.input(title, placeholder),
            editor: (title, prefill) => ctx.ui.editor(title, prefill),
            notify: (message, type) => ctx.ui.notify(message, type),
            setStatus: (key, text) => ctx.ui.setStatus(key, text),
            setWidget: (key, lines) => ctx.ui.setWidget(key, lines),
            showSummary: (summary, level) => pi.appendEntry<SummaryEntry>(SUMMARY_ENTRY, { summary, level }),
          };
          const baseEnvironment = { ...process.env };
          const spawner: RpcSpawner = (command, commandArgs, options) => spawn(command, commandArgs, {
            cwd: options.cwd,
            env: options.env,
            shell: false,
            stdio: ["pipe", "pipe", "pipe"],
          });
          const runStage: LifecycleStageRunner = (request, signal, callbacks) => {
            const invocation = getPiInvocation(buildRpcStageArgs(
              request.model.provider,
              request.model.id,
              request.thinkingLevel,
              request.bridgePath,
            ));
            const childEnvironment = buildRpcChildEnvironment(baseEnvironment, request.configPath);
            return runRpcLifecycleStage(
              spawner,
              invocation,
              request.cwd,
              childEnvironment,
              {
                runId: request.runId,
                stage: request.stage,
                commandName: request.stage,
                promptPath: request.promptPath,
                templates: request.templates,
                model: request.model,
                thinkingLevel: request.thinkingLevel,
                bridgePath: request.bridgePath,
                configPath: request.configPath,
                prompt: request.prompt,
              },
              stageUI,
              signal,
              callbacks,
            );
          };
          const deps: ConductorDeps = {
            resolvePlan: (input, cwd) => resolvePlan(input, cwd, gitRunner),
            registry: ctx.modelRegistry,
            currentModel: currentIdentity(ctx),
            scopedModels: ctx.scopedModels.map(({ model, thinkingLevel }) => ({ provider: model.provider, id: model.id, thinkingLevel })),
            // selectModels passes the registry's own Model object, so the cast only widens the declared type.
            supportedThinkingLevels: (model) => getSupportedThinkingLevels(model as Model<Api>),
            modelUI,
            ui: conductorUI,
            stateStore: new LifecycleStateStore(join(agentDirectory, "lifecycle-coordinator")),
            coordinatorSessionId: ctx.sessionManager.getSessionId(),
            thinkingLevel: ctx.thinkingLevel ?? "",
            stagePaths,
            bridgePath: join(extensionDirectory, "_bridge.ts"),
            captureCandidate: (root) => captureCleanCandidate(root, gitRunner),
            runStage,
            worktreeStatus: (root) => execFileSync("git", ["-C", root, "status", "--porcelain=v1", "--untracked-files=all"], {
              encoding: "utf8",
              maxBuffer: 1024 * 1024,
            }),
            recovery: {
              sessionModel: () => currentIdentity(ctx),
              run: (prompt, signal) => recovery!.run(prompt, signal),
            },
          };
          await runImplement(args, ctx.cwd, deps, combined.signal);
        } catch (error) {
          ctx.ui.notify(`implement: ${error instanceof Error ? error.message : String(error)}`, "error");
        } finally {
          combined.dispose();
          process.off("SIGINT", onSigint);
          activeAbort = undefined;
          active = false;
          activeRun = undefined;
          recovery = undefined;
        }
      })();
    },
  });
}
