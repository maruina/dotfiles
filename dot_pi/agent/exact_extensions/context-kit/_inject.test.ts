import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { exciseContextBlock, injectContextBlocks, pruneEmptySection } from "./_inject.ts";

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

describe("injectContextBlocks", () => {
  it("is a no-op when blocks is empty", () => {
    assert.equal(injectContextBlocks(promptWithSection, []), promptWithSection);
  });

  it("inserts blocks inside an existing # Project Context section, right after the preamble", () => {
    const out = injectContextBlocks(promptWithSection, [
      { heading: "/repo/sub/AGENTS.md", content: "Sub content." },
    ]);

    // The new block lives after `Project-specific instructions and guidelines:\n\n`
    // and BEFORE Pi's startup-loaded `## /repo/AGENTS.md` block.
    const preamble = "Project-specific instructions and guidelines:\n\n";
    const subBlock = "## /repo/sub/AGENTS.md\n\nSub content.\n\n";
    const startupBlock = "## /repo/AGENTS.md\n\nRoot-level content.";
    const preambleIdx = out.indexOf(preamble);
    const subBlockIdx = out.indexOf(subBlock);
    const startupBlockIdx = out.indexOf(startupBlock);
    assert.ok(preambleIdx !== -1, "preamble missing");
    assert.ok(subBlockIdx !== -1, "injected block missing");
    assert.ok(startupBlockIdx !== -1, "startup block missing");
    assert.ok(subBlockIdx > preambleIdx, "injected block must follow preamble");
    assert.ok(subBlockIdx < startupBlockIdx, "injected block must precede startup-loaded block");
  });

  it("keeps Current date/cwd footer at the very end after injection", () => {
    const out = injectContextBlocks(promptWithSection, [
      { heading: "/repo/sub/AGENTS.md", content: "Sub content." },
    ]);
    const lines = out.split("\n");
    assert.match(lines[lines.length - 1] ?? "", /^Current working directory:/);
    assert.match(lines[lines.length - 2] ?? "", /^Current date:/);
  });

  it("builds a fresh # Project Context section before the date footer when none exists", () => {
    const out = injectContextBlocks(promptWithoutSection, [
      { heading: "/repo/sub/AGENTS.md", content: "Sub content." },
    ]);
    assert.ok(out.includes("# Project Context\n\nProject-specific instructions and guidelines:\n\n"));
    assert.ok(out.includes("## /repo/sub/AGENTS.md\n\nSub content.\n\n"));
    // Section must precede the date footer.
    assert.ok(out.indexOf("# Project Context") < out.indexOf("Current date:"));
  });

  it("concatenates multiple blocks with the standard separator", () => {
    const out = injectContextBlocks(promptWithoutSection, [
      { heading: "/a/AGENTS.md", content: "A" },
      { heading: "/b/AGENTS.md", content: "B" },
    ]);
    assert.ok(out.includes("## /a/AGENTS.md\n\nA\n\n## /b/AGENTS.md\n\nB\n\n"));
  });

  it("trims trailing whitespace off content but preserves the block separator", () => {
    const out = injectContextBlocks(promptWithoutSection, [
      { heading: "/a/AGENTS.md", content: "A\n\n\n" },
    ]);
    assert.ok(out.includes("## /a/AGENTS.md\n\nA\n\n"));
    assert.ok(!out.includes("A\n\n\n\n"));
  });

  it("splices insertAfter blocks immediately after the named Pi-loaded block", () => {
    // Pi emits: `## ${filePath}\n\n${content}\n\n`. Use a content with trailing newline
    // (typical of real files) to verify the anchor includes Pi's verbatim emit.
    const out = injectContextBlocks(promptWithSection, [
      {
        heading: "/repo/AGENTS.local.md",
        content: "Local additions.",
        insertAfter: { filePath: "/repo/AGENTS.md", fileContent: "Root-level content." },
      },
    ]);

    // The local block lands immediately after the matching base block, before the date footer.
    const baseBlock = "## /repo/AGENTS.md\n\nRoot-level content.\n\n";
    const localBlock = "## /repo/AGENTS.local.md\n\nLocal additions.\n\n";
    const baseIdx = out.indexOf(baseBlock);
    const localIdx = out.indexOf(localBlock);
    const dateIdx = out.indexOf("Current date:");
    assert.ok(baseIdx !== -1, "base block missing");
    assert.ok(localIdx !== -1, "local block missing");
    assert.equal(localIdx, baseIdx + baseBlock.length, "local block should be immediately after base");
    assert.ok(localIdx < dateIdx, "local block should precede date footer");
  });

  it("falls back to top-of-section splice when insertAfter anchor is missing", () => {
    // Anchor refers to a file Pi didn't load — we shouldn't silently drop the block.
    const out = injectContextBlocks(promptWithSection, [
      {
        heading: "/repo/AGENTS.local.md",
        content: "Local additions.",
        insertAfter: { filePath: "/repo/MISSING.md", fileContent: "never loaded" },
      },
    ]);
    // The block still appears — just at the top of the section, not after the missing anchor.
    assert.ok(out.includes("## /repo/AGENTS.local.md\n\nLocal additions.\n\n"));
    // And it lands inside the section, before the existing Pi-loaded block.
    const preambleIdx = out.indexOf("Project-specific instructions and guidelines:\n\n");
    const localIdx = out.indexOf("## /repo/AGENTS.local.md");
    const startupIdx = out.indexOf("## /repo/AGENTS.md");
    assert.ok(localIdx > preambleIdx);
    assert.ok(localIdx < startupIdx);
  });

  it("survives content with trailing newlines on insertAfter anchor (Pi emits content verbatim)", () => {
    // Simulate Pi's verbatim emit: file content is "Root.\n", Pi emits
    // `## /repo/AGENTS.md\n\nRoot.\n\n\n` (three trailing newlines after Root.).
    const promptWithNewlineTrailedContent = [
      "You are an expert coding assistant...",
      "",
      "# Project Context",
      "",
      "Project-specific instructions and guidelines:",
      "",
      "## /repo/AGENTS.md",
      "",
      "Root.",
      "", // content's own trailing newline
      "", // Pi's `\n\n` separator
      "Current date: 2026-05-13",
      "Current working directory: /repo",
    ].join("\n");

    const out = injectContextBlocks(promptWithNewlineTrailedContent, [
      {
        heading: "/repo/AGENTS.local.md",
        content: "Local.",
        insertAfter: { filePath: "/repo/AGENTS.md", fileContent: "Root.\n" },
      },
    ]);
    assert.ok(out.includes("## /repo/AGENTS.local.md\n\nLocal.\n\n"));
  });

  it("composes insertAfter and top splices in a single call", () => {
    const out = injectContextBlocks(promptWithSection, [
      // Sub-dir base (top splice)
      { heading: "/repo/sub/AGENTS.md", content: "Sub content." },
      // Sub-dir local sibling — also top splice (no Pi-loaded anchor for it).
      { heading: "/repo/sub/AGENTS.local.md", content: "Sub-local content." },
      // Ancestor local — anchored after Pi-loaded /repo/AGENTS.md.
      {
        heading: "/repo/AGENTS.local.md",
        content: "Ancestor-local.",
        insertAfter: { filePath: "/repo/AGENTS.md", fileContent: "Root-level content." },
      },
    ]);

    // The ancestor-local block sits right after the Pi-loaded base.
    const baseEndIdx = out.indexOf("## /repo/AGENTS.md\n\nRoot-level content.\n\n");
    const ancestorLocalIdx = out.indexOf("## /repo/AGENTS.local.md\n\nAncestor-local.\n\n");
    assert.ok(baseEndIdx !== -1 && ancestorLocalIdx !== -1);
    assert.equal(
      ancestorLocalIdx,
      baseEndIdx + "## /repo/AGENTS.md\n\nRoot-level content.\n\n".length,
    );

    // The subdir blocks are at top of section.
    const subBaseIdx = out.indexOf("## /repo/sub/AGENTS.md\n\nSub content.\n\n");
    const subLocalIdx = out.indexOf("## /repo/sub/AGENTS.local.md\n\nSub-local content.\n\n");
    assert.ok(subBaseIdx !== -1 && subLocalIdx !== -1);
    assert.ok(subBaseIdx < baseEndIdx, "subdir base should come before Pi-loaded base");
    assert.ok(subLocalIdx > subBaseIdx, "subdir local should follow subdir base in input order");
  });
});

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
