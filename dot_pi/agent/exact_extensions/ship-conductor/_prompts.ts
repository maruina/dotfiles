import { isAbsolute } from "node:path";

export type LifecycleStage = "execute" | "simplify" | "verify";

type ParseResult = { ok: true; arguments: string[] } | { ok: false; reason: string };

function parseNativeArguments(input: string): ParseResult {
  const argumentsList: string[] = [];
  let current = "";
  let hasToken = false;
  let quote: "'" | '"' | undefined;

  for (const character of input) {
    if (quote) {
      if (character === quote) quote = undefined;
      else current += character;
    } else if (character === "'" || character === '"') {
      quote = character;
      hasToken = true;
    } else if (/\s/.test(character)) {
      if (hasToken) {
        argumentsList.push(current);
        current = "";
        hasToken = false;
      }
    } else {
      current += character;
      hasToken = true;
    }
  }
  if (quote) return { ok: false, reason: "Plan path has an unterminated quote" };
  if (hasToken) argumentsList.push(current);
  return { ok: true, arguments: argumentsList };
}

export function parseSinglePlanArgument(input: string): { ok: true; planPath: string } | { ok: false; reason: string } {
  const parsed = parseNativeArguments(input);
  if (!parsed.ok) return parsed;
  if (parsed.arguments.length !== 1 || !parsed.arguments[0]) {
    return { ok: false, reason: "Usage: /implement <one plan path>" };
  }
  const planPath = parsed.arguments[0];
  if (/[\0\r\n]/.test(planPath)) return { ok: false, reason: "Plan path must not contain NUL or line-break characters" };
  return { ok: true, planPath };
}

export function quoteNativeArgument(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function buildStagePrompt(
  stage: LifecycleStage,
  planPath: string,
  writers?: { implementedBy: string; simplifiedBy: string },
): string {
  if (!isAbsolute(planPath)) throw new Error("Lifecycle stage prompt requires an absolute plan path");
  if (/[\0\r\n]/.test(planPath)) throw new Error("Lifecycle plan path contains unsupported control characters");
  const argumentsList = [quoteNativeArgument(planPath)];
  if (stage === "simplify" || stage === "verify") {
    if (!writers?.implementedBy || /[\0\r\n]/.test(writers.implementedBy)) {
      throw new Error(`Lifecycle ${stage} prompt requires a valid implementation model identity`);
    }
    argumentsList.push("--implemented-by", quoteNativeArgument(writers.implementedBy));
  }
  if (stage === "verify") {
    if (!writers?.simplifiedBy || /[\0\r\n]/.test(writers.simplifiedBy)) {
      throw new Error("Lifecycle verify prompt requires a valid simplification model identity");
    }
    argumentsList.push("--simplified-by", quoteNativeArgument(writers.simplifiedBy));
  }
  return `/${stage} ${argumentsList.join(" ")}`;
}
