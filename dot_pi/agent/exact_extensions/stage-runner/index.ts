import { lstatSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import { VERSION, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
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
  let active: AbortController | undefined, finished: Promise<void> | undefined;
  pi.on("session_shutdown", async () => {
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
    description: "Run an unstarted committed plan through independent verification",
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
                ![models.execute, models.simplify].some((w) => w.provider === m.provider && w.id === m.id),
            );
          if (!available.length) throw Error("No eligible scoped model for " + stage);
          const pick = await ctx.ui.select(
            "Select " + stage + " model",
            [...new Set(available.map((m) => m.provider + "/" + m.id))],
            { signal: controller.signal },
          );
          if (!pick) return;
          const model = available.find((m) => m.provider + "/" + m.id === pick)!;
          const thinking = await ctx.ui.select(
            "Select " + stage + " thinking level",
            [...getSupportedThinkingLevels(model)],
            { signal: controller.signal },
          );
          if (!thinking) return;
          models[stage] = { provider: model.provider, id: model.id, thinking };
        }
        if (
          !(await ctx.ui.confirm(
            "Start stage runner?",
            arg + " — run execute, simplify and independent verify without publishing.",
            { signal: controller.signal },
          ))
        )
          return;
        const plan = path.resolve(ctx.cwd, arg.trim().replace(/^(['"])(.*)\1$/, "$2"));
        const evidence = await run({
          cwd: path.dirname(plan),
          plan,
          root: path.join(os.homedir(), ".pi/agent/lifecycle-runs"),
          models,
          signal: controller.signal,
          idleMs: deadline("PI_STAGE_RUNNER_IDLE_MS", 600000),
          wallMs: deadline("PI_STAGE_RUNNER_WALL_MS", 3600000),
          progress: (message) => ctx.ui.setStatus("stage-runner", message),
        });
        ctx.ui.notify("VERIFIED; evidence " + evidence, "info");
      })()
        .catch((e) =>
          ctx.ui.notify(
            String(e)
              .replace(/[^\x20-\x7e]/g, "?")
              .slice(0, 1024),
            "error",
          ),
        )
        .finally(() => {
          active = undefined;
          ctx.ui.setStatus("stage-runner", undefined);
        });
    },
  });
}
