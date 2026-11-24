import type { ExtensionAPI, InputEventResult } from "@earendil-works/pi-coding-agent";
import { qualifiedId } from "./_shared/model.ts";

export type LifecycleCommandName = "verify" | "simplify";

export interface ParsedLifecycleCommand {
  command: LifecycleCommandName;
  positionals: string[];
  implementedBy: string[];
  simplifiedBy: string[];
  base?: string;
  task?: string;
  hasTask: boolean;
  errors: string[];
}

export interface ModelIdentity {
  provider: string;
  id: string;
}

export type PreflightResult =
  | { ok: true }
  | { ok: false; error: string };

const KNOWN_VALUE_FLAGS = new Set(["--implemented-by", "--simplified-by", "--base"]);

function isKnownFlagToken(token: string): boolean {
  if (token === "--task" || token.startsWith("--task=")) return true;
  for (const flag of KNOWN_VALUE_FLAGS) {
    if (token === flag || token.startsWith(`${flag}=`)) return true;
  }
  return false;
}

interface RawToken {
  value: string;
  quoted: boolean;
  start: number;
  end: number;
}

function readNextToken(input: string, startIndex: number): RawToken | null {
  let i = startIndex;
  while (i < input.length && /\s/.test(input[i]!)) i++;
  if (i >= input.length) return null;

  const start = i;
  let value = "";
  let quoted = false;

  while (i < input.length && !/\s/.test(input[i]!)) {
    const ch = input[i]!;
    if (ch === "'") {
      quoted = true;
      i++;
      while (i < input.length && input[i] !== "'") {
        if (input[i] === "\\" && input[i + 1] === "'") {
          value += "'";
          i += 2;
        } else {
          value += input[i]!;
          i++;
        }
      }
      if (i < input.length && input[i] === "'") i++;
    } else if (ch === '"') {
      quoted = true;
      i++;
      while (i < input.length && input[i] !== '"') {
        if (input[i] === "\\" && (input[i + 1] === '"' || input[i + 1] === "\\")) {
          value += input[i + 1]!;
          i += 2;
        } else {
          value += input[i]!;
          i++;
        }
      }
      if (i < input.length && input[i] === '"') i++;
    } else if (ch === "\\" && i + 1 < input.length) {
      value += input[i + 1]!;
      i += 2;
    } else {
      value += ch;
      i++;
    }
  }

  return { value, quoted, start, end: i };
}

function isEmptyTaskLiteral(raw: string): boolean {
  return raw === "" || raw === "''" || raw === '""';
}

export function parseLifecycleCommand(input: string): ParsedLifecycleCommand | null {
  const trimmed = input.trimStart();
  const match = /^\/(verify|simplify)(?:$|\s([\s\S]*))$/.exec(trimmed);
  if (!match) return null;

  const command = match[1] as LifecycleCommandName;
  const rest = match[2] ?? "";

  const parsed: ParsedLifecycleCommand = {
    command,
    positionals: [],
    implementedBy: [],
    simplifiedBy: [],
    hasTask: false,
    errors: [],
  };

  let cursor = 0;
  while (cursor < rest.length) {
    const token = readNextToken(rest, cursor);
    if (!token) break;
    cursor = token.end;

    if (!token.quoted && (token.value === "--task" || token.value.startsWith("--task="))) {
      parsed.hasTask = true;
      const rawTask = token.value === "--task"
        ? rest.slice(cursor).trim()
        : rest.slice(token.start + "--task=".length).trim();
      if (isEmptyTaskLiteral(rawTask)) {
        parsed.errors.push("Missing value for --task.");
        parsed.task = "";
      } else {
        parsed.task = rawTask;
      }
      break;
    }

    if (!token.quoted) {
      let matchedFlag: string | undefined;
      let inlineValue: string | undefined;
      for (const flag of KNOWN_VALUE_FLAGS) {
        if (token.value === flag) {
          matchedFlag = flag;
          break;
        }
        if (token.value.startsWith(`${flag}=`)) {
          matchedFlag = flag;
          inlineValue = token.value.slice(flag.length + 1);
          break;
        }
      }

      if (matchedFlag) {
        let flagValue: string | undefined;
        if (inlineValue !== undefined) {
          flagValue = inlineValue.trim();
        } else {
          const next = readNextToken(rest, cursor);
          if (!next || (!next.quoted && isKnownFlagToken(next.value))) {
            parsed.errors.push(`Missing value for ${matchedFlag}.`);
            continue;
          }
          cursor = next.end;
          flagValue = next.value.trim();
        }

        if (!flagValue) {
          parsed.errors.push(`Missing value for ${matchedFlag}.`);
          continue;
        }

        if (matchedFlag === "--implemented-by") parsed.implementedBy.push(flagValue);
        else if (matchedFlag === "--simplified-by") parsed.simplifiedBy.push(flagValue);
        else if (matchedFlag === "--base") parsed.base = flagValue;
        continue;
      }

      if (token.value.startsWith("--")) {
        continue;
      }
    }

    parsed.positionals.push(token.value);
  }

  return parsed;
}

export function validateLifecyclePreflight(
  parsed: ParsedLifecycleCommand,
  currentModel?: ModelIdentity,
): PreflightResult {
  if (parsed.errors.length > 0) {
    return { ok: false, error: `/${parsed.command} preflight blocked: ${parsed.errors[0]}` };
  }

  if (parsed.command === "simplify") {
    return { ok: true };
  }

  if (parsed.implementedBy.length === 0) {
    return {
      ok: false,
      error: "/verify preflight blocked: missing required --implemented-by <provider/model-id>.",
    };
  }

  if (parsed.positionals.length > 1) {
    return {
      ok: false,
      error: "/verify preflight blocked: expected at most one positional plan path.",
    };
  }

  const hasPlan = parsed.positionals.length === 1;
  const hasTask = parsed.hasTask;

  if (hasPlan && hasTask) {
    return {
      ok: false,
      error: "/verify preflight blocked: provide either a positional plan path or --task, not both.",
    };
  }

  if (!hasPlan && !hasTask) {
    return {
      ok: false,
      error: "/verify preflight blocked: provide either a positional plan path or --task <requirements>.",
    };
  }

  if (hasPlan && !hasTask && parsed.simplifiedBy.length === 0) {
    return {
      ok: false,
      error: "/verify preflight blocked: plan-backed verification requires --simplified-by <provider/model-id>.",
    };
  }

  if (currentModel) {
    const currentId = qualifiedId(currentModel.provider, currentModel.id);
    const matchedRoles: string[] = [];
    if (parsed.implementedBy.includes(currentId)) matchedRoles.push("--implemented-by");
    if (parsed.simplifiedBy.includes(currentId)) matchedRoles.push("--simplified-by");
    if (matchedRoles.length > 0) {
      return {
        ok: false,
        error: `/verify preflight blocked: current model (${currentId}) matches ${matchedRoles.join(" and ")}. Switch to a different model with /model, start a fresh session with /new, and rerun /verify.`,
      };
    }
  }

  return { ok: true };
}

export default function (pi: ExtensionAPI) {
  pi.on("input", (event, ctx): InputEventResult => {
    if (process.env.PI_STAGE_RUNNER_CHILD === "1" || ctx.mode !== "tui") {
      return { action: "continue" };
    }

    const parsed = parseLifecycleCommand(event.text);
    if (!parsed) return { action: "continue" };

    const result = validateLifecyclePreflight(parsed, ctx.model);
    if (!result.ok) {
      if (ctx.hasUI) ctx.ui.notify(result.error, "error");
      return { action: "handled" };
    }

    return { action: "continue" };
  });
}
