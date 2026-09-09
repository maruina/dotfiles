import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  buildExecuteArguments,
  buildVerifyArguments,
  expandPrompt,
  stripFrontmatter,
} from "./_prompts.ts";

describe("stripFrontmatter", () => {
  it("strips a leading YAML frontmatter block", () => {
    const template = "---\ndescription: Execute a plan\nargument-hint: \"[path]\"\n---\n# Execute\nbody";
    assert.equal(stripFrontmatter(template), "# Execute\nbody");
  });

  it("leaves text without frontmatter untouched", () => {
    assert.equal(stripFrontmatter("# Execute\nbody"), "# Execute\nbody");
  });

  it("leaves an unterminated frontmatter block untouched", () => {
    const template = "---\ndescription: x\nno closing marker";
    assert.equal(stripFrontmatter(template), template);
  });
});

describe("expandPrompt", () => {
  it("substitutes only $ARGUMENTS and leaves $GLOB untouched", () => {
    const template = [
      "---",
      "description: x",
      "---",
      "# Execute",
      "Execution input:",
      "",
      "> $ARGUMENTS",
      "",
      "Use the `resolve-worktree` skill with `$GLOB = **/plans/*/plan.md`.",
    ].join("\n");
    const expanded = expandPrompt(template, "/abs/plans/feat/plan.md");
    assert.ok(expanded.startsWith("# Execute"));
    assert.ok(expanded.includes("> /abs/plans/feat/plan.md"));
    assert.ok(expanded.includes("$GLOB = **/plans/*/plan.md"));
    assert.ok(!expanded.includes("---"));
    assert.ok(!expanded.includes("$ARGUMENTS"));
  });

  it("builds execute arguments as the absolute plan path", () => {
    assert.equal(buildExecuteArguments("/abs/plans/feat/plan.md"), "/abs/plans/feat/plan.md");
  });

  it("builds verify arguments with the implemented-by id", () => {
    assert.equal(
      buildVerifyArguments("/abs/plans/feat/plan.md", "baseten/zai-org/GLM-5.3"),
      "/abs/plans/feat/plan.md --implemented-by baseten/zai-org/GLM-5.3",
    );
  });
});
