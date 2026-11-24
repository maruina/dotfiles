import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const promptsDir = new URL(existsSync(new URL("../exact_prompts", import.meta.url)) ? "../exact_prompts/" : "../prompts/", import.meta.url);
const skillsDir = new URL(existsSync(new URL("../exact_skills", import.meta.url)) ? "../exact_skills/" : "../skills/", import.meta.url);
const prompt = (name) => readFileSync(new URL(`${name}.md`, promptsDir), "utf8");
const skill = (name) => readFileSync(new URL(`${name}/SKILL.md`, skillsDir), "utf8");

test("reviewable-pr-workflow owns the reader check and Jev visual assessment rules", () => {
  const text = skill("reviewable-pr-workflow");
  for (const marker of [
    "## Reader check and visual assessment",
    "a software engineer who has not read the ticket, design, or earlier PRs",
    "start with one concrete scenario",
    "Define subsystem terms when they first matter",
    "Read `explain` and its `references/visual-assessment.md`",
    "Jev assessment",
    "one coherent passage from the drafted PR explanation",
    "Include any definitions or example context needed to understand that passage",
    "not a series of per-paragraph or per-line calls",
    "For follow-up edits to the same draft, reassess only if the reader question, the facts that support the representation, or the set of allowed representations changes",
    "Do not call Jev again for copy edits",
    "use it without calling Jev",
    "GitHub PR body",
    "reader question",
    "destination-supported representations",
    "prose is a valid result",
    "unavailable-assessment fallback",
    "Do not create HTML files or open a browser",
    "`mermaid-best-practices`",
  ]) {
    assert.ok(text.includes(marker), `reviewable-pr-workflow must include ${marker}`);
  }
  const readerCheck = text.indexOf("Read the opening as a software engineer");
  const assessment = text.indexOf("Jev assessment");
  assert.ok(readerCheck >= 0 && readerCheck < assessment, "the reader check must precede assessment");
});

for (const name of ["pr-create", "pr-update"]) {
  test(`${name} applies the reader check and Jev visual assessment before publishing the PR body`, () => {
    const text = prompt(name);
    for (const marker of [
      "## Reader check and visual assessment",
      "reviewable-pr-workflow",
      "explain",
      "references/visual-assessment.md",
      "Jev assessment",
      "`mermaid-best-practices`",
    ]) {
      assert.ok(text.includes(marker), `${name} must include ${marker}`);
    }
    const assessment = text.indexOf("## Reader check and visual assessment");
    const publish = text.indexOf(name === "pr-create" ? "gh pr create --draft" : "gh pr edit <number>");
    assert.ok(assessment >= 0 && assessment < publish, "assessment must precede publication");
  });
}

test("PR updates preserve existing diagrams, tables, and structure with a shrink/deletion guard", () => {
  const text = prompt("pr-update");
  assert.ok(text.includes("reassess existing visuals against the full PR diff"));
  assert.ok(text.includes("Treat all existing Mermaid diagrams, tables, pseudocode blocks, and explanatory subsections"));
  assert.ok(text.includes("surgical section-by-section updates"));
  assert.ok(text.includes("Preserve accurate handwritten visuals"));
  assert.ok(text.includes("update or remove stale generated visuals in place"));
  assert.ok(text.includes("shrink/deletion guard"));
});
