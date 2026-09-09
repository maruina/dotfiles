/**
 * Deterministic prompt delivery for /ship stages: read the rendered template,
 * strip its YAML frontmatter, and substitute exactly `$ARGUMENTS`. All other
 * literals in the prompt body (e.g. `$GLOB`) pass through untouched.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export type PromptName = "execute" | "verify";

export function stripFrontmatter(text: string): string {
  if (!text.startsWith("---\n")) return text;
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) return text;
  return text.slice(end + 5);
}

export function expandPrompt(template: string, argumentsText: string): string {
  return stripFrontmatter(template).replaceAll("$ARGUMENTS", argumentsText);
}

export function buildExecuteArguments(planPath: string): string {
  return planPath;
}

export function buildVerifyArguments(planPath: string, implementedBy: string): string {
  return `${planPath} --implemented-by ${implementedBy}`;
}

/** Reads the rendered prompt templates from the pi agent prompts directory. */
export function createPromptReader(promptsDir: string): (name: PromptName) => string | undefined {
  return (name) => {
    try {
      return readFileSync(join(promptsDir, `${name}.md`), "utf8");
    } catch {
      return undefined;
    }
  };
}
