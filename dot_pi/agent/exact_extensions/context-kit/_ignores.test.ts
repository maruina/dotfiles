import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  isIgnored,
  loadAgentsIgnore,
  loadRuleIgnore,
  loadSkillIgnore,
} from "./_ignores.ts";

describe("ignore-file loaders", () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "context-kit-ignores-"));
    mkdirSync(join(cwd, ".pi"), { recursive: true });
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it("returns null when the ignore file is absent", () => {
    assert.equal(loadAgentsIgnore(cwd), null);
    assert.equal(loadRuleIgnore(cwd), null);
    assert.equal(loadSkillIgnore(cwd), null);
  });

  it("loads patterns from .pi/agentsignore", () => {
    writeFileSync(join(cwd, ".pi/agentsignore"), "subdir/AGENTS.md\n");
    const m = loadAgentsIgnore(cwd);
    assert.ok(m, "matcher should be loaded");
    assert.equal(isIgnored(m, join(cwd, "subdir/AGENTS.md"), cwd), true);
    assert.equal(isIgnored(m, join(cwd, "other/AGENTS.md"), cwd), false);
  });

  it("loads patterns from .pi/ruleignore", () => {
    writeFileSync(join(cwd, ".pi/ruleignore"), ".claude/rules/architecture.md\n");
    const m = loadRuleIgnore(cwd);
    assert.ok(m);
    assert.equal(isIgnored(m, join(cwd, ".claude/rules/architecture.md"), cwd), true);
    assert.equal(isIgnored(m, join(cwd, ".claude/rules/other.md"), cwd), false);
  });

  it("loads patterns from .pi/skillignore (kept for existing config)", () => {
    writeFileSync(join(cwd, ".pi/skillignore"), ".agents/skills/team-conventions/\n");
    const m = loadSkillIgnore(cwd);
    assert.ok(m);
    assert.equal(isIgnored(m, join(cwd, ".agents/skills/team-conventions/SKILL.md"), cwd), true);
    assert.equal(isIgnored(m, join(cwd, ".agents/skills/other/SKILL.md"), cwd), false);
  });
});

describe("isIgnored", () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "context-kit-isignored-"));
    mkdirSync(join(cwd, ".pi"), { recursive: true });
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it("returns false when matcher is null", () => {
    assert.equal(isIgnored(null, join(cwd, "AGENTS.md"), cwd), false);
  });

  it("returns false for paths outside cwd, even if patterns would match", () => {
    writeFileSync(join(cwd, ".pi/agentsignore"), "**/AGENTS.md\n");
    const m = loadAgentsIgnore(cwd);
    assert.equal(isIgnored(m, "/elsewhere/AGENTS.md", cwd), false);
  });

  it("honours negations (gitignore-style allow-after-deny)", () => {
    // Per gitignore semantics, once a parent directory is excluded, files
    // under it can't be re-included. To deny-by-default with an exception,
    // use `*` (one-level) on the parent and negate the specific subdir.
    writeFileSync(
      join(cwd, ".pi/skillignore"),
      [".agents/skills/*", "!.agents/skills/team-conventions"].join("\n"),
    );
    const m = loadSkillIgnore(cwd);
    assert.ok(m);
    assert.equal(isIgnored(m, join(cwd, ".agents/skills/random/SKILL.md"), cwd), true);
    assert.equal(isIgnored(m, join(cwd, ".agents/skills/team-conventions/SKILL.md"), cwd), false);
  });
});
