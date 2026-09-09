import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { parseExecuteMarker, parseVerifyVerdict } from "./_markers.ts";

describe("parseExecuteMarker", () => {
  it("parses a marker with a parenthesized model name", () => {
    const text = [
      "Some report content.",
      "Implementation model: `GLM-5.3 (Baseten) (baseten/zai-org/GLM-5.3)`",
      "",
      "1. Run /model and select a different model.",
    ].join("\n");
    assert.deepEqual(parseExecuteMarker(text), {
      name: "GLM-5.3 (Baseten)",
      id: "baseten/zai-org/GLM-5.3",
    });
  });

  it("returns the last matching marker when several exist", () => {
    const text = [
      "Implementation model: `Old (x) (a/b)`",
      "Implementation model: `GLM-5.3 (Baseten) (baseten/zai-org/GLM-5.3)`",
    ].join("\n");
    assert.deepEqual(parseExecuteMarker(text), {
      name: "GLM-5.3 (Baseten)",
      id: "baseten/zai-org/GLM-5.3",
    });
  });

  it("returns undefined when the marker is absent", () => {
    assert.equal(parseExecuteMarker("no handoff marker here"), undefined);
  });

  it("returns undefined for malformed markers", () => {
    assert.equal(parseExecuteMarker("Implementation model: GLM-5.3 (baseten/zai-org/GLM-5.3)"), undefined);
    assert.equal(parseExecuteMarker("Implementation model: `GLM-5.3`"), undefined);
  });
});

describe("parseVerifyVerdict", () => {
  const report = (verdict: string) =>
    [
      "## Target and scope",
      "worktree, branch, HEAD",
      "## Risk and review",
      "behavior classification",
      "## Fresh evidence",
      "commands and results",
      "## Skills loaded and used",
      "table",
      "## Findings",
      "none",
      "## State comparison",
      "match",
      "## Next action",
      "none",
      verdict,
    ].join("\n");

  it("parses VERIFIED as the last line of a 7-section report", () => {
    assert.equal(parseVerifyVerdict(report("VERIFIED")), "VERIFIED");
  });

  it("parses BLOCKED as the last line", () => {
    assert.equal(parseVerifyVerdict(report("BLOCKED")), "BLOCKED");
  });

  it("ignores trailing blank lines", () => {
    assert.equal(parseVerifyVerdict(report("VERIFIED") + "\n\n"), "VERIFIED");
  });

  it("returns undefined when the verdict is absent", () => {
    assert.equal(parseVerifyVerdict(report("no verdict reached")), undefined);
  });

  it("does not count a mid-message verdict line", () => {
    const text = report("VERIFIED") + "\n## Next action\nRun /verify again";
    assert.equal(parseVerifyVerdict(text), undefined);
  });

  it("does not count lowercase verdicts", () => {
    assert.equal(parseVerifyVerdict(report("verified")), undefined);
  });

  it("does not count an embedded verdict on the last line", () => {
    assert.equal(parseVerifyVerdict(report("Verdict: VERIFIED")), undefined);
  });
});
