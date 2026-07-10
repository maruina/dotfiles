import { accessSync, constants, existsSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";

const CONTEXT_FILE_NAMES = ["AGENTS.md", "CLAUDE.md"] as const;

/**
 * AGENTS.md / CLAUDE.md walk-up + local sibling resolution.
 *
 * `walkUpForAgents` starts from `startDir` and ascends toward (but not past)
 * `cwd`, returning absolute paths of every `AGENTS.md` and `CLAUDE.md` it finds
 * — Pi already loads context files at cwd and above, so this only surfaces
 * strictly-below-cwd discoveries. The result is shallowest-first, with
 * `AGENTS.md` before `CLAUDE.md` within the same directory.
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

    const directoryMatches: string[] = [];
    for (const fileName of CONTEXT_FILE_NAMES) {
      const candidate = join(dir, fileName);
      try {
        accessSync(candidate, constants.R_OK);
        directoryMatches.push(candidate);
      } catch {
        // No readable context file with this name here — skip.
      }
    }

    // unshift so callers see shallowest-first (closer to cwd first), which
    // matches Pi's general-to-specific ordering for ancestor context files.
    found.unshift(...directoryMatches);

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
