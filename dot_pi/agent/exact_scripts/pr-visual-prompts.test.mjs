import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const promptsDir = new URL(existsSync(new URL("../exact_prompts", import.meta.url)) ? "../exact_prompts/" : "../prompts/", import.meta.url);
const prompt = (name) => readFileSync(new URL(`${name}.md`, promptsDir), "utf8");

for (const name of ["pr-create", "pr-update"]) {
  test(`${name} assesses a drafted passage before publishing the PR body`, () => {
    const text = prompt(name);
    for (const marker of [
      "Read `explain` and its `references/visual-assessment.md`",
      "Jev assessment",
      "one coherent passage from the drafted PR explanation",
      "GitHub PR body",
      "reader question",
      "destination-supported representations",
      "prose is a valid result",
      "unavailable-assessment fallback",
      "Do not create HTML files or open a browser",
      "`mermaid-best-practices`",
    ]) {
      assert.ok(text.includes(marker), `${name} must include ${marker}`);
    }
    const assessment = text.indexOf("Jev assessment");
    const publish = text.indexOf(name === "pr-create" ? "gh pr create --draft" : "gh pr edit <number>");
    assert.ok(assessment < publish, "assessment must precede publication");
  });
}

test("PR updates reassess existing visuals without discarding accurate handwritten content", () => {
  const text = prompt("pr-update");
  assert.ok(text.includes("reassess existing visuals against the full PR diff"));
  assert.ok(text.includes("Preserve accurate handwritten visuals"));
  assert.ok(text.includes("update or remove stale generated visuals in place"));
});
