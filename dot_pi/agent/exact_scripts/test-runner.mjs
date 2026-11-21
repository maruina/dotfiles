#!/usr/bin/env node
// Unified test runner for dot_pi/agent (works in both chezmoi source and deployed ~/.pi/agent).
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const agentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extDir = existsSync(path.join(agentRoot, "exact_extensions")) ? "exact_extensions" : "extensions";
const scriptsDir = existsSync(path.join(agentRoot, "exact_scripts")) ? "exact_scripts" : "scripts";

// Slow integration/RPC tests run under `npm run test:integration` (and `npm run test:all`).
const INTEGRATION_TESTS = new Set([
  path.join(extDir, "ship-conductor", "_conductor.test.ts"),
  path.join(extDir, "ship-conductor", "_rpc.test.ts"),
  path.join(extDir, "ship-conductor", "_worktree.test.ts"),
  path.join(extDir, "stage-runner", "_integration.test.ts"),
  path.join(extDir, "worktrunk", "activity.test.ts"),
]);

// Opt-in live-server smoke tests are excluded from automatic discovery.
const EXCLUDED_TESTS = new Set([
  path.join(extDir, "rex-recovery", "smoke.test.mjs"),
]);

function walkTests(dir, results = []) {
  const abs = path.join(agentRoot, dir);
  if (!existsSync(abs)) return results;
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "_fixtures") continue;
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTests(rel, results);
    } else if (/(\.test\.(ts|mjs)|^test\.ts)$/.test(entry.name)) {
      if (!EXCLUDED_TESTS.has(rel)) results.push(rel);
    }
  }
  return results;
}

function runNode(args, label) {
  const res = spawnSync(process.execPath, args, { cwd: agentRoot, stdio: "inherit" });
  if (res.status !== 0) {
    process.stderr.write(`test-runner: ${label} failed with exit code ${res.status ?? 1}\n`);
    process.exit(res.status ?? 1);
  }
}

const mode = process.argv[2] ?? "fast";
if (mode === "--help" || mode === "-h") {
  process.stdout.write(
    "Usage: node exact_scripts/test-runner.mjs [fast | integration | all | skills | skills:profiles]\n",
  );
  process.exit(0);
}

const allTests = [...walkTests(extDir), ...walkTests(scriptsDir)].sort();
const fastTests = allTests.filter((file) => !INTEGRATION_TESTS.has(file));
const integrationTests = allTests.filter((file) => INTEGRATION_TESTS.has(file));

if (mode === "fast") {
  runNode(["--experimental-strip-types", "--test", ...fastTests], "fast tests");
  runNode([path.join(scriptsDir, "validate-skills.mjs")], "validate-skills");
} else if (mode === "integration") {
  // Run each slow integration file sequentially to avoid subprocess/temp-dir contention.
  for (const file of integrationTests) {
    runNode(["--experimental-strip-types", "--test", file], file);
  }
} else if (mode === "all") {
  runNode(["--experimental-strip-types", "--test", ...fastTests], "fast tests");
  runNode([path.join(scriptsDir, "validate-skills.mjs")], "validate-skills");
  for (const file of integrationTests) {
    runNode(["--experimental-strip-types", "--test", file], file);
  }
} else if (mode === "skills") {
  runNode([path.join(scriptsDir, "validate-skills.mjs")], "validate-skills");
} else if (mode === "skills:profiles") {
  for (const profile of ["work", "personal"]) {
    const res = spawnSync(process.execPath, [path.join(scriptsDir, "validate-skills.mjs")], {
      cwd: agentRoot,
      env: { ...process.env, CHEZMOI_VALIDATE_PROFILE: profile },
      stdio: "inherit",
    });
    if (res.status !== 0) process.exit(res.status ?? 1);
  }
} else {
  process.stderr.write(`Unknown test-runner mode: ${mode}\n`);
  process.exit(2);
}
