import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { findLocalSibling, walkUpForAgents } from "./_agents.ts";

describe("walkUpForAgents", () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "context-kit-walk-"));
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  const write = (relPath: string, content = "x") => {
    const full = join(cwd, relPath);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  };

  it("returns AGENTS.md and CLAUDE.md found between startDir (inclusive) and cwd (exclusive), shallowest-first", () => {
    write("a/AGENTS.md");
    write("a/b/CLAUDE.md");
    write("a/b/c/AGENTS.md");

    const result = walkUpForAgents(join(cwd, "a/b/c"), cwd);
    assert.deepEqual(result, [
      join(cwd, "a/AGENTS.md"),
      join(cwd, "a/b/CLAUDE.md"),
      join(cwd, "a/b/c/AGENTS.md"),
    ]);
  });

  it("stops at cwd (does not include cwd's own context files — Pi already loaded them)", () => {
    write("AGENTS.md");
    write("CLAUDE.md");
    write("a/AGENTS.md");

    const result = walkUpForAgents(join(cwd, "a"), cwd);
    assert.deepEqual(result, [join(cwd, "a/AGENTS.md")]);
  });

  it("returns empty when startDir == cwd", () => {
    write("AGENTS.md");
    const result = walkUpForAgents(cwd, cwd);
    assert.deepEqual(result, []);
  });

  it("returns empty when startDir is outside cwd", () => {
    write("AGENTS.md");
    const elsewhere = mkdtempSync(join(tmpdir(), "context-kit-walk-out-"));
    try {
      const result = walkUpForAgents(elsewhere, cwd);
      assert.deepEqual(result, []);
    } finally {
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  it("skips directories with no context file", () => {
    write("a/b/AGENTS.md");
    // No context file at a/ — walk-up should still find a/b/AGENTS.md.
    const result = walkUpForAgents(join(cwd, "a/b/c"), cwd);
    assert.deepEqual(result, [join(cwd, "a/b/AGENTS.md")]);
  });

  it("returns AGENTS.md before CLAUDE.md in the same directory", () => {
    write("a/AGENTS.md");
    write("a/CLAUDE.md");

    const result = walkUpForAgents(join(cwd, "a"), cwd);
    assert.deepEqual(result, [join(cwd, "a/AGENTS.md"), join(cwd, "a/CLAUDE.md")]);
  });
});

describe("findLocalSibling", () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "context-kit-sibling-"));
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it("returns AGENTS.local.md path when sibling exists", () => {
    writeFileSync(join(cwd, "AGENTS.md"), "base");
    writeFileSync(join(cwd, "AGENTS.local.md"), "local");
    assert.equal(findLocalSibling(join(cwd, "AGENTS.md")), join(cwd, "AGENTS.local.md"));
  });

  it("returns null when sibling does not exist", () => {
    writeFileSync(join(cwd, "AGENTS.md"), "base");
    assert.equal(findLocalSibling(join(cwd, "AGENTS.md")), null);
  });

  it("derives CLAUDE.local.md for a CLAUDE.md base", () => {
    writeFileSync(join(cwd, "CLAUDE.md"), "base");
    writeFileSync(join(cwd, "CLAUDE.local.md"), "local");
    assert.equal(findLocalSibling(join(cwd, "CLAUDE.md")), join(cwd, "CLAUDE.local.md"));
  });

  it("returns null when the input file is itself an .local.md (no recursive siblings)", () => {
    writeFileSync(join(cwd, "AGENTS.local.md"), "local");
    assert.equal(findLocalSibling(join(cwd, "AGENTS.local.md")), null);
  });

  it("returns null for unrecognised filenames", () => {
    writeFileSync(join(cwd, "notes.txt"), "x");
    assert.equal(findLocalSibling(join(cwd, "notes.txt")), null);
  });
});
