import ignore, { type Ignore } from "ignore";
import { readFileSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";

/**
 * Loaders + matchers for the three `.pi/*ignore` files this extension
 * recognises. Each is a gitignore-style allowlist (parsed by the `ignore`
 * package) of paths to exclude from injection / display in the system prompt:
 *
 *   - `.pi/agentsignore`  — filters AGENTS.md / AGENTS.local.md by relative path.
 *                           Applies to both Pi-loaded ancestors and subdir
 *                           discoveries by this extension.
 *   - `.pi/ruleignore`    — filters Claude/Cursor rule files by their path
 *                           inside `.claude/rules/` / `.cursor/rules/`.
 *   - `.pi/skillignore`   — filters skills out of the `<available_skills>`
 *                           XML section.
 *
 * Each loader returns `null` if the file is absent or unreadable; callers
 * treat null as "ignore nothing." Loaders are called every turn, so edits
 * take effect without `/reload`.
 *
 * Paths handed to `isIgnored` are absolute; the helper computes the
 * gitignore-relative path internally and skips files outside cwd.
 */

export type IgnoreMatcher = Ignore;

function load(cwd: string, relativePath: string): IgnoreMatcher | null {
  try {
    const patterns = readFileSync(join(cwd, relativePath), "utf8");
    return ignore().add(patterns);
  } catch {
    return null; // missing / unreadable -> inert
  }
}

export const loadAgentsIgnore = (cwd: string): IgnoreMatcher | null => load(cwd, ".pi/agentsignore");
export const loadRuleIgnore = (cwd: string): IgnoreMatcher | null => load(cwd, ".pi/ruleignore");
export const loadSkillIgnore = (cwd: string): IgnoreMatcher | null => load(cwd, ".pi/skillignore");

/**
 * Test whether `absPath` is ignored by `matcher`. Returns `false` when the
 * matcher is null (missing config), when the path is outside `cwd`, or when
 * the gitignore-style pattern set doesn't match. The `ignore` package
 * expects forward-slash POSIX-style paths relative to the gitignore root.
 */
export function isIgnored(matcher: IgnoreMatcher | null, absPath: string, cwd: string): boolean {
  if (!matcher) return false;
  const rel = relative(cwd, absPath);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return false;
  return matcher.ignores(rel.split(sep).join("/"));
}
