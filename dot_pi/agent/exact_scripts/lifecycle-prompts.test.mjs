import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const agentDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const promptsDir = existsSync(path.join(agentDir, "exact_prompts"))
  ? path.join(agentDir, "exact_prompts")
  : path.join(agentDir, "prompts");
const scriptsDir = existsSync(path.join(agentDir, "exact_scripts"))
  ? path.join(agentDir, "exact_scripts")
  : path.join(agentDir, "scripts");
const skillsDirs = ["exact_skills", "exact_skills_work", "exact_skills_personal", "skills", "skills_work", "skills_personal"]
  .map((dir) => path.join(agentDir, dir))
  .filter((dir) => existsSync(dir));

function prompt(name) {
  return readFileSync(path.join(promptsDir, name), "utf8");
}

function allPrompts() {
  return readdirSync(promptsDir)
    .filter((name) => name.endsWith(".md"))
    .sort();
}

function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  return match ? match[1] : null;
}

test("every prompt has valid frontmatter, expands $ARGUMENTS when hinted, and stays within size budget", () => {
  const MAX_PROMPT_BYTES = 28 * 1024;
  for (const name of allPrompts()) {
    const text = prompt(name);
    const fm = parseFrontmatter(text);
    assert.ok(fm !== null, `${name}: missing YAML frontmatter`);
    assert.match(fm, /^description:\s*\S+/m, `${name}: missing frontmatter description`);
    if (/^argument-hint:/m.test(fm)) {
      assert.ok(text.includes("$ARGUMENTS"), `${name}: defines argument-hint without $ARGUMENTS`);
    }
    const bytes = Buffer.byteLength(text, "utf8");
    assert.ok(bytes <= MAX_PROMPT_BYTES, `${name}: ${bytes} bytes exceeds ${MAX_PROMPT_BYTES}-byte budget`);
  }
});

test("every script path referenced in prompts exists", () => {
  const scriptRefRe = /scripts\/([a-zA-Z0-9_./-]+\.mjs)/g;
  for (const name of allPrompts()) {
    const text = prompt(name);
    for (const match of text.matchAll(scriptRefRe)) {
      const rel = match[1];
      const full = path.join(scriptsDir, rel);
      assert.equal(existsSync(full), true, `${name}: referenced script does not exist: scripts/${rel}`);
    }
  }
});

test("retired prompts and legacy migrations are absent and unreferenced", () => {
  for (const retired of ["compound.md", "pr-publish.md", "pr-review.md", "arp-review.md", "arp-fix.md"]) {
    assert.equal(existsSync(path.join(promptsDir, retired)), false, `retired prompt must be absent: ${retired}`);
  }
  const learn = prompt("learn.md");
  assert.doesNotMatch(learn, /Datadog\/Compound\/dotfiles-chezmoi-execute-template-profile\.md/);
  assert.doesNotMatch(learn, /\/compound\b/);
  const agents = readFileSync(path.join(agentDir, "AGENTS.md"), "utf8");
  assert.doesNotMatch(agents, /\/compound\b/);
});

test("stage-runner contract hooks match lifecycle prompts", () => {
  for (const name of ["execute.md", "simplify.md", "verify.md", "systematic-review.md"]) {
    assert.ok(prompt(name).includes("submit_stage_handoff"), `${name} must reference submit_stage_handoff`);
  }
  assert.ok(prompt("plan.md").includes("PI_DESIGN_INPUT"));
  assert.ok(prompt("brainstorm.md").includes("managed design-draft child"));
  for (const name of ["execute.md", "simplify.md", "verify.md"]) {
    assert.match(prompt(name), /Skip `resolve-worktree`/i, `${name} must skip resolve-worktree in stage-runner mode`);
  }
});

test("read-only and safety-critical prompts declare <HARD-GATE> and required tool boundaries", () => {
  for (const name of ["brainstorm.md", "plan.md", "systematic-review.md", "execute.md", "simplify.md", "verify.md", "learn.md", "pr-validate.md", "troubleshoot.md", "handoff.md", "optimize.md", "disk-cleanup.md"]) {
    assert.ok(prompt(name).includes("<HARD-GATE>"), `${name} must include <HARD-GATE>`);
  }
  for (const name of ["execute.md", "verify.md"]) {
    const text = prompt(name);
    assert.doesNotMatch(text, /Datadog\/Learnings\.md/);
    assert.doesNotMatch(text, /learning-lookup/);
  }
  assert.match(prompt("verify.md"), /--base <ref>/);
  assert.match(prompt("weekly-summary.md"), /obsidian create/);
  for (const name of ["pr-create.md", "pr-update.md"]) {
    const text = prompt(name);
    assert.ok(text.includes("reviewable-pr-workflow"), `${name} must reference reviewable-pr-workflow`);
    assert.ok(text.includes("tool_search"), `${name} must discover ARP tools via tool_search`);
  }
});

test("prompts wire deterministic helper scripts for each automated operation", () => {
  assert.match(prompt("plan.md"), /lifecycle-git\.mjs["']?\s+preflight-design/);
  assert.match(prompt("plan.md"), /lifecycle-git\.mjs["']?\s+lint-plan/);
  assert.match(prompt("systematic-review.md"), /lifecycle-git\.mjs["']?\s+lint-plan/);
  assert.match(prompt("execute.md"), /lifecycle-git\.mjs["']?\s+next-slice/);
  assert.match(prompt("pr-create.md"), /lifecycle-git\.mjs["']?\s+resolve-base/);
  assert.match(prompt("pr-validate.md"), /pr-validate-report\/workspace\.mjs/);
  assert.match(prompt("pr-validate.md"), /pr-validate-report\/render\.mjs/);
  assert.match(prompt("disk-cleanup.md"), /disk-cleanup\.mjs["']?\s+measure/);
  assert.match(prompt("disk-cleanup.md"), /disk-cleanup\.mjs["']?\s+scan-worktrees/);
  assert.match(prompt("weekly-summary.md"), /weekly-evidence\.mjs/);
  assert.match(prompt("learn.md"), /learn-evidence\.mjs/);
});

test("core skills referenced by lifecycle prompts exist in skill roots", () => {
  const requiredSkills = [
    "skill-loader",
    "codebase-research",
    "resolve-worktree",
    "feature-worktree",
    "reviewable-pr-workflow",
    "learning-lookup",
    "learning-candidates",
    "explain",
    "write",
  ];
  for (const name of requiredSkills) {
    const found = skillsDirs.some((dir) =>
      existsSync(path.join(dir, name, "SKILL.md")) || existsSync(path.join(dir, `exact_${name}`, "SKILL.md")),
    );
    assert.equal(found, true, `required skill missing: ${name}`);
  }
});
