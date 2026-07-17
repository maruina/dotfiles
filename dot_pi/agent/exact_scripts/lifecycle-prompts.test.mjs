import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const agentDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const promptsDir = existsSync(path.join(agentDir, "exact_prompts"))
  ? path.join(agentDir, "exact_prompts")
  : path.join(agentDir, "prompts");

function prompt(name) {
  return readFileSync(path.join(promptsDir, name), "utf8");
}

function requireMarkers(text, markers) {
  for (const marker of markers) assert.match(text, marker);
}

const skillRecordMarkers = [
  /Skills loaded and used/,
  /Skill \| Source \| Why loaded \| How used/,
  /skill-loader.*prompt-required.*user-requested.*agent-selected/is,
  /feedback for improving `skill-loader`/i,
];

test("brainstorm records skill provenance before approval and in design specs", () => {
  const text = prompt("brainstorm.md");

  requireMarkers(text, [
    ...skillRecordMarkers,
    /alignment brief.*must include `Skills loaded and used`/is,
    /durable design spec.*must include `Skills loaded and used`/is,
    /`## Skills loaded and used`/,
  ]);
});

test("plan records skill provenance before approval and in durable plans", () => {
  const text = prompt("plan.md");

  requireMarkers(text, [
    ...skillRecordMarkers,
    /planning alignment brief.*must include `Skills loaded and used`/is,
    /durable plan.*must include `Skills loaded and used`/is,
    /## Skills loaded and used/,
  ]);
});

test("downstream lifecycle stages preserve or report skill provenance", () => {
  const execute = prompt("execute.md");
  requireMarkers(execute, [
    ...skillRecordMarkers,
    /`### Execution` subsection under `## Skills loaded and used`/,
    /source, loading reason, and effect on execution/i,
  ]);

  for (const file of ["systematic-review.md", "verify.md"]) {
    const text = prompt(file);
    requireMarkers(text, [
      ...skillRecordMarkers,
      /\*\*Skills loaded and used:?\*\*/,
    ]);
  }
});

test("simplify and PR review report skill provenance", () => {
  for (const file of ["simplify.md", "pr-review.md"]) {
    const text = prompt(file);
    requireMarkers(text, [
      ...skillRecordMarkers,
      /\*\*Skills loaded and used\*\*|## Skills loaded and used/,
    ]);
  }

  assert.match(prompt("pr-review.md"), /domain rules are `prompt-required`/i);
});

test("PR prompts make reviewer guides topic-ordered rather than commit logs", () => {
  for (const file of ["pr-create.md", "pr-update.md"]) {
    const text = prompt(file);
    requireMarkers(text, [
      /topic-ordered narrative/i,
      /not a chronological commit log/i,
      /multiple commits/i,
      /merge-only, generated, mechanical, lint-only, superseded/i,
      /\| # \| Topic \| Commits \| Files \| What to look for \|/,
    ]);
  }
});
