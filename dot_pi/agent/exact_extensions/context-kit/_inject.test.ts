import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { exciseContextBlock, pruneEmptySection } from "./_inject.ts";

const promptWithSection = [
  "You are an expert coding assistant...",
  "",
  "# Project Context",
  "",
  "Project-specific instructions and guidelines:",
  "",
  "## /repo/AGENTS.md",
  "",
  "Root-level content.",
  "",
  "",
  "Current date: 2026-05-13",
  "Current working directory: /repo",
].join("\n");

const promptWithoutSection = [
  "You are an expert coding assistant...",
  "",
  "",
  "Current date: 2026-05-13",
  "Current working directory: /repo",
].join("\n");

describe("exciseContextBlock", () => {
  it("removes the exact `## ${path}\\n\\n${content}\\n\\n` block from the prompt", () => {
    const out = exciseContextBlock(promptWithSection, "/repo/AGENTS.md", "Root-level content.");
    assert.ok(!out.includes("## /repo/AGENTS.md"));
    assert.ok(!out.includes("Root-level content."));
    // Surrounding context is preserved.
    assert.ok(out.includes("Project-specific instructions and guidelines:"));
    assert.ok(out.includes("Current date:"));
  });

  it("returns the prompt unchanged when the block isn't found", () => {
    const out = exciseContextBlock(promptWithSection, "/repo/MISSING.md", "never present");
    assert.equal(out, promptWithSection);
  });

  it("handles content with trailing newlines (Pi's verbatim emit)", () => {
    const promptVariant = [
      "You are an expert coding assistant...",
      "",
      "# Project Context",
      "",
      "Project-specific instructions and guidelines:",
      "",
      "## /repo/AGENTS.md",
      "",
      "Root.",
      "",
      "",
      "Current date: 2026-05-13",
      "Current working directory: /repo",
    ].join("\n");
    const out = exciseContextBlock(promptVariant, "/repo/AGENTS.md", "Root.\n");
    assert.ok(!out.includes("## /repo/AGENTS.md"));
    assert.ok(!out.includes("Root."));
  });
});

describe("pruneEmptySection", () => {
  it("strips the section when no `## ` blocks remain under the preamble", () => {
    // Build a prompt where the section has a base block, then excise it.
    let prompt = promptWithSection;
    prompt = exciseContextBlock(prompt, "/repo/AGENTS.md", "Root-level content.");
    // Now the section exists but is empty.
    assert.ok(prompt.includes("# Project Context"));
    const pruned = pruneEmptySection(prompt);
    assert.ok(!pruned.includes("# Project Context"));
    assert.ok(!pruned.includes("Project-specific instructions and guidelines:"));
    // Date footer must still be at the end.
    assert.match(pruned, /Current date:.*\nCurrent working directory:/);
  });

  it("leaves a non-empty section alone", () => {
    assert.equal(pruneEmptySection(promptWithSection), promptWithSection);
  });

  it("is a no-op when there is no Project Context section", () => {
    assert.equal(pruneEmptySection(promptWithoutSection), promptWithoutSection);
  });
});
