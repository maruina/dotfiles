import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const agentDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const promptsDir = existsSync(path.join(agentDir, "exact_prompts"))
  ? path.join(agentDir, "exact_prompts")
  : path.join(agentDir, "prompts");

function prompt(name) {
  return readFileSync(path.join(promptsDir, name), "utf8");
}

function requireMarkers(text, markers) {
  for (const marker of markers) assert.match(text, marker);
}

test("troubleshoot has valid frontmatter and expands $ARGUMENTS", () => {
  assert.equal(existsSync(path.join(promptsDir, "troubleshoot.md")), true, "troubleshoot.md must exist");
  const text = prompt("troubleshoot.md");

  requireMarkers(text, [
    /description:/,
    /argument-hint:/,
    /\$ARGUMENTS/,
  ]);
});

test("troubleshoot enforces a read-only gate and hands off remediation", () => {
  const text = prompt("troubleshoot.md");

  requireMarkers(text, [
    /apply/i,
    /delete/i,
    /scale/i,
    /restart/i,
    /cancel/i,
    /terminate/i,
    /signal/i,
    /rollback/i,
    /retry/i,
    /read-only/i,
    /handoff|lifecycle|owner|runbook/i,
  ]);
});

test("troubleshoot requires evidence labels and reserves root cause", () => {
  const text = prompt("troubleshoot.md");

  requireMarkers(text, [
    /Confirmed/,
    /Supported hypothesis/,
    /Rejected hypothesis/,
    /Unknown/,
    /root cause.*confirmed|confirmed.*root cause/is,
  ]);
});

test("troubleshoot routes only from explicit skill-description matches", () => {
  const text = prompt("troubleshoot.md");

  requireMarkers(text, [
    /skill only when its description explicitly matches a supplied identifier or confirmed evidence/i,
    /Do not infer a route from a plausible correlation/i,
    /If no skill description explicitly matches, emit a bounded source-of-truth gap and ask for a pointer/i,
    /load.*matching skill|matching skill.*load/is,
  ]);
});

test("troubleshoot routes Atlas/Temporal URLs to a bounded failure-chain investigation", () => {
  const text = prompt("troubleshoot.md");

  requireMarkers(text, [
    /atlas-workflows/,
    /atlas\.ddbuild\.io/,
    /temporal\.ddbuild\.io/,
    /collect a bounded visible failure chain/i,
  ]);
});

test("troubleshoot conditionally routes telemetry to datadog-mcp", () => {
  const text = prompt("troubleshoot.md");

  requireMarkers(text, [
    /datadog-mcp/,
    /telemetry/i,
  ]);
});

test("troubleshoot emits the required output sections", () => {
  const text = prompt("troubleshoot.md");

  requireMarkers(text, [
    /### Status and impact/,
    /### Confirmed/,
    /### Visible failure chain/,
    /### Hypothesis ledger/,
    /### Recommended next step/,
    /### Routing candidate/,
    /### Skills loaded and used/,
    /\| Hypothesis \| Evidence for \| Evidence against \/ gap \| Test and expected observation \| State \|/,
  ]);
});

test("troubleshoot defines a routing-candidate format and forbids mutation", () => {
  const text = prompt("troubleshoot.md");

  requireMarkers(text, [
    /Trigger:/,
    /Recommended skill or source of truth:/,
    /Evidence:/,
    /Scope and read-only safety boundary:/,
    /Confidence:/,
    /Promotion path:/,
    /do not modify|must not modify|never.*modify/is,
  ]);
});

test("troubleshoot encodes the required behavior-specific scenario contracts", () => {
  const text = prompt("troubleshoot.md");

  requireMarkers(text, [
    /lead with confirmed impact and recommend the smallest stabilizing action and owner/i,
    /Read-only diagnosis must not delay that recommendation/i,
    /dependency explanation remains a hypothesis or unknown/i,
    /Treat an ambiguous environment, account, cluster, namespace, domain, or context as a stop condition/i,
    /Do not modify skills, prompts, or routing knowledge during the investigation/i,
  ]);
});

test("troubleshoot records skill provenance", () => {
  const text = prompt("troubleshoot.md");

  requireMarkers(text, [
    /Skill \| Source \| Why loaded \| How used/,
    /prompt-required/,
    /agent-selected/,
  ]);
});
