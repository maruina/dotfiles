import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { buildStagePrompt, parseSinglePlanArgument, quoteNativeArgument } from "./_prompts.ts";

describe("parseSinglePlanArgument", () => {
  it("accepts one path with native single- or double-quote syntax", () => {
    assert.deepEqual(parseSinglePlanArgument("plans/feature/plan.md"), { ok: true, planPath: "plans/feature/plan.md" });
    assert.deepEqual(parseSinglePlanArgument('"plans/feature/plan with spaces.md"'), { ok: true, planPath: "plans/feature/plan with spaces.md" });
  });

  it("rejects missing, extra, empty, and unterminated arguments", () => {
    for (const input of ["", "  ", "one.md two.md", "''", "'unterminated", '"unterminated']) {
      assert.equal(parseSinglePlanArgument(input).ok, false, JSON.stringify(input));
    }
  });

  it("preserves embedded quote characters using native delimiter changes", () => {
    const value = `plans/a's "quoted" plan.md`;
    const result = parseSinglePlanArgument(quoteNativeArgument(value));
    assert.deepEqual(result, { ok: true, planPath: value });
  });

  it("rejects path control characters", () => {
    assert.equal(parseSinglePlanArgument("'plans/with\nnewline.md'").ok, false);
  });
});

describe("buildStagePrompt", () => {
  it("dispatches the native template with only the absolute plan path", () => {
    assert.equal(buildStagePrompt("execute", "/repo/plans/feature/plan with spaces.md"), "/execute '/repo/plans/feature/plan with spaces.md'");
    assert.throws(() => buildStagePrompt("verify", "plans/feature/plan.md"), /absolute plan path/);
  });

  it("preserves writer identities in native simplify and verify dispatch", () => {
    const writers = { implementedBy: "fixture/writer-a", simplifiedBy: "fixture/writer-b" };
    assert.equal(
      buildStagePrompt("simplify", "/repo/plan.md", writers),
      "/simplify '/repo/plan.md' --implemented-by 'fixture/writer-a'",
    );
    assert.equal(
      buildStagePrompt("verify", "/repo/plan.md", writers),
      "/verify '/repo/plan.md' --implemented-by 'fixture/writer-a' --simplified-by 'fixture/writer-b'",
    );
    assert.throws(() => buildStagePrompt("simplify", "/repo/plan.md"), /implementation model identity/);
    assert.throws(() => buildStagePrompt("verify", "/repo/plan.md", { implementedBy: "writer", simplifiedBy: "" }), /simplification model identity/);
  });

  it("round-trips quote characters through Pi-native command argument rules", () => {
    const path = `/repo/plans/${`a'b"c`}.md`;
    const prompt = buildStagePrompt("simplify", path, { implementedBy: "fixture/writer-a", simplifiedBy: "fixture/writer-b" });
    assert.ok(prompt.startsWith(`/simplify ${quoteNativeArgument(path)} --implemented-by `));
    const parsed = parseSinglePlanArgument(prompt.slice("/simplify ".length).split(" --implemented-by ")[0]!);
    assert.deepEqual(parsed, { ok: true, planPath: path });
  });
});
