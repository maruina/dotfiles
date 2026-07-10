import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { parseGitStatusPorcelainZ } from "./_git.ts";

describe("parseGitStatusPorcelainZ", () => {
  it("parses modified and untracked paths", () => {
    assert.deepEqual(parseGitStatusPorcelainZ(" M changed.txt\0?? new.txt\0"), [
      { status: "M", path: "changed.txt" },
      { status: "??", path: "new.txt" },
    ]);
  });

  it("uses the current path for renamed files", () => {
    assert.deepEqual(parseGitStatusPorcelainZ("R  new.txt\0old.txt\0"), [
      { status: "R", path: "new.txt" },
    ]);
  });

  it("uses the current path for copied files", () => {
    assert.deepEqual(parseGitStatusPorcelainZ("C  copy.txt\0source.txt\0"), [
      { status: "C", path: "copy.txt" },
    ]);
  });

  it("skips malformed entries", () => {
    assert.deepEqual(parseGitStatusPorcelainZ("x\0 M ok.txt\0"), [
      { status: "M", path: "ok.txt" },
    ]);
  });
});
