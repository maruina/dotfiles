import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { stageContract } from "./_bridge.ts";
import { PROTOCOL_VERSION, type StageConfig } from "./_protocol.ts";

const WORKTREE = "/work/repo";
const COMMIT = "a".repeat(40);

function config(designPath: string, designBlob: string): StageConfig {
  return {
    protocolVersion: PROTOCOL_VERSION,
    scope: "execution",
    runId: "run-test",
    stage: "execute",
    worktree: WORKTREE,
    branch: "feature",
    planPath: `${WORKTREE}/plans/feature/plan.md`,
    baseline: {
      commit: COMMIT,
      plan: { path: `${WORKTREE}/plans/feature/plan.md`, blob: "b".repeat(40) },
      design: { path: designPath, blob: designBlob },
    },
    unitBase: COMMIT,
    unit: { heading: "Slice 1: First", taskNumbers: [1] },
    models: {
      execute: { provider: "fixture", id: "writer" },
      simplify: { provider: "fixture", id: "simplifier" },
      verify: { provider: "fixture", id: "verifier" },
    },
    stageModel: { provider: "fixture", id: "writer" },
    thinkingLevel: "low",
  };
}

function completionConfig(stage: "arp-fix" | "arp-review" | "verify"): StageConfig {
  const common = {
    protocolVersion: PROTOCOL_VERSION as typeof PROTOCOL_VERSION,
    scope: "completion" as const,
    runId: "run-test",
    worktree: WORKTREE,
    branch: "feature",
    planPath: `${WORKTREE}/plans/feature/plan.md`,
    baseline: {
      commit: COMMIT,
      plan: { path: `${WORKTREE}/plans/feature/plan.md`, blob: "b".repeat(40) },
      design: { path: `${WORKTREE}/plans/feature/design.md`, blob: "c".repeat(40) },
    },
    models: {
      execute: { provider: "fixture", id: "writer" },
      simplify: { provider: "fixture", id: "simplifier" },
      verify: { provider: "fixture", id: "verifier" },
    },
    thinkingLevel: "low",
    completion: {
      policy: "work" as const,
      candidate: { branch: "feature", head: COMMIT, stateDigest: "d".repeat(64) },
      ...(stage === "arp-fix"
        ? {
            fixRequest: {
              prUrl: "https://github.com/DataDog/repo/pull/123",
              reviewedHeadSha: COMMIT,
              findings: [
                {
                  findingId: "finding-alpha",
                  filePath: "src/main.ts",
                  startLine: 10,
                  endLine: 12,
                  reviewedSha: COMMIT,
                  summary: "fix alpha",
                },
                {
                  findingId: "finding-beta",
                  filePath: "src/other.ts",
                  startLine: 20,
                  endLine: 21,
                  reviewedSha: "e".repeat(40),
                  summary: "fix beta",
                },
              ],
            },
          }
        : stage === "arp-review"
          ? {
              reviewRequest: {
                prUrl: "https://github.com/DataDog/repo/pull/123",
                expectedHeadSha: COMMIT,
                deadlineAt: "2099-01-01T00:20:00.000Z",
                maxStatusChecks: 30,
                pollIntervalsSeconds: [10, 30, 60],
                silent: true as const,
              },
              pendingSettlements: [
                {
                  findingId: "finding-beta",
                  fixCommitSha: "f".repeat(40),
                  fixChangeSummary: "settle beta",
                  reason: "verified in follow-up checks",
                },
                {
                  findingId: "finding-gamma",
                  fixCommitSha: "a".repeat(40),
                  fixChangeSummary: "settle gamma",
                  reason: "verified against gamma",
                },
              ],
            }
          : {
              verificationWriters: ["fixture/writer", "fixture/simplifier"],
            }),
    },
  };
  return {
    ...common,
    stage,
    stageModel: stage === "verify" ? { provider: "fixture", id: "verifier" } : { provider: "fixture", id: "writer" },
  };
}

describe("stageContract", () => {
  it("names the pinned plan and design files beside their blob IDs", () => {
    const text = stageContract(config(`${WORKTREE}/plans/feature/design.md`, "c".repeat(40)));
    assert.match(text, new RegExp(`^Pinned plan blob: ${"b".repeat(40)} \\(plans/feature/plan\\.md\\)$`, "m"));
    assert.match(text, new RegExp(`^Pinned design blob: ${"c".repeat(40)} \\(plans/feature/design\\.md\\)$`, "m"));
  });

  it("gives exact commands to read and check the pinned plan and explains the ledger", () => {
    const text = stageContract(config(`${WORKTREE}/plans/feature/design.md`, "c".repeat(40)));
    assert.match(text, new RegExp(`git rev-parse ${COMMIT}:plans/feature/plan\\.md`));
    assert.match(text, new RegExp(`git show ${"b".repeat(40)}`));
    assert.match(text, new RegExp(`git show ${"c".repeat(40)}`));
    assert.match(text, /working-tree plan is the progress ledger.*differs? from the pinned plan blob/is);
  });

  it("states that no design document exists when the plan is the design baseline", () => {
    const text = stageContract(config(`${WORKTREE}/plans/feature/plan.md`, "b".repeat(40)));
    assert.match(text, /^Pinned design blob: none — no design\.md exists; the pinned plan is the only requirements document$/m);
    assert.doesNotMatch(text, /Pinned design blob: b{40}/);
  });

  it("prints structured fix findings for arp-fix handoff", () => {
    const text = stageContract(completionConfig("arp-fix"));
    assert.match(text, /^Fix target PR: https:\/\/github\.com\/DataDog\/repo\/pull\/123$/m);
    assert.match(text, /^Fix reviewed head SHA: a{40}$/m);
    assert.match(text, /^Fix findings count: 2$/m);
    assert.match(text, /^Fix finding: .*"findingId":"finding-alpha".*"filePath":"src\/main\.ts".*"startLine":10.*"endLine":12.*"reviewedSha":"a{40}".*"summary":"fix alpha".*$/m);
    assert.match(text, /^Fix finding: .*"findingId":"finding-beta".*"filePath":"src\/other\.ts".*"startLine":20.*"endLine":21.*"reviewedSha":"e{40}".*"summary":"fix beta".*$/m);
  });

  it("prints structured pending settlements for arp-review handoff", () => {
    const text = stageContract(completionConfig("arp-review"));
    assert.match(text, /^Pending addressed settlements: 2$/m);
    assert.match(text, /^Pending settlement IDs: finding-beta, finding-gamma$/m);
    assert.match(text, /^Pending settlement: .*"findingId":"finding-beta".*"fixCommitSha":"f{40}".*"fixChangeSummary":"settle beta".*"reason":"verified in follow-up checks".*$/m);
    assert.match(text, /^Pending settlement: .*"findingId":"finding-gamma".*"fixCommitSha":"a{40}".*"fixChangeSummary":"settle gamma".*"reason":"verified against gamma".*$/m);
  });

  it("prints completion verification writer identities", () => {
    const text = stageContract(completionConfig("verify"));
    assert.match(text, /^Completion verification writers: fixture\/writer, fixture\/simplifier$/m);
  });
});
