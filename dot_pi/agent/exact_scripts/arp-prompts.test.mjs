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

test("publication has no model prompt", () => {
  assert.equal(existsSync(new URL("pr-publish.md", promptsDir)), false);
});

test("completion ARP review prompt enforces silent bounded exact-head review with structured settlements", () => {
  const text = prompt("arp-review");
  for (const marker of [
    "skill-loader",
    "PI_LIFECYCLE_CHILD_CONFIG",
    "tool_search",
    "Expected review head SHA",
    "silent: true",
    "Max status checks",
    "Status poll intervals",
    "settledFindingIds",
    "actionableFindingDetails",
    "Pending settlement",
    "agentic_review_get_findings",
    "agentic_review_resolve_finding",
    "Use `agentic_review_resolve_finding` only when concrete evidence supports",
    "convert it to a positive integer for `finding_id`",
    "reviewed_sha == Expected review head SHA",
    "review_in_progress == false",
    "Re-anchor",
    "older reviewed heads",
  ]) {
    assert.ok(text.includes(marker), `arp-review must include ${marker}`);
  }
});

test("completion review settles verified fixes before requesting re-review", () => {
  const text = prompt("arp-review");
  const settlement = text.indexOf("resolve each as `addressed`");
  const request = text.indexOf("send exactly one request");
  assert.ok(settlement >= 0 && request > settlement, "verified settlements must precede a new review request");
  assert.match(text, /If any pending settlement fails,.*blocked.*do not request/i);
});

test("completion ARP fix prompt is orchestrated-only and returns pending settlements", () => {
  const text = prompt("arp-fix");
  for (const marker of ["skill-loader", "PI_LIFECYCLE_CHILD_CONFIG", "Fix target PR", "Fix reviewed head SHA", "pendingSettlements", "commitRefs", "Do not push", "Verification and publication happen in later orchestrated stages"]) {
    assert.ok(text.includes(marker), `arp-fix must include ${marker}`);
  }
});
