#!/usr/bin/env node
/**
 * One-shot migration: reconstruct context-kit usage records from existing Pi
 * session transcripts so `/context-kit status` has historical data immediately,
 * not just from the first session after the usage store shipped.
 *
 * Each `context-kit-discovery` custom message in a session file is a record of
 * what context-kit injected that turn; this script parses them into per-session
 * records under the usage dir. It is idempotent: re-running skips sessions that
 * already have a record (live records are richer — they include ignored files —
 * so they are never clobbered).
 *
 * Run once after upgrading:
 *
 *   node --experimental-strip-types exact_scripts/backfill-context-kit-usage.mjs
 *
 * Override the dirs (mainly for testing):
 *
 *   node --experimental-strip-types exact_scripts/backfill-context-kit-usage.mjs \
 *     --sessions-dir /tmp/sessions --usage-dir /tmp/usage
 */
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The script runs from the rendered tree (~/.pi/agent/scripts/), where chezmoi
// has stripped the `exact_` prefix so the sibling is `extensions/`. In the source
// tree the sibling is `exact_extensions/`. Resolve whichever exists so the
// script works in both contexts.
const here = dirname(fileURLToPath(import.meta.url));
const usageModule = existsSync(join(here, "..", "extensions"))
  ? join(here, "..", "extensions", "context-kit", "_usage.ts")
  : join(here, "..", "exact_extensions", "context-kit", "_usage.ts");
const { backfillFromSessions } = await import(usageModule);

function parseArgs(argv) {
  const agentDir = getAgentDir();
  let sessionsDir = join(agentDir, "sessions");
  let usageDir = join(agentDir, "context-kit-usage");
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--sessions-dir") sessionsDir = argv[++i] ?? "";
    else if (arg === "--usage-dir") usageDir = argv[++i] ?? "";
    else if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        "Usage: backfill-context-kit-usage.mjs [--sessions-dir <dir>] [--usage-dir <dir>]\n",
      );
      process.exit(0);
    }
  }
  if (!sessionsDir || !usageDir) {
    process.stderr.write("Missing value for --sessions-dir / --usage-dir\n");
    process.exit(2);
  }
  return { sessionsDir, usageDir };
}

async function main() {
  const { sessionsDir, usageDir } = parseArgs(process.argv.slice(2));
  const written = await backfillFromSessions(sessionsDir, usageDir);
  process.stdout.write(
    `Backfilled ${written} context-kit usage record(s) into ${usageDir}\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(`backfill failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
