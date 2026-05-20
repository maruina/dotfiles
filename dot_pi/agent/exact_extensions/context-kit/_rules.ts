import { readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { extname, join, relative } from "node:path";
import { minimatch } from "minimatch";

/**
 * Rule-file discovery and glob matching for Claude (.claude/rules) and Cursor
 * (.cursor/rules). The user requirement: only flag rules that *affirmatively*
 * match the touched file via a path glob. Rules with no glob/paths field —
 * "always apply" or "agent decides via description" — are intentionally skipped.
 *
 * Frontmatter formats:
 *   - Claude:  `paths:` is an array of glob strings.
 *   - Cursor:  `globs:` is a string (possibly comma-separated) OR an array.
 *              `alwaysApply: true` rules are skipped here (no path-matching).
 *
 * Globs are matched against the path relative to cwd, using `minimatch` defaults.
 */

export type RuleKind = "claude" | "cursor";

export type RuleSource = {
  dir: string; // Absolute directory containing rule files.
  kind: RuleKind;
};

/** Tiny YAML-frontmatter extractor — handles only the shapes rule files use. */
export function parseFrontmatter(text: string): {
  paths?: string[];
  globs?: string[];
  alwaysApply?: boolean;
  description?: string;
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match || !match[1]) return {};
  const body = match[1];
  const result: { paths?: string[]; globs?: string[]; alwaysApply?: boolean; description?: string } = {};

  // Split into top-level entries: a line starting at column 0 with `key:`.
  // Each entry may be followed by indented list items (`  - foo`).
  const lines = body.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!m || !m[1]) {
      i++;
      continue;
    }
    const key = m[1];
    let value: string | string[] = (m[2] ?? "").trim();

    // Collect indented list items below this key.
    const items: string[] = [];
    let j = i + 1;
    while (j < lines.length && /^\s+-\s+/.test(lines[j] ?? "")) {
      items.push((lines[j] ?? "").replace(/^\s+-\s+/, "").trim());
      j++;
    }
    if (items.length > 0) {
      value = items.map(stripQuotes);
    } else if (typeof value === "string") {
      value = stripQuotes(value);
    }

    if (key === "paths") {
      result.paths = normalizeList(value);
    } else if (key === "globs") {
      result.globs = normalizeList(value);
    } else if (key === "alwaysApply") {
      result.alwaysApply = String(value).toLowerCase() === "true";
    } else if (key === "description" && typeof value === "string" && value.length > 0) {
      result.description = value;
    }

    i = j > i + 1 ? j : i + 1;
  }
  return result;
}

function stripQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function normalizeList(value: string | string[]): string[] {
  if (Array.isArray(value)) return value.filter((s) => s.length > 0);
  // Strip inline-array brackets if present: `[a, b]`
  let v = value.trim();
  if (v.startsWith("[") && v.endsWith("]")) v = v.slice(1, -1);
  // Comma-separated string (Cursor allows this).
  return v
    .split(",")
    .map((s) => stripQuotes(s.trim()))
    .filter((s) => s.length > 0);
}

/** Recursively enumerate rule files under a directory. */
export function listRuleFiles(dir: string, kind: RuleKind): string[] {
  const exts = kind === "cursor" ? [".md", ".mdc"] : [".md"];
  const out: string[] = [];
  const walk = (d: string) => {
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = join(d, name);
      let st: ReturnType<typeof statSync>;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full);
      } else if (st.isFile() && exts.includes(extname(name))) {
        out.push(full);
      }
    }
  };
  walk(dir);
  return out;
}

/**
 * Standard set of rule sources for a project at `cwd`:
 *   - <cwd>/.claude/rules
 *   - <cwd>/.cursor/rules
 *   - ~/.claude/rules
 */
export function defaultRuleSources(cwd: string, home: string = homedir()): RuleSource[] {
  return [
    { dir: join(cwd, ".claude", "rules"), kind: "claude" },
    { dir: join(cwd, ".cursor", "rules"), kind: "cursor" },
    { dir: join(home, ".claude", "rules"), kind: "claude" },
  ];
}

export type RuleMatch = {
  /** Absolute path to the rule file. */
  path: string;
  /** Glob patterns from the rule that matched the file. */
  matchedPatterns: string[];
  /** Cursor `description:` field, if present. */
  description?: string;
  kind: RuleKind;
};

/**
 * Given an absolute file path the agent just touched, return every rule whose
 * glob/paths frontmatter affirmatively matches that file, along with the
 * pattern(s) that matched and the rule's description (if any).
 */
export function findMatchingRules(opts: {
  filePath: string; // absolute
  cwd: string;
  sources: RuleSource[];
}): RuleMatch[] {
  const rel = relative(opts.cwd, opts.filePath);
  // Files outside cwd can't be matched against project-relative rule globs.
  if (rel.startsWith("..") || rel === "") return [];

  const matches: RuleMatch[] = [];
  for (const source of opts.sources) {
    for (const ruleFile of listRuleFiles(source.dir, source.kind)) {
      let content: string;
      try {
        content = readFileSync(ruleFile, "utf8");
      } catch {
        continue;
      }
      const fm = parseFrontmatter(content);
      const patterns = source.kind === "claude" ? fm.paths : fm.globs;
      if (!patterns || patterns.length === 0) continue; // Only path-matched rules.
      const matched = patterns.filter((p) => minimatch(rel, p, { dot: true }));
      if (matched.length === 0) continue;
      matches.push({
        path: ruleFile,
        matchedPatterns: matched,
        description: fm.description,
        kind: source.kind,
      });
    }
  }
  return matches;
}
