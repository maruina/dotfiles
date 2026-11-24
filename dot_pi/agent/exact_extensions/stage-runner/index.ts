import path from "node:path";
import os from "node:os";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import { VERSION, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { formatProgramStatus, Text, type ProgramStatus, type Terminal } from "@earendil-works/pi-tui";
import { buildRexArgs, verifyLocalRexEndpoint, verifyLocalRexPeer } from "../_shared/rex.ts";
import { qualifiedId } from "../_shared/model.ts";
import stageRunnerHandoff from "./_handoff.ts";
import { handoff, run, runDesign, type Choice, type Phase, type RunnerEvent } from "./_runner.ts";

function deadline(name: string, fallback: number) {
  const ms = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(ms) || ms <= 0 || ms > 2147483647) throw Error("Invalid milliseconds in " + name);
  return ms;
}

async function checkRex(pi: ExtensionAPI) {
  const endpoint = verifyLocalRexEndpoint(process.env.REX_SERVER);
  const result = await pi.exec("rex", buildRexArgs(["whoami", "--json"], { timeoutSec: 5, endpoint, validateEndpoint: false }), {
    timeout: 5000,
  });
  if (result.code !== 0 || result.killed) throw Error("Cannot verify Rex identity");
  verifyLocalRexPeer(JSON.parse(result.stdout), endpoint, {
    session: process.env.REX_SESSION,
    block: process.env.REX_BLOCK,
  });
}

function duration(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return [Math.floor(seconds / 60), seconds % 60].map(n => String(n).padStart(2, "0")).join(":");
}

export function phaseDisplay(
  widget: (lines: string[] | undefined) => void,
  append: (summary: string) => void,
  notify: (message: string) => void,
  now = () => performance.now(),
) {
  // A disposed UI must not stop the runner or interrupt its evidence writes.
  let warned = false;
  function present(update: () => void) {
    try {
      update();
    } catch {
      if (!warned) console.warn("Stage runner could not update the Pi display.");
      warned = true;
    }
  }
  const totals = new Map<Phase, number>();
  let active: Extract<RunnerEvent, { type: "phase" }> | undefined;
  let label = "";
  let interval: ReturnType<typeof setInterval> | undefined;
  function freeze(at: number) {
    if (active) totals.set(active.phase, (totals.get(active.phase) ?? 0) + at - active.at);
  }
  let skills = "";
  const history = () => [...totals].map(([phase, ms]) => phase + " " + duration(ms)).join(" · ");
  function tick() {
    if (!active) return;
    const { at } = active;
    present(() => widget([[`${label} · ${duration(now() - at)}`, history(), skills].filter(Boolean).join(" | ")]));
  }
  return {
    onEvent(event: RunnerEvent) {
      if (event.type === "message") {
        present(() => notify(event.message.replace(/[\x00-\x1f\x7f-\x9f]/g, "?")));
        return;
      }
      if (event.type === "skills") {
        skills = event.labels.length ? "skills: " + event.labels.join(", ") : "";
        tick();
        return;
      }
      freeze(event.at);
      active = event;
      const { phase, launch, slice } = event;
      if (phase === "execute" && slice) {
        const title = Array.from(slice.title.replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, "?"));
        label = `execute slice ${slice.number}: ${title.length > 60 ? title.slice(0, 59).join("") + "…" : title.join("")}`;
      } else {
        label = launch === undefined ? phase : phase === "execute" ? `execute slice ${launch}` : `verify ${launch} of 3`;
      }
      tick();
      interval ??= setInterval(tick, 1000);
    },
    finish(outcome: string) {
      clearInterval(interval);
      freeze(now());
      try {
        append([outcome, history()].filter(Boolean).join(" | "));
      } finally {
        present(() => widget(undefined));
      }
    },
  };
}

export function rexActivity(write: (sequence: string) => void) {
  let previous = "";
  function report(status: ProgramStatus) {
    if (process.env.PI_PROGRAM_STATUS === "0") return;
    // Reuse pi-tui's bounded message encoder, but never send its root record.
    const sequence = formatProgramStatus({ ...status, app: "pi-stage-runner" }).replace(":app=", ":id=stage-runner:app=");
    if (sequence === previous || !sequence.includes(":id=stage-runner:")) return;
    try {
      write(sequence);
      previous = sequence;
    } catch {
      console.warn("Stage runner could not update Rex activity.");
    }
  }
  return {
    phase: (phase: Exclude<Phase, "recovery">) => report({ state: "working", message: phase }),
    recovery: (message: string) => report({ state: "blocked", kind: "question", message }),
    permission: (message: string) => report({ state: "blocked", kind: "permission", message }),
    end: (state: "done" | "error" | "idle" | "clear") => report({ state }),
  };
}

export default function stageRunner(pi: ExtensionAPI) {
  const managedStage = process.env.PI_DESIGN_STAGE, managedFile = process.env.PI_DESIGN_HANDOFF;
  if (process.env.PI_STAGE_RUNNER_CHILD === "1" && managedFile && (managedStage === "design-draft" || managedStage === "design-plan")) {
    stageRunnerHandoff(pi);
    pi.on("agent_settled", (_, ctx) => {
      try { handoff(managedFile, managedStage); } catch { return; }
      ctx.shutdown();
    });
  }
  const entryType = "stage-runner-progress";
  pi.registerEntryRenderer<string>(entryType, (entry, _options, theme) =>
    new Text(`${theme.fg("accent", "Stage runner")} — ${entry.data ?? ""}`, 1, 0),
  );
  let active: AbortController | undefined, finished: Promise<void> | undefined, shuttingDown = false;
  const progress = (message: string) => {
    if (!shuttingDown) pi.appendEntry(entryType, message.replace(/[\x00-\x1f\x7f-\x9f]/g, "?"));
  };
  let terminal: Terminal | undefined;
  const activity = rexActivity(sequence => terminal?.write(sequence));
  pi.on("session_shutdown", async () => {
    shuttingDown = true;
    active?.abort();
    try {
      await finished;
    } finally {
      activity.end("clear");
      terminal = undefined;
    }
  });
  pi.registerCommand("stage-runner-cancel", {
    description: "Stop the current stage runner and preserve its work",
    handler: async (_, ctx) => {
      if (active) active.abort();
      else ctx.ui.notify("No active stage runner", "info");
    },
  });
  const command = (design: boolean): Parameters<ExtensionAPI["registerCommand"]>[1] => ({
    description: design ? "Design interactively, review independently, and plan in this worktree" : "Verify and publish an unstarted committed plan; check Agentic Review in the work profile",
    handler: async (arg, ctx) => {
      if (active || process.env.PI_STAGE_RUNNER_CHILD === "1" || !ctx.hasUI || !arg.trim()) {
        ctx.ui.notify(`Use ${design ? "/stage-runner-design <brief>" : "/stage-runner <plan-path>"} in an idle interactive parent session`, "error");
        return;
      }
      const controller = new AbortController();
      active = controller;
      const display = phaseDisplay(lines => ctx.ui.setWidget(entryType, lines),
        summary => pi.appendEntry(entryType, summary), message => ctx.ui.notify(message, "info"));
      let state: "idle" | "done" | "error" = "idle";
      let declined = false;
      let outcome = "Run canceled.";
      finished = (async () => {
        // deliberate: Gate on Pi 1.6.x minor line so patch releases do not break the runner; widen after testing 1.7+.
        if (!/^1\.6\./.test(VERSION)) throw Error(`Stage runner requires Pi 1.6.x (found ${VERSION})`);
        await checkRex(pi);
        if (!design) ctx.ui.setWidget(entryType, tui => {
          terminal = tui.terminal;
          return { render: () => [], invalidate() {} };
        });
        const models = {} as Record<"execute" | "simplify" | "verify", Choice>;
        for (const stage of ["execute", "simplify", "verify"] as const) {
          if (design && stage === "simplify") continue;
          const label = design ? (stage === "execute" ? "author" : "reviewer") : stage;
          controller.signal.throwIfAborted();
          const available = ctx.scopedModels
            .map((entry) => entry.model)
            .filter(
              (m) =>
                stage !== "verify" ||
                !(design ? [models.execute] : [models.execute, models.simplify]).some((w) => qualifiedId(w.provider, w.id) === qualifiedId(m.provider, m.id)),
            );
          if (!available.length) throw Error("No eligible scoped model for " + stage);
          const pick = await ctx.ui.select(
            "Select " + label + " model",
            [...new Set(available.map((m) => qualifiedId(m.provider, m.id)))],
            { signal: controller.signal },
          );
          if (!pick) return;
          const model = available.find((m) => qualifiedId(m.provider, m.id) === pick)!;
          const thinking = await ctx.ui.select(
            "Select " + label + " thinking level",
            [...getSupportedThinkingLevels(model)],
            { signal: controller.signal },
          );
          if (!thinking) return;
          models[stage] = { provider: model.provider, id: model.id, thinking };
        }
        const shared = {
          root: path.join(os.homedir(), ".pi/agent/lifecycle-runs"),
          signal: controller.signal,
          idleMs: deadline("PI_STAGE_RUNNER_IDLE_MS", 600000),
          wallMs: deadline("PI_STAGE_RUNNER_WALL_MS", 3600000),
          notify: (message: string) => ctx.ui.notify(message, "warning"),
        };
        if (design) {
          progress("Run started.");
          const evidence = await runDesign({ ...shared, cwd: ctx.cwd, brief: arg, author: models.execute, reviewer: models.verify, progress });
          state = "done";
          outcome = "Run complete; evidence " + evidence;
          return;
        }
        const plan = path.resolve(ctx.cwd, arg.trim().replace(/^(['"])(.*)\1$/, "$2"));
        const evidence = await run({
          ...shared,
          cwd: path.dirname(plan),
          plan,
          models,
          confirm: async (target, signal) => {
            activity.permission("confirm");
            const accepted = await ctx.ui.confirm("Start stage runner and publish?", target, { signal });
            declined = !accepted;
            return accepted;
          },
          approve: (changes, signal) => {
            activity.permission("approve");
            return ctx.ui.confirm("Accept recovered writer?", changes, { signal });
          },
          onEvent: event => {
            if (event.type === "phase") {
              if (event.phase === "recovery") activity.recovery(event.message);
              else activity.phase(event.phase);
            }
            display.onEvent(event);
          },
        });
        state = "done";
        outcome = "Run complete; evidence " + evidence;
      })()
        .catch((e) => {
          state = controller.signal.aborted || declined ? "idle" : "error";
          outcome = state === "idle" ? "Run canceled." : "Run stopped. See the error notification for details.";
          if (shuttingDown) return;
          ctx.ui.notify(
            String(e)
              .replace(/[^\x20-\x7e]/g, "?")
              .slice(0, 1024),
            "error",
          );
        })
        .finally(() => {
          active = undefined;
          if (design) progress(outcome);
          else {
            activity.end(state);
            display.finish(outcome.replace(/[\x00-\x1f\x7f-\x9f]/g, "?"));
          }
        });
    },
  });
  pi.registerCommand("stage-runner", command(false));
  pi.registerCommand("stage-runner-design", command(true));
}
