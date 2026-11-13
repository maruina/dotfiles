import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const promptsDir = new URL(existsSync(new URL("../exact_prompts", import.meta.url)) ? "../exact_prompts/" : "../prompts/", import.meta.url);
const prompt = (name) => readFileSync(new URL(`${name}.md`, promptsDir), "utf8");

test("PR creation offers an opt-in ARP review with head and action guards", () => {
  const text = prompt("pr-create");
  for (const marker of ["skill-loader", "## Phase 4: Offer an ARP review", "silent: true", "explicit approval", "allowed_action", "expected_head_sha", "headRefOid", "cannot force a fresh review", "Do not resolve findings", "Do not poll"]) {
    assert.ok(text.includes(marker), `pr-create must include ${marker}`);
  }
});

test("PR updates report ARP status without requesting reviews or resolving findings", () => {
  const text = prompt("pr-update");
  for (const marker of ["skill-loader", "## Phase 4: Check ARP status", "agentic_review_get_status", "headRefOid", "head_sha", "stale", "Do not request or retry a review", "Do not resolve findings", "Do not poll"]) {
    assert.ok(text.includes(marker), `pr-update must include ${marker}`);
  }
});

test("ARP remains optional and requires deferred tool discovery", () => {
  for (const name of ["pr-create", "pr-update"]) {
    const text = prompt(name);
    assert.ok(text.includes("tool_search"));
    assert.ok(text.includes("do not block"));
    assert.ok(text.includes("production"));
  }
});
