import path from "node:path";
import os from "node:os";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import { VERSION, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text, type Terminal } from "@earendil-works/pi-tui";
import { execRexJson, verifyLocalRexEndpoint, verifyLocalRexPeer } from "../_shared/rex.ts";
import { parsePullRequestUrl } from "../_shared/github.ts";
import { qualifiedId } from "../_shared/model.ts";
import stageRunnerHandoff from "./_handoff.ts";
import { parseArpReviewArgs, runArpReview } from "./_arp-review.ts";
import { buildDesignBrief, createDesignWorktree, deriveDesignBranch, inspectDesignBranch } from "./_design.ts";
import { formatDoctorReport, runDoctor } from "./_doctor.ts";
import { handoff, run, runDesign, type Choice, type Phase, type RunnerEvent } from "./_runner.ts";

export function trackPublishedPr(pi: ExtensionAPI, event: RunnerEvent) {
  if (event.type !== "message" || !event.message.startsWith("Published ")) return;
  const token = event.message.slice("Published ".length).split(/\s+/, 1)[0];
  let url: string;
  try {
    ({ url } = parsePullRequestUrl(token));
  } catch {
    return;
  }
  pi.events?.emit("pr-status:track", { url });
}

function deadline(name: string, fallback: number) {
  const ms = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(ms) || ms <= 0 || ms > 2147483647) throw Error("Invalid milliseconds in " + name);
  return ms;
}

async function checkRex(pi: ExtensionAPI) {
  const endpoint = verifyLocalRexEndpoint(process.env.REX_SERVER);
  const peer = await execRexJson(pi, ["whoami", "--json"], {
    timeoutSec: 5,
    execTimeoutMs: 5000,
    endpoint,
    validateEndpoint: false,
    errorMessage: "Cannot verify Rex identity",
  });
  verifyLocalRexPeer(peer, endpoint, {
    session: process.env.REX_SESSION || undefined,
    block: process.env.REX_BLOCK ?? "",
  });
}

function duration(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return [Math.floor(seconds / 60), seconds % 60].map(n => String(n).padStart(2, "0")).join(":");
}

const phaseLabel = (phase: Phase) => (phase === "review" ? "Waiting for ARP review" : phase);

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
  const history = () => [...totals].map(([phase, ms]) => phaseLabel(phase) + " " + duration(ms)).join(" · ");
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
        label = launch === undefined ? phaseLabel(phase) : phase === "execute" ? `execute slice ${launch}` : `verify ${launch} of 3`;
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

const PHASE_PROGRESS: Record<Exclude<Phase, "recovery">, number> = {
  startup: 5,
  execute: 30,
  simplify: 65,
  verify: 80,
  publish: 90,
  review: 95,
  fix: 75,
};

function encodeOsc7501Text(value: string, maxBytes: number): string {
  const sanitized = value.replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
  let bytes = 0;
  let end = 0;
  for (const ch of sanitized) {
    const chBytes = Buffer.byteLength(ch, "utf8");
    if (bytes + chBytes > maxBytes) break;
    bytes += chBytes;
    end += ch.length;
  }
  return Buffer.from(sanitized.slice(0, end), "utf8").toString("base64");
}

function formatStageRunnerStatus(status: {
  state: "working" | "done" | "blocked" | "error" | "clear";
  kind?: "permission" | "question" | "auth";
  progress?: number;
  message?: string;
  title?: string;
}): string {
  if (status.state === "clear") {
    return "\x1b]7501;state=clear:id=stage-runner\x1b\\";
  }
  const pairs = [
    `state=${status.state}`,
    "id=stage-runner",
    "app=pi-stage-runner",
    `title=${encodeOsc7501Text(status.title ?? "Stage runner", 192)}`,
  ];
  if (status.state === "blocked" && status.kind) {
    pairs.push(`kind=${status.kind}`);
  }
  if ((status.state === "working" || status.state === "blocked") &&
      typeof status.progress === "number" && Number.isInteger(status.progress) &&
      status.progress >= 0 && status.progress <= 100) {
    pairs.push(`progress=${status.progress}`);
  }
  if (status.message) {
    pairs.push(`msg=${encodeOsc7501Text(status.message, 2048)}`);
  }
  return `\x1b]7501;${pairs.join(":")}\x1b\\`;
}

export function rexActivity(write: (sequence: string) => void) {
  let previous = "";
  function report(status: Parameters<typeof formatStageRunnerStatus>[0]) {
    if (process.env.PI_PROGRAM_STATUS === "0") return;
    const sequence = formatStageRunnerStatus(status);
    if (sequence === previous) return;
    try {
      write(sequence);
      previous = sequence;
    } catch {
      console.warn("Stage runner could not update Rex activity.");
    }
  }
  return {
    phase: (phase: Exclude<Phase, "recovery">) =>
      report({ state: "working", message: phaseLabel(phase), progress: PHASE_PROGRESS[phase] }),
    working: (message: string, progress?: number) =>
      report({ state: "working", message, progress }),
    recovery: (message: string) => report({ state: "blocked", kind: "question", message }),
    permission: (message: string) => report({ state: "blocked", kind: "permission", message }),
    end: (state: "done" | "error" | "clear", message?: string) =>
      report({ state, ...(message && (state === "done" || state === "error") ? { message } : {}) }),
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
  pi.registerCommand("stage-runner-doctor", {
    description: "Check Pi, Rex, models, worktree, signing, and GitHub readiness for stage-runner",
    handler: async (_, ctx) => {
      if (process.env.PI_STAGE_RUNNER_CHILD === "1" || !ctx.hasUI) {
        ctx.ui.notify("Use /stage-runner-doctor in an interactive parent session", "error");
        return;
      }
      const report = await runDoctor({
        cwd: ctx.cwd,
        root: path.join(os.homedir(), ".pi/agent/lifecycle-runs"),
        piVersion: VERSION,
        scopedModels: ctx.scopedModels.map((entry) => entry.model),
        checkRex: () => checkRex(pi),
      });
      ctx.ui.notify(formatDoctorReport(report), report.ok ? "info" : "warning");
    },
  });
  const command = (kind: "plan" | "design" | "arp"): Parameters<ExtensionAPI["registerCommand"]>[1] => ({
    description: kind === "design" ? "Design interactively, review independently, and plan in this worktree"
      : kind === "arp" ? "Run Agentic Review for an existing PR in the work profile"
      : "Verify and publish an unstarted committed plan; check Agentic Review in the work profile",
    handler: async (arg, ctx) => {
      const design = kind === "design", arp = kind === "arp";
      let maxHeads: number | undefined;
      let prUrl: string | undefined;
      if (arp) {
        try { ({ maxHeads, prUrl } = parseArpReviewArgs(arg)); }
        catch (error) { ctx.ui.notify(String(error), "error"); return; }
      }
      const designBrief = design ? buildDesignBrief(arg, ctx.sessionManager?.getBranch?.() ?? []) : "";
      if (active || process.env.PI_STAGE_RUNNER_CHILD === "1" || !ctx.hasUI || (!arp && !design && !arg.trim())) {
        const usage = arp ? "/arp-review [<pr-url>] [--max-heads <N>]" : design ? "/stage-runner-design [brief]" : "/stage-runner <plan-path>";
        ctx.ui.notify(`Use ${usage} in an idle interactive parent session`, "error");
        return;
      }
      if (design && !designBrief) {
        ctx.ui.notify("Provide a brief or start /stage-runner-design from an existing conversation", "error");
        return;
      }
      const controller = new AbortController();
      active = controller;
      if (prUrl) pi.events?.emit("pr-status:track", { url: prUrl });
      const display = design
        ? undefined
        : phaseDisplay(lines => ctx.ui.setWidget(entryType, lines),
            summary => pi.appendEntry(entryType, summary), message => ctx.ui.notify(message, "info"));
      let state: "clear" | "done" | "error" = "clear";
      let declined = false;
      let outcome = "Run canceled.";
      finished = (async () => {
        // deliberate: Gate on Pi 1.6.x minor line so patch releases do not break the runner; widen after testing 1.7+.
        if (!/^1\.6\./.test(VERSION)) throw Error(`Stage runner requires Pi 1.6.x (found ${VERSION})`);
        if (!arp) await checkRex(pi);
        ctx.ui.setWidget(entryType, tui => {
          terminal = tui.terminal;
          return { render: () => [], invalidate() {} };
        });
        const branchInfo = design ? inspectDesignBranch(ctx.cwd) : undefined;
        const models = {} as Record<"execute" | "simplify" | "verify", Choice>;
        for (const stage of ["execute", "simplify", "verify"] as const) {
          if ((design && stage === "simplify") || (arp && stage !== "execute")) continue;
          const label = arp ? "ARP fix" : design ? (stage === "execute" ? "author" : "reviewer") : stage;
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
          const designProgress = (message: string) => {
            if (message.startsWith("Starting design-draft")) activity.working("design-draft", 15);
            else if (message.startsWith("Starting design-review")) activity.working("design-review", 50);
            else if (message.startsWith("Resuming design reviewer")) activity.recovery("Resolve design review findings in the Rex pane");
            else if (message.startsWith("Starting design-plan")) activity.working("design-plan", 80);
            progress(message);
          };
          let designCwd = ctx.cwd;
          if (branchInfo?.onDefault) {
            const branchName = deriveDesignBranch(branchInfo.root, arg, designBrief, pi.getSessionName?.(), branchInfo.defaultBranch);
            designProgress("Creating feature worktree " + branchName);
            designCwd = createDesignWorktree(ctx.cwd, branchName);
            designProgress("Using feature worktree " + designCwd);
          }
          designProgress("Run started.");
          const evidence = await runDesign({ ...shared, cwd: designCwd, brief: designBrief, author: models.execute, reviewer: models.verify, progress: designProgress });
          state = "done";
          outcome = "Run complete; evidence " + evidence;
          return;
        }
        if (maxHeads !== undefined) {
          const evidence = await runArpReview({
            ...shared, cwd: ctx.cwd, models: { execute: models.execute }, maxHeads, prUrl,
            confirm: async (target, signal) => {
              activity.permission("confirm ARP review");
              const accepted = await ctx.ui.confirm("Start ARP review?", target, { signal });
              declined = !accepted;
              return accepted;
            },
            onEvent: event => {
              trackPublishedPr(pi, event);
              if (event.type === "phase" && event.phase !== "recovery") activity.phase(event.phase);
              display?.onEvent(event);
            },
          });
          state = "done";
          outcome = "ARP complete - No issues found; evidence " + evidence;
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
            trackPublishedPr(pi, event);
            if (event.type === "phase") {
              if (event.phase === "recovery") activity.recovery(event.message);
              else activity.phase(event.phase);
            }
            display?.onEvent(event);
          },
        });
        state = "done";
        outcome = "Run complete; evidence " + evidence;
      })()
        .catch((e) => {
          state = controller.signal.aborted || declined ? "clear" : "error";
          outcome = state === "clear" ? "Run canceled." : "Run stopped. See the error notification for details.";
          if (shuttingDown) return;
          const reason = String(e).replace(/[^\x20-\x7e]/g, "?");
          ctx.ui.notify(arp ? reason : reason.slice(0, 1024), "error");
        })
        .finally(() => {
          active = undefined;
          activity.end(state, outcome);
          if (design) {
            progress(outcome);
            ctx.ui.setWidget(entryType, undefined);
          } else {
            display?.finish(outcome.replace(/[\x00-\x1f\x7f-\x9f]/g, "?"));
          }
        });
    },
  });
  pi.registerCommand("stage-runner", command("plan"));
  pi.registerCommand("stage-runner-design", command("design"));
  pi.registerCommand("arp-review", command("arp"));
}
