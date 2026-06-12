import { accessSync, constants, existsSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";

/**
 * AGENTS.md walk-up + AGENTS.local.md sibling resolution.
 *
 * `walkUpForAgents` starts from `startDir` and ascends toward (but not past)
 * `cwd`, returning absolute paths of every `AGENTS.md` it finds — Pi already
 * loads the AGENTS.md at cwd and above, so this only surfaces strictly-below-
 * cwd discoveries. The result is shallowest-first (closer to cwd first).
 *
 * `findLocalSibling` returns the absolute path to `AGENTS.local.md` (or
 * `CLAUDE.local.md`, matching whichever base file was passed in) if a
 * readable sibling exists in the same directory. The `.local.md` convention
 * is borrowed from Claude Code's `CLAUDE.local.md`: personal additions,
 * gitignored by convention, loaded *after* the team-shared `AGENTS.md` so
 * personal context wins on conflict.
 */

export function walkUpForAgents(startDir: string, cwd: string): string[] {
  const found: string[] = [];
  let dir = startDir;
  while (true) {
    const rel = relative(cwd, dir);
    // Stop at cwd (Pi already covers it) and at any path that escapes cwd.
    if (rel === "" || rel.startsWith("..")) break;
    const candidate = join(dir, "AGENTS.md");
    try {
      accessSync(candidate, constants.R_OK);
      // unshift so callers see shallowest-first (closer to cwd first), which
      // matches Pi's general-to-specific ordering for ancestor AGENTS.md.
      found.unshift(candidate);
    } catch {
      // No AGENTS.md here — skip.
    }
    const parent = dirname(dir);
    if (parent === dir) break; // Filesystem root guard.
    dir = parent;
  }
  return found;
}

export function findLocalSibling(contextFilePath: string): string | null {
  const base = basename(contextFilePath);
  // Convert `AGENTS.md` → `AGENTS.local.md`, `CLAUDE.md` → `CLAUDE.local.md`.
  // If the base doesn't end in `.md` (shouldn't happen for context files),
  // give up — we don't know how to derive the local sibling name.
  if (!base.endsWith(".md") || base.endsWith(".local.md")) return null;
  const localBase = `${base.slice(0, -".md".length)}.local.md`;
  const sibling = join(dirname(contextFilePath), localBase);
  return existsSync(sibling) ? sibling : null;
}
