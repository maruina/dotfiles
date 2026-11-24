import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const USAGE = "Usage: /pr-cleanup <GitHub PR URL>";
const EXEC_TIMEOUT_MS = 60_000;

export type ParseArgResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export interface CleanupOutcome {
  ok: boolean;
  level: "info" | "error";
  message: string;
}

export function workspaceScriptPath(
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir(),
): string {
  const agentDir = env.PI_CODING_AGENT_DIR || path.join(home, ".pi", "agent");
  return path.join(agentDir, "scripts", "pr-validate-report", "workspace.mjs");
}

export function parsePrCleanupArg(args: string): ParseArgResult {
  const trimmed = args.trim();
  if (!trimmed) {
    return { ok: false, error: `Missing GitHub PR URL. ${USAGE}` };
  }

  let unquoted = trimmed;
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2)
    || (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    unquoted = trimmed.slice(1, -1).trim();
  }

  if (!unquoted || /\s/.test(unquoted)) {
    return { ok: false, error: `Expected a single GitHub PR URL. ${USAGE}` };
  }

  return { ok: true, url: unquoted };
}

export function formatCleanupOutcome(result: {
  code: number;
  stdout: string;
  stderr: string;
}): CleanupOutcome {
  if (result.code !== 0) {
    const diagnostic = (result.stderr || result.stdout || "").trim()
      || `workspace.mjs exited with code ${result.code}`;
    return { ok: false, level: "error", message: `/pr-cleanup failed: ${diagnostic}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout.trim());
  } catch {
    const raw = result.stdout.trim();
    return {
      ok: false,
      level: "error",
      message: `/pr-cleanup failed: workspace.mjs returned invalid JSON${raw ? `: ${raw}` : ""}`,
    };
  }

  if (
    typeof parsed !== "object"
    || parsed === null
    || typeof (parsed as { status?: unknown }).status !== "string"
    || typeof (parsed as { worktree?: unknown }).worktree !== "string"
  ) {
    return {
      ok: false,
      level: "error",
      message: "/pr-cleanup failed: workspace.mjs returned an unexpected payload.",
    };
  }

  const { status, worktree } = parsed as { status: string; worktree: string };
  if (status === "removed") {
    return { ok: true, level: "info", message: `Removed review worktree: ${worktree}` };
  }
  if (status === "absent") {
    return { ok: true, level: "info", message: `Review worktree already absent: ${worktree}` };
  }
  return { ok: true, level: "info", message: `PR cleanup (${status}): ${worktree}` };
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("pr-cleanup", {
    description: "Safely remove the review worktree created by /pr-validate for a completed PR",
    handler: async (args, ctx) => {
      const parsedArg = parsePrCleanupArg(args);
      if (!parsedArg.ok) {
        ctx.ui.notify(parsedArg.error, "error");
        return;
      }

      const script = workspaceScriptPath();
      const result = await pi.exec("node", [script, "cleanup", parsedArg.url], {
        timeout: EXEC_TIMEOUT_MS,
      });
      const outcome = formatCleanupOutcome(result);
      ctx.ui.notify(outcome.message, outcome.level);
    },
  });
}
