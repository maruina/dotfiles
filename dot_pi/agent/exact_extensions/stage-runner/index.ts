import { lstatSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import { VERSION, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { qualifiedId } from "./_model.ts";
import { run, type Choice } from "./_runner.ts";

function deadline(name: string, fallback: number) {
  const ms = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(ms) || ms <= 0 || ms > 2147483647) throw Error("Invalid milliseconds in " + name);
  return ms;
}

async function checkRex(pi: ExtensionAPI) {
  const endpoint = process.env.REX_SERVER ?? "";
  if (!endpoint.startsWith("unix:///")) throw Error("Run inside a local Rex pane");
  const url = new URL(endpoint),
    uid = process.getuid?.();
  const socket = lstatSync(decodeURIComponent(url.pathname));
  if (url.hostname || url.search || url.hash || !socket.isSocket() || socket.uid !== uid)
    throw Error("Unverified Rex socket");
  const result = await pi.exec("rex", ["--autostart=false", "--server", endpoint, "whoami", "--json"], {
    timeout: 5000,
  });
  if (result.code !== 0 || result.killed) throw Error("Cannot verify Rex identity");
  const peer = JSON.parse(result.stdout);
  if (
    peer.endpoint !== endpoint ||
    peer.principal?.kind !== "peer" ||
    peer.principal.transport !== "unix" ||
    peer.principal.uid !== uid ||
    !peer.session_id ||
    !peer.block_id ||
    peer.session_id !== process.env.REX_SESSION ||
    peer.block_id !== process.env.REX_BLOCK
  )
    throw Error("Rex identity does not match the invoking pane");
}

export default function stageRunner(pi: ExtensionAPI) {
  const entryType = "stage-runner-progress";
  pi.registerEntryRenderer<string>(entryType, (entry, _options, theme) =>
    new Text(`${theme.fg("accent", "Stage runner")} — ${entry.data ?? ""}`, 1, 0),
  );
  let active: AbortController | undefined, finished: Promise<void> | undefined, shuttingDown = false;
  const progress = (message: string) => {
    if (!shuttingDown) pi.appendEntry(entryType, message.replace(/[\x00-\x1f\x7f-\x9f]/g, "?"));
  };
  pi.on("session_shutdown", async () => {
    shuttingDown = true;
    active?.abort();
    await finished;
  });
  pi.registerCommand("stage-runner-cancel", {
    description: "Stop the current stage runner and preserve its work",
    handler: async (_, ctx) => {
      if (active) active.abort();
      else ctx.ui.notify("No active stage runner", "info");
    },
  });
  pi.registerCommand("stage-runner", {
    description: "Verify and publish an unstarted committed plan; check Agentic Review in the work profile",
    handler: async (arg, ctx) => {
      if (active || process.env.PI_STAGE_RUNNER_CHILD === "1" || !ctx.hasUI || !arg.trim()) {
        ctx.ui.notify("Use /stage-runner <plan-path> in an idle interactive parent session", "error");
        return;
      }
      const controller = new AbortController();
      active = controller;
      finished = (async () => {
        if (VERSION !== "1.6.0") throw Error("Stage runner requires Pi 1.6.0");
        await checkRex(pi);
        const models = {} as Record<"execute" | "simplify" | "verify", Choice>;
        for (const stage of ["execute", "simplify", "verify"] as const) {
          controller.signal.throwIfAborted();
          const available = ctx.scopedModels
            .map((entry) => entry.model)
            .filter(
              (m) =>
                stage !== "verify" ||
                ![models.execute, models.simplify].some((w) => qualifiedId(w.provider, w.id) === qualifiedId(m.provider, m.id)),
            );
          if (!available.length) throw Error("No eligible scoped model for " + stage);
          const pick = await ctx.ui.select(
            "Select " + stage + " model",
            [...new Set(available.map((m) => qualifiedId(m.provider, m.id)))],
            { signal: controller.signal },
          );
          if (!pick) return;
          const model = available.find((m) => qualifiedId(m.provider, m.id) === pick)!;
          const thinking = await ctx.ui.select(
            "Select " + stage + " thinking level",
            [...getSupportedThinkingLevels(model)],
            { signal: controller.signal },
          );
          if (!thinking) return;
          models[stage] = { provider: model.provider, id: model.id, thinking };
        }
        const plan = path.resolve(ctx.cwd, arg.trim().replace(/^(['"])(.*)\1$/, "$2"));
        progress("Run started.");
        const evidence = await run({
          cwd: path.dirname(plan),
          plan,
          root: path.join(os.homedir(), ".pi/agent/lifecycle-runs"),
          models,
          confirm: (target, signal) => ctx.ui.confirm("Start stage runner and publish?", target, { signal }),
          signal: controller.signal,
          idleMs: deadline("PI_STAGE_RUNNER_IDLE_MS", 600000),
          wallMs: deadline("PI_STAGE_RUNNER_WALL_MS", 3600000),
          notify: (message) => ctx.ui.notify(message, "warning"),
          approve: (changes, signal) => ctx.ui.confirm("Accept recovered writer?", changes, { signal }),
          progress,
        });
        progress("Run complete; evidence " + evidence);
      })()
        .catch((e) => {
          if (shuttingDown) return;
          progress(controller.signal.aborted ? "Run canceled." : "Run stopped. See the error notification for details.");
          ctx.ui.notify(
            String(e)
              .replace(/[^\x20-\x7e]/g, "?")
              .slice(0, 1024),
            "error",
          );
        })
        .finally(() => {
          active = undefined;
        });
    },
  });
}
