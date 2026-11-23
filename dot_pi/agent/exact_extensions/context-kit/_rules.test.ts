import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { findMatchingRules, parseFrontmatter } from "./_rules.ts";

describe("parseFrontmatter", () => {
  it("parses empty, Claude YAML lists, Cursor globs, alwaysApply, quotes, and description", () => {
    assert.deepEqual(parseFrontmatter("# Just a heading\n\nSome content"), {});
    assert.deepEqual(
      parseFrontmatter(["---", "paths:", "  - src/api/**/*.ts", "  - lib/**/*.ts", "---", "body"].join("\n")).paths,
      ["src/api/**/*.ts", "lib/**/*.ts"],
    );
    const single = parseFrontmatter(["---", "globs: src/components/**/*.tsx", "alwaysApply: false", "---", "body"].join("\n"));
    assert.deepEqual(single.globs, ["src/components/**/*.tsx"]);
    assert.equal(single.alwaysApply, false);
    assert.deepEqual(
      parseFrontmatter(["---", "globs: src/**/*.ts, src/**/*.tsx", "---", "body"].join("\n")).globs,
      ["src/**/*.ts", "src/**/*.tsx"],
    );
    assert.deepEqual(
      parseFrontmatter(["---", "globs: [a/**/*.ts, b/**/*.ts]", "---", "body"].join("\n")).globs,
      ["a/**/*.ts", "b/**/*.ts"],
    );
    assert.equal(parseFrontmatter(["---", "alwaysApply: true", "---", "body"].join("\n")).alwaysApply, true);
    assert.deepEqual(parseFrontmatter(["---", 'globs: "src/**/*.ts"', "---", "body"].join("\n")).globs, ["src/**/*.ts"]);
    const desc = parseFrontmatter(["---", "description: RPC service conventions and patterns", "globs: src/services/**/*.ts", "alwaysApply: false", "---", "body"].join("\n"));
    assert.equal(desc.description, "RPC service conventions and patterns");
    assert.deepEqual(desc.globs, ["src/services/**/*.ts"]);
  });
});

describe("findMatchingRules", () => {
  let cwd: string;
  let home: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "agents-discover-cwd-"));
    home = mkdtempSync(join(tmpdir(), "agents-discover-home-"));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  const writeRule = (path: string, contents: string) => {
    mkdirSync(join(cwd, ...path.split("/").slice(0, -1)), { recursive: true });
    writeFileSync(join(cwd, path), contents);
  };

  it("matches Claude rules with a matching paths glob and returns matched pattern", () => {
    writeRule(
      ".claude/rules/api.md",
      ["---", "paths:", "  - src/api/**/*.ts", "  - lib/**/*.ts", "---", "rule body"].join("\n"),
    );

    const matches = findMatchingRules({
      filePath: join(cwd, "src/api/handlers/user.ts"),
      cwd,
      sources: [{ dir: join(cwd, ".claude/rules"), kind: "claude" }],
    });
    assert.equal(matches.length, 1);
    assert.equal(matches[0]!.path, join(cwd, ".claude/rules/api.md"));
    assert.deepEqual(matches[0]!.matchedPatterns, ["src/api/**/*.ts"]);
    assert.equal(matches[0]!.kind, "claude");
    assert.equal(matches[0]!.description, undefined);
  });

  it("returns Cursor description on match", () => {
    writeRule(
      ".cursor/rules/services.mdc",
      [
        "---",
        "description: RPC service conventions",
        "globs: src/services/**/*.ts",
        "---",
        "body",
      ].join("\n"),
    );

    const matches = findMatchingRules({
      filePath: join(cwd, "src/services/user.ts"),
      cwd,
      sources: [{ dir: join(cwd, ".cursor/rules"), kind: "cursor" }],
    });
    assert.equal(matches.length, 1);
    assert.equal(matches[0]!.description, "RPC service conventions");
  });

  it("skips Claude rules with no paths field (alwaysApply or no frontmatter)", () => {
    writeRule(".claude/rules/style.md", "# Style rule with no frontmatter");
    writeRule(
      ".claude/rules/always.md",
      ["---", "alwaysApply: true", "---", "always-applied rule"].join("\n"),
    );

    const matches = findMatchingRules({
      filePath: join(cwd, "src/api/handlers/user.ts"),
      cwd,
      sources: [{ dir: join(cwd, ".claude/rules"), kind: "claude" }],
    });
    assert.deepEqual(matches, []);
  });

  it("matches Cursor rules with a matching globs pattern", () => {
    writeRule(
      ".cursor/rules/components.mdc",
      [
        "---",
        "globs: src/components/**/*.tsx",
        "alwaysApply: false",
        "---",
        "component rule",
      ].join("\n"),
    );

    const matches = findMatchingRules({
      filePath: join(cwd, "src/components/Button.tsx"),
      cwd,
      sources: [{ dir: join(cwd, ".cursor/rules"), kind: "cursor" }],
    });
    assert.equal(matches.length, 1);
    assert.equal(matches[0]!.path, join(cwd, ".cursor/rules/components.mdc"));
    assert.deepEqual(matches[0]!.matchedPatterns, ["src/components/**/*.tsx"]);
  });

  it("does not match when globs miss", () => {
    writeRule(
      ".cursor/rules/components.mdc",
      ["---", "globs: src/components/**/*.tsx", "---", "rule"].join("\n"),
    );

    const matches = findMatchingRules({
      filePath: join(cwd, "src/api/user.ts"),
      cwd,
      sources: [{ dir: join(cwd, ".cursor/rules"), kind: "cursor" }],
    });
    assert.deepEqual(matches, []);
  });

  it("matches against any pattern in a comma-separated globs list", () => {
    writeRule(
      ".cursor/rules/multi.mdc",
      ["---", "globs: src/**/*.ts, tests/**/*.ts", "---", "rule"].join("\n"),
    );

    const matchesA = findMatchingRules({
      filePath: join(cwd, "src/foo.ts"),
      cwd,
      sources: [{ dir: join(cwd, ".cursor/rules"), kind: "cursor" }],
    });
    const matchesB = findMatchingRules({
      filePath: join(cwd, "tests/foo.ts"),
      cwd,
      sources: [{ dir: join(cwd, ".cursor/rules"), kind: "cursor" }],
    });
    assert.equal(matchesA.length, 1);
    assert.equal(matchesB.length, 1);
  });

  it("recurses into subdirectories of the rules dir", () => {
    writeRule(
      ".cursor/rules/frontend/buttons.mdc",
      ["---", "globs: src/components/Button.tsx", "---", "rule"].join("\n"),
    );

    const matches = findMatchingRules({
      filePath: join(cwd, "src/components/Button.tsx"),
      cwd,
      sources: [{ dir: join(cwd, ".cursor/rules"), kind: "cursor" }],
    });
    assert.equal(matches.length, 1);
    assert.equal(matches[0]!.path, join(cwd, ".cursor/rules/frontend/buttons.mdc"));
  });

  it("ignores files outside cwd", () => {
    writeRule(
      ".claude/rules/api.md",
      ["---", "paths:", "  - '**/*.ts'", "---", "rule"].join("\n"),
    );

    const matches = findMatchingRules({
      filePath: "/some/other/path/file.ts",
      cwd,
      sources: [{ dir: join(cwd, ".claude/rules"), kind: "claude" }],
    });
    assert.deepEqual(matches, []);
  });

  it("invalidates cached frontmatter when a rule file mtime changes", () => {
    const rulePath = join(cwd, ".cursor/rules/cache.mdc");
    writeRule(
      ".cursor/rules/cache.mdc",
      ["---", "globs: src/**/*.ts", "---", "rule"].join("\n"),
    );

    const sources = [{ dir: join(cwd, ".cursor/rules"), kind: "cursor" as const }];
    assert.equal(findMatchingRules({ filePath: join(cwd, "src/foo.ts"), cwd, sources }).length, 1);

    writeFileSync(rulePath, ["---", "globs: tests/**/*.ts", "---", "rule"].join("\n"));
    const future = new Date(Date.now() + 10_000);
    utimesSync(rulePath, future, future);

    assert.deepEqual(findMatchingRules({ filePath: join(cwd, "src/foo.ts"), cwd, sources }), []);
    assert.equal(findMatchingRules({ filePath: join(cwd, "tests/foo.ts"), cwd, sources }).length, 1);
  });

  it("returns empty when rules dir doesn't exist", () => {
    const matches = findMatchingRules({
      filePath: join(cwd, "src/foo.ts"),
      cwd,
      sources: [{ dir: join(cwd, ".claude/rules"), kind: "claude" }],
    });
    assert.deepEqual(matches, []);
  });
});
