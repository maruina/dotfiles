import {
  createAssistantMessageEventStream,
  type Api,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Model,
  type ToolCall,
  type Usage,
} from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PROTOCOL_VERSION } from "../_protocol.ts";

const PROVIDER = "lifecycle-test";
const API = "lifecycle-test-api";
const FIXTURE_PR = { owner: "DataDog", repo: "repo", pull_number: 123 };
const FIXTURE_REPOSITORY = { owner: FIXTURE_PR.owner, repo: FIXTURE_PR.repo };
const ZERO_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function streamToolCall(model: Model<Api>, toolCall: ToolCall): AssistantMessageEventStream {
  const message: AssistantMessage = {
    role: "assistant",
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    timestamp: Date.now(),
    usage: ZERO_USAGE,
    stopReason: "pending",
  };
  const stream = createAssistantMessageEventStream();
  stream.push({ type: "start", partial: message });
  message.content = [toolCall];
  stream.push({ type: "toolcall_start", contentIndex: 0, partial: message });
  stream.push({ type: "toolcall_end", contentIndex: 0, toolCall, partial: message });
  message.stopReason = "toolUse";
  stream.push({ type: "done", reason: "toolUse", message });
  stream.end(message);
  return stream;
}

function streamText(model: Model<Api>, text: string): AssistantMessageEventStream {
  const message: AssistantMessage = {
    role: "assistant",
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    timestamp: Date.now(),
    usage: ZERO_USAGE,
    stopReason: "pending",
  };
  const stream = createAssistantMessageEventStream();
  stream.push({ type: "start", partial: message });
  message.content = [{ type: "text", text }];
  stream.push({ type: "text_start", contentIndex: 0, partial: message });
  stream.push({ type: "text_delta", contentIndex: 0, delta: text, partial: message });
  stream.push({ type: "text_end", contentIndex: 0, content: text, partial: message });
  message.stopReason = "stop";
  stream.push({ type: "done", reason: "stop", message });
  stream.end(message);
  return stream;
}

function toolResults(
  context: { messages: Array<{ role: string; toolName?: string; isError?: boolean; details?: unknown; content?: unknown }> },
  toolName: string,
) {
  return context.messages.filter((message) => message.role === "toolResult" && message.toolName === toolName);
}

function latestToolResult(
  context: { messages: Array<{ role: string; toolName?: string; isError?: boolean; details?: unknown; content?: unknown }> },
  toolName: string,
): { role: string; toolName?: string; isError?: boolean; details?: unknown; content?: unknown } | undefined {
  const matches = toolResults(context, toolName);
  return matches.length === 0 ? undefined : matches[matches.length - 1];
}

function messageText(content: unknown): string {
  return typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content
          .filter((part): part is { type: string; text?: string } => typeof part === "object" && part !== null && "type" in part)
          .filter((part) => part.type === "text")
          .map((part) => part.text ?? "")
          .join("")
      : "";
}

function resultData<T>(message: { content?: unknown } | undefined): T | undefined {
  try {
    return JSON.parse(messageText(message?.content)) as T;
  } catch {
    return undefined;
  }
}

function latestUserText(context: { messages: Array<{ role: string; content?: unknown }> }): string {
  for (const message of [...context.messages].reverse()) {
    if (message.role !== "user") continue;
    const content = messageText(message.content);
    if (content && !content.startsWith("Protocol version:")) return content;
  }
  return "";
}

function latestStageContract(context: { messages: Array<{ role: string; content?: unknown }> }): string | undefined {
  for (const message of [...context.messages].reverse()) {
    if (message.role !== "user") continue;
    const content = messageText(message.content);
    if (content.startsWith("Protocol version:")) return content;
  }
  return undefined;
}

function contractValue(contract: string | undefined, label: string): string | undefined {
  if (!contract) return undefined;
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = contract.match(new RegExp(`^${escaped}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim();
}

function contractStage(contract: string | undefined): string | undefined {
  return contractValue(contract, "Stage");
}

type ContractFixFinding = {
  findingId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  reviewedSha: string;
  summary: string;
};

type ContractPendingSettlement = {
  findingId: string;
  fixCommitSha: string;
  fixChangeSummary: string;
  reason: string;
};

type ArpFinding = {
  finding_id: number;
  file_path: string;
  start_line: number;
  end_line: number;
  reviewed_sha: string;
  summary: string;
};

function parseJsonContractLines<T>(contract: string | undefined, label: string): T[] {
  if (!contract) return [];
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = contract.match(new RegExp(`^${escaped}:\\s*(.+)$`, "gm")) ?? [];
  const values: T[] = [];
  for (const line of matches) {
    const raw = line.replace(new RegExp(`^${escaped}:\\s*`), "").trim();
    if (!raw) continue;
    try {
      values.push(JSON.parse(raw) as T);
    } catch {
      // Ignore malformed fixture lines; the fixture falls back to empty structured metadata.
    }
  }
  return values;
}

function contractFixFindings(contract: string | undefined): ContractFixFinding[] {
  return parseJsonContractLines<ContractFixFinding>(contract, "Fix finding");
}

function contractPendingSettlements(contract: string | undefined): ContractPendingSettlement[] {
  return parseJsonContractLines<ContractPendingSettlement>(contract, "Pending settlement");
}

function extractCommitHash(value: unknown): string | undefined {
  const text = typeof value === "string" ? value : value === undefined ? "" : JSON.stringify(value);
  const match = text.match(/[0-9a-f]{40}|[0-9a-f]{64}/);
  return match?.[0];
}

function makeToolCall(id: string, name: string, args: ToolCall["arguments"]): ToolCall {
  return { type: "toolCall", id, name, arguments: args };
}

function completionReviewEvidence(expectedHeadSha: string, reviewedHeadSha: string, result: "clean" | "findings" | "stale" | "error") {
  return {
    targetHeadSha: expectedHeadSha,
    reviewedHeadSha,
    captureState: result === "clean" ? "complete" : "review-in-progress",
    result,
    actionableFindings: result === "clean" ? 0 : 2,
    statusChecks: 2,
    reusedReview: true,
    silent: true,
  };
}

type FixtureResolution = { finding_id: number; resolution: string; fix_commit_sha?: string; fix_change_summary?: string; reason?: string };

function successfulResolutions(
  context: { messages: Array<{ role: string; toolName?: string; isError?: boolean; content?: unknown }> },
): FixtureResolution[] {
  return toolResults(context, "agentic_review_resolve_finding")
    .filter((message) => message.isError !== true)
    .map((message) => resultData<FixtureResolution>(message))
    .filter((entry): entry is FixtureResolution => entry !== undefined);
}

function pendingAddressedResolution(
  settlements: ContractPendingSettlement[],
  resolved: FixtureResolution[],
): ContractPendingSettlement | undefined {
  const addressedIds = new Set(
    resolved.filter((entry) => entry.resolution === "addressed").map((entry) => String(entry.finding_id)),
  );
  return settlements.find((settlement) => !addressedIds.has(settlement.findingId));
}

function hasSuccessfulInvalidResolution(
  resolved: FixtureResolution[],
  findingId: string,
): boolean {
  return resolved.some((entry) => entry.resolution === "invalid" && String(entry.finding_id) === findingId);
}

function hasResolutionAttempt(
  context: { messages: Array<{ role: string; toolName?: string; content?: unknown }> },
  findingId: string,
  resolution: "invalid" | "addressed",
): boolean {
  return toolResults(context, "agentic_review_resolve_finding").some((message) => {
    const result = resultData<FixtureResolution>(message);
    return String(result?.finding_id) === findingId && result?.resolution === resolution;
  });
}

export default function lifecycleRpcDriver(pi: ExtensionAPI): void {
  let callNumber = 0;
  let statusChecks = 0;
  const outcomeMode = process.env.PI_LIFECYCLE_TEST_OUTCOME ?? "success";
  const configuredStage = process.env.PI_LIFECYCLE_TEST_STAGE ?? "execute";
  const expectedHeadSha = process.env.PI_LIFECYCLE_TEST_EXPECTED_HEAD ?? "a".repeat(40);
  const staleHeadSha = process.env.PI_LIFECYCLE_TEST_STALE_HEAD ?? "f".repeat(40);
  const coordinates = { owner: Type.String(), repo: Type.String(), pull_number: Type.Integer({ minimum: 1 }) };
  const fixtureHead = async (cwd: string) => configuredStage === "auto"
    ? (await pi.exec("git", ["rev-parse", "HEAD"], { cwd })).stdout.trim()
    : expectedHeadSha;

  pi.registerTool({
    name: "fixture_discover_agentic_review_tools",
    label: "Fixture deferred tool discovery",
    description: "Fixture deferred tool discovery",
    parameters: { type: "object", additionalProperties: true } as const,
    async execute() {
      if (outcomeMode === "arp-discovery-missing") {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ tools: [{ name: "agentic_review_get_status" }, { name: "agentic_review_get_findings" }] }) }],
          details: { tools: [{ name: "agentic_review_get_status" }, { name: "agentic_review_get_findings" }] },
        };
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ tools: ["agentic_review_get_status", "agentic_review_request_review", "agentic_review_get_findings", "agentic_review_resolve_finding"].map((name) => ({ name })) }) }],
        details: {
          tools: [
            { name: "agentic_review_get_status" },
            { name: "agentic_review_request_review" },
            { name: "agentic_review_get_findings" },
            { name: "agentic_review_resolve_finding" },
          ],
        },
      };
    },
  });

  pi.registerTool({
    name: "agentic_review_get_status",
    label: "Fixture ARP status",
    description: "Fixture ARP status",
    parameters: Type.Object(coordinates, { additionalProperties: false }),
    async execute(_id, _params, _signal, _onUpdate, ctx) {
      statusChecks += 1;
      const stale = outcomeMode === "arp-stale-head";
      const head = stale ? staleHeadSha : await fixtureHead(ctx.cwd);
      const details = {
        head_sha: head,
        allowed_action: outcomeMode === "arp-discovery-missing"
          ? "REVIEW_ACTION_NONE"
          : statusChecks === 1
            ? "REVIEW_ACTION_REVIEW_ANYWAY"
            : "REVIEW_ACTION_NONE",
        status: !stale && statusChecks >= 2 ? "REVIEW_STATUS_NO_ISSUES_FOUND" : "REVIEW_STATUS_IN_PROGRESS",
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(details) }],
        details,
      };
    },
  });

  pi.registerTool({
    name: "agentic_review_request_review",
    label: "Fixture ARP request",
    description: "Fixture ARP request",
    parameters: Type.Object({ ...coordinates, action: Type.Union([Type.Literal("review_anyway"), Type.Literal("retry")]), expected_head_sha: Type.Optional(Type.String()), silent: Type.Optional(Type.Boolean()) }, { additionalProperties: false }),
    async execute(_toolCallId, params) {
      if (outcomeMode === "arp-request-error") {
        return {
          content: [{ type: "text" as const, text: "fixture review request failed" }],
          details: undefined,
          isError: true,
        };
      }
      return {
        content: [{ type: "text" as const, text: "fixture review request accepted" }],
        details: params,
      };
    },
  });

  pi.registerTool({
    name: "agentic_review_get_findings",
    label: "Fixture ARP findings",
    description: "Fixture ARP findings",
    parameters: Type.Object({ owner: Type.String(), repo: Type.String(), pull_number: Type.Integer({ minimum: 1 }), status: Type.Optional(Type.Union([Type.Literal("open"), Type.Literal("all"), Type.Literal("addressed"), Type.Literal("dismissed")])) }, { additionalProperties: false }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const expectedHead = await fixtureHead(ctx.cwd);
      const findings: ArpFinding[] = configuredStage !== "auto" || existsSync(join(ctx.cwd, "src/fix.txt")) ? [] : [
        {
          finding_id: 84171,
          file_path: "src/execute.txt",
          start_line: 1,
          end_line: 1,
          reviewed_sha: expectedHead,
          summary: "Fixture false positive finding",
        },
        {
          finding_id: 84172,
          file_path: "src/execute.txt",
          start_line: 1,
          end_line: 1,
          reviewed_sha: expectedHead,
          summary: "Fixture actionable finding",
        },
      ];
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ findings, reviewed_sha: expectedHead, review_in_progress: false }) }],
        details: { request: params, findings, reviewed_sha: expectedHead, review_in_progress: false },
      };
    },
  });

  pi.registerTool({
    name: "agentic_review_resolve_finding",
    label: "Fixture ARP resolve",
    description: "Fixture ARP resolve",
    parameters: Type.Object({ owner: Type.String(), repo: Type.String(), finding_id: Type.Integer({ minimum: 1 }), resolution: Type.Union([Type.Literal("addressed"), Type.Literal("invalid"), Type.Literal("out_of_scope")]), reason: Type.String(), fix_commit_sha: Type.Optional(Type.String()), fix_change_summary: Type.Optional(Type.String()) }, { additionalProperties: false }),
    async execute(_toolCallId, params) {
      const resolution = (params as { resolution?: unknown }).resolution;
      if (resolution === "addressed" && outcomeMode === "auto-partial-resolution" && params.finding_id === 51843) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(params) }],
          details: params,
          isError: true,
        };
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(params) }],
        details: params,
      };
    },
  });

  pi.registerProvider(PROVIDER, {
    name: "Lifecycle RPC fixture",
    baseUrl: "http://127.0.0.1",
    apiKey: "fixture-only",
    api: API,
    models: [
      {
        id: "driver",
        name: "Lifecycle RPC fixture",
        reasoning: true,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 8192,
        maxTokens: 1024,
      },
      {
        id: "reviewer",
        name: "Lifecycle RPC reviewer fixture",
        reasoning: true,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 8192,
        maxTokens: 1024,
      },
    ],
    streamSimple(model, context) {
      if (outcomeMode === "expansion") {
        return streamText(model, `fixture-expanded:${JSON.stringify(latestUserText(context))}`);
      }

      const contract = latestStageContract(context);
      const activeStage = configuredStage === "auto" ? contractStage(contract) ?? "execute" : configuredStage;
      const contractCandidateHead = contractValue(contract, "Pinned completion candidate")?.split("@").at(-1);
      const contractExpectedReviewHead = contractValue(contract, "Expected review head SHA");
      const contractReviewedHead = contractValue(contract, "Fix reviewed head SHA");
      const stageFixFindings = contractFixFindings(contract);
      const stagePendingSettlements = contractPendingSettlements(contract);

      if (configuredStage === "auto") {
        const outcome = latestToolResult(context, "lifecycle_submit_outcome");
        const bashResult = latestToolResult(context, "bash");

        if (activeStage === "execute") {
          if (outcomeMode === "smoke-cancel") {
            const decision = latestToolResult(context, "lifecycle_request_decision");
            if (!decision) {
              return streamToolCall(
                model,
                makeToolCall(`fixture-call-${++callNumber}`, "lifecycle_request_decision", {
                  question: "May I proceed?",
                  evidence: "Smoke cancellation fixture reached the execute decision gate.",
                  proposal: "Continue the stage.",
                  context: "Dismissing this dialog should cancel the stage before outcome submission.",
                }),
              );
            }
            return streamText(model, "fixture cancelled execute stage");
          }
          if (!outcome) {
            if (!bashResult) {
              const planPath = contractValue(contract, "Plan") ?? "plans/feature/plan.md";
              const command = [
                `python3 - <<'PY'`,
                `from pathlib import Path`,
                `path = Path(${JSON.stringify(planPath)})`,
                `text = path.read_text()`,
                `path.write_text(text.replace('- [ ]', '- [x]', 1))`,
                `PY`,
                `mkdir -p src`,
                `echo 'fixture execute change' > src/execute.txt`,
                `git add -- ${JSON.stringify(planPath)} src/execute.txt`,
                `git commit --quiet -m 'fixture execute change'`,
                `git rev-parse HEAD`,
              ].join("\n");
              return streamToolCall(model, makeToolCall(`fixture-call-${++callNumber}`, "bash", { command }));
            }
            const newHead = extractCommitHash(bashResult) ?? expectedHeadSha;
            return streamToolCall(
              model,
              makeToolCall(`fixture-call-${++callNumber}`, "lifecycle_submit_outcome", {
                schemaVersion: PROTOCOL_VERSION,
                outcome: "success",
                change: "changed",
                report: "Fixture execute stage committed the selected unit.",
                commitRefs: [newHead],
              }),
            );
          }
          return streamText(model, outcome.isError ? "fixture observed execute outcome tool error" : "fixture observed execute success");
        }

        if (activeStage === "simplify") {
          if (!outcome) {
            return streamToolCall(
              model,
              makeToolCall(`fixture-call-${++callNumber}`, "lifecycle_submit_outcome", {
                schemaVersion: PROTOCOL_VERSION,
                outcome: "success",
                change: "unchanged",
                report: "Fixture simplify stage left candidate unchanged.",
              }),
            );
          }
          return streamText(model, outcome.isError ? "fixture observed simplify outcome tool error" : "fixture observed simplify success");
        }

        if (activeStage === "verify") {
          if (!outcome) {
            return streamToolCall(
              model,
              makeToolCall(`fixture-call-${++callNumber}`, "lifecycle_submit_outcome", {
                schemaVersion: PROTOCOL_VERSION,
                outcome: "VERIFIED",
                change: "not-applicable",
                report: "Fixture verify stage passed.",
              }),
            );
          }
          return streamText(model, outcome.isError ? "fixture observed verify outcome tool error" : "fixture observed verify success");
        }

        if (activeStage === "arp-review") {
          if (!outcome) {
            const reviewHead = contractExpectedReviewHead ?? contractCandidateHead ?? expectedHeadSha;
            const discovery = latestToolResult(context, "fixture_discover_agentic_review_tools");
            if (!discovery) {
              return streamToolCall(
                model,
                makeToolCall(`fixture-call-${++callNumber}`, "fixture_discover_agentic_review_tools", { target: "agentic-review" }),
              );
            }

            const status = toolResults(context, "agentic_review_get_status");
            if (status.length === 0) {
              return streamToolCall(
                model,
                makeToolCall(`fixture-call-${++callNumber}`, "agentic_review_get_status", FIXTURE_PR),
              );
            }

            const firstStatus = resultData<{ head_sha?: string; allowed_action?: string; status?: string }>(status[0]);
            if (!firstStatus) return streamText(model, "fixture missing ARP status details");
            if (firstStatus.head_sha && firstStatus.head_sha !== reviewHead) {
              return streamToolCall(
                model,
                makeToolCall(`fixture-call-${++callNumber}`, "lifecycle_submit_outcome", {
                  schemaVersion: PROTOCOL_VERSION,
                  outcome: "blocked",
                  change: "not-applicable",
                  report: "Fixture detected stale review head during completion review.",
                  reviewEvidence: {
                    targetHeadSha: reviewHead,
                    reviewedHeadSha: firstStatus.head_sha,
                    captureState: "review-in-progress",
                    result: "stale",
                    actionableFindings: 0,
                    statusChecks: status.length,
                    reusedReview: true,
                    silent: true,
                  },
                }),
              );
            }

            if (stagePendingSettlements.length > 0) {
              if (!latestToolResult(context, "agentic_review_get_findings")) {
                return streamToolCall(model, makeToolCall(`fixture-call-${++callNumber}`, "agentic_review_get_findings", { ...FIXTURE_PR, status: "all" }));
              }
              const successful = successfulResolutions(context);
              const pending = pendingAddressedResolution(stagePendingSettlements, successful);
              if (pending && !hasResolutionAttempt(context, pending.findingId, "addressed")) {
                return streamToolCall(model, makeToolCall(`fixture-call-${++callNumber}`, "agentic_review_resolve_finding", {
                  ...FIXTURE_REPOSITORY, finding_id: Number(pending.findingId), resolution: "addressed",
                  fix_commit_sha: pending.fixCommitSha, fix_change_summary: pending.fixChangeSummary, reason: pending.reason,
                }));
              }
              if (pending) {
                if (toolResults(context, "agentic_review_get_findings").length < 2) {
                  return streamToolCall(model, makeToolCall(`fixture-call-${++callNumber}`, "agentic_review_get_findings", { ...FIXTURE_PR, status: "all" }));
                }
                return streamToolCall(model, makeToolCall(`fixture-call-${++callNumber}`, "lifecycle_submit_outcome", {
                  schemaVersion: PROTOCOL_VERSION, outcome: "blocked", change: "not-applicable",
                  report: "Fixture settlement failed before re-review.",
                  reviewEvidence: { ...completionReviewEvidence(reviewHead, reviewHead, "error"), statusChecks: status.length },
                  settledFindingIds: successful.map((entry) => String(entry.finding_id)),
                }));
              }
            }

            const request = latestToolResult(context, "agentic_review_request_review");
            if (!request && firstStatus.allowed_action === "REVIEW_ACTION_REVIEW_ANYWAY") {
              return streamToolCall(
                model,
                makeToolCall(`fixture-call-${++callNumber}`, "agentic_review_request_review", {
                  ...FIXTURE_PR,
                  action: "review_anyway",
                  expected_head_sha: reviewHead,
                  silent: true,
                }),
              );
            }

            if (request?.isError) {
              return streamToolCall(
                model,
                makeToolCall(`fixture-call-${++callNumber}`, "lifecycle_submit_outcome", {
                  schemaVersion: PROTOCOL_VERSION,
                  outcome: "blocked",
                  change: "not-applicable",
                  report: "Fixture review request failed during completion review.",
                  reviewEvidence: {
                    targetHeadSha: reviewHead,
                    reviewedHeadSha: reviewHead,
                    captureState: "review-in-progress",
                    result: "error",
                    actionableFindings: 0,
                    statusChecks: status.length,
                    reusedReview: true,
                    silent: true,
                  },
                }),
              );
            }

            const latestStatus = resultData<{ status?: string }>(status[status.length - 1]);
            if (latestStatus?.status !== "REVIEW_STATUS_NO_ISSUES_FOUND") {
              return streamToolCall(
                model,
                makeToolCall(`fixture-call-${++callNumber}`, "agentic_review_get_status", FIXTURE_PR),
              );
            }

            const findingsResult = latestToolResult(context, "agentic_review_get_findings");
            if (!findingsResult || (stagePendingSettlements.length > 0 && toolResults(context, "agentic_review_get_findings").length < 2)) {
              return streamToolCall(
                model,
                makeToolCall(`fixture-call-${++callNumber}`, "agentic_review_get_findings", {
                  ...FIXTURE_PR,
                  status: "all",
                }),
              );
            }

            const capture = resultData<{ findings?: ArpFinding[]; reviewed_sha?: string; review_in_progress?: boolean }>(findingsResult);
            if (capture?.reviewed_sha !== reviewHead || capture.review_in_progress !== false) {
              return streamToolCall(model, makeToolCall(`fixture-call-${++callNumber}`, "lifecycle_submit_outcome", {
                schemaVersion: PROTOCOL_VERSION, outcome: "blocked", change: "not-applicable", report: "Fixture capture is incomplete.",
                reviewEvidence: { ...completionReviewEvidence(reviewHead, capture?.reviewed_sha ?? reviewHead, "error"), statusChecks: status.length },
                settledFindingIds: successfulResolutions(context).map((entry) => String(entry.finding_id)),
              }));
            }
            const findings = capture.findings ?? [];
            const successful = successfulResolutions(context);
            const nextPendingSettlement = pendingAddressedResolution(stagePendingSettlements, successful);
            if (nextPendingSettlement && !hasResolutionAttempt(context, nextPendingSettlement.findingId, "addressed")) {
              return streamToolCall(
                model,
                makeToolCall(`fixture-call-${++callNumber}`, "agentic_review_resolve_finding", {
                  ...FIXTURE_REPOSITORY,
                  finding_id: Number(nextPendingSettlement.findingId),
                  resolution: "addressed",
                  fix_commit_sha: nextPendingSettlement.fixCommitSha,
                  fix_change_summary: nextPendingSettlement.fixChangeSummary,
                  reason: nextPendingSettlement.reason,
                }),
              );
            }

            if (stagePendingSettlements.length === 0 && !hasSuccessfulInvalidResolution(successful, "84171")) {
              if (!hasResolutionAttempt(context, "84171", "invalid")) {
                return streamToolCall(
                  model,
                  makeToolCall(`fixture-call-${++callNumber}`, "agentic_review_resolve_finding", {
                    ...FIXTURE_REPOSITORY,
                    finding_id: 84171,
                    resolution: "invalid",
                    reason: "False positive: fixture evidence does not reproduce on the expected head.",
                  }),
                );
              }
            }

            if (stagePendingSettlements.length === 0 && !hasSuccessfulInvalidResolution(successful, "84171")) {
              return streamToolCall(model, makeToolCall(`fixture-call-${++callNumber}`, "lifecycle_submit_outcome", {
                schemaVersion: PROTOCOL_VERSION, outcome: "blocked", change: "not-applicable", report: "Fixture invalid settlement failed.",
                reviewEvidence: { ...completionReviewEvidence(reviewHead, reviewHead, "error"), statusChecks: status.length },
              }));
            }
            const settledFindingIds = [...new Set(successful.map((entry) => String(entry.finding_id)))];
            const addressed = new Set(successful.filter((entry) => entry.resolution === "addressed").map((entry) => String(entry.finding_id)));
            const actionableFindingDetails = findings
              .filter((finding) => finding.finding_id !== 84171)
              .filter((finding) => !addressed.has(String(finding.finding_id)))
              .map((finding) => ({
                findingId: String(finding.finding_id),
                filePath: finding.file_path,
                startLine: finding.start_line,
                endLine: finding.end_line,
                reviewedSha: finding.reviewed_sha,
                summary: finding.summary,
              }));
            for (const settlement of stagePendingSettlements) {
              if (addressed.has(settlement.findingId)) continue;
              if (actionableFindingDetails.some((finding) => finding.findingId === settlement.findingId)) continue;
              actionableFindingDetails.push({
                findingId: settlement.findingId,
                filePath: "src/execute.txt",
                startLine: 1,
                endLine: 1,
                reviewedSha: reviewHead,
                summary: `Fixture unresolved addressed settlement for ${settlement.findingId}`,
              });
            }

            const allPendingSettled = stagePendingSettlements.every((settlement) => addressed.has(settlement.findingId));
            if (allPendingSettled && actionableFindingDetails.length === 0) {
              return streamToolCall(
                model,
                makeToolCall(`fixture-call-${++callNumber}`, "lifecycle_submit_outcome", {
                  schemaVersion: PROTOCOL_VERSION,
                  outcome: "success",
                  change: "not-applicable",
                  report: "Fixture completed re-review on the post-fix head.",
                  reviewEvidence: {
                    targetHeadSha: reviewHead,
                    reviewedHeadSha: reviewHead,
                    captureState: "complete",
                    result: "clean",
                    actionableFindings: 0,
                    statusChecks: status.length,
                    reusedReview: true,
                    silent: true,
                  },
                  settledFindingIds,
                }),
              );
            }

            return streamToolCall(
              model,
              makeToolCall(`fixture-call-${++callNumber}`, "lifecycle_submit_outcome", {
                schemaVersion: PROTOCOL_VERSION,
                outcome: "blocked",
                change: "not-applicable",
                report: "Fixture review requires additional evidence-backed fixes.",
                reviewEvidence: {
                  targetHeadSha: reviewHead,
                  reviewedHeadSha: reviewHead,
                  captureState: "complete",
                  result: "findings",
                  actionableFindings: actionableFindingDetails.length,
                  statusChecks: status.length,
                  reusedReview: true,
                  silent: true,
                },
                actionableFindingDetails,
                settledFindingIds,
              }),
            );
          }
          return streamText(model, outcome.isError ? "fixture observed arp-review outcome tool error" : "fixture observed arp-review completion");
        }

        if (activeStage === "arp-fix") {
          if (!outcome) {
            if (!bashResult) {
              const command = [
                `mkdir -p src`,
                `echo 'fixture arp-fix change' >> src/fix.txt`,
                `git add -- src/fix.txt`,
                `git commit --quiet -m 'fixture arp-fix change'`,
                `git rev-parse HEAD`,
              ].join("\n");
              return streamToolCall(model, makeToolCall(`fixture-call-${++callNumber}`, "bash", { command }));
            }
            const fixHead = extractCommitHash(bashResult) ?? contractReviewedHead ?? expectedHeadSha;
            const findings = stageFixFindings;
            return streamToolCall(
              model,
              makeToolCall(`fixture-call-${++callNumber}`, "lifecycle_submit_outcome", {
                schemaVersion: PROTOCOL_VERSION,
                outcome: "success",
                change: "not-applicable",
                report: "Fixture applied deterministic fix commit(s).",
                commitRefs: [fixHead],
                pendingSettlements: findings.map((finding) => ({
                  findingId: finding.findingId,
                  fixCommitSha: fixHead,
                  fixChangeSummary: `Fixture applied deterministic fix for ${finding.findingId}`,
                  reason: "Fixture verified the fix locally.",
                })),
              }),
            );
          }
          return streamText(model, outcome.isError ? "fixture observed arp-fix outcome tool error" : "fixture observed arp-fix success");
        }
      }

      if (activeStage === "arp-fix") {
        const outcome = latestToolResult(context, "lifecycle_submit_outcome");
        if (!outcome) {
          if (outcomeMode === "arp-fix-ambiguous") {
            return streamToolCall(
              model,
              makeToolCall(`fixture-call-${++callNumber}`, "lifecycle_submit_outcome", {
                schemaVersion: PROTOCOL_VERSION,
                outcome: "blocked",
                change: "not-applicable",
                report: "Fixture could not map findings to a safe in-scope fix.",
              }),
            );
          }
          if (outcomeMode === "arp-fix-invalid-settlement") {
            return streamToolCall(
              model,
              makeToolCall(`fixture-call-${++callNumber}`, "lifecycle_submit_outcome", {
                schemaVersion: PROTOCOL_VERSION,
                outcome: "success",
                change: "not-applicable",
                report: "Fixture intentionally submitted invalid settlement metadata.",
                commitRefs: [expectedHeadSha],
                pendingSettlements: [{
                  findingId: "finding-unrelated",
                  fixCommitSha: expectedHeadSha,
                  fixChangeSummary: "Fixture invalid settlement",
                  reason: "Fixture mode validates bridge-side settlement checks.",
                }],
              }),
            );
          }
          const findings = stageFixFindings;
          return streamToolCall(
            model,
            makeToolCall(`fixture-call-${++callNumber}`, "lifecycle_submit_outcome", {
              schemaVersion: PROTOCOL_VERSION,
              outcome: "success",
              change: "not-applicable",
              report: "Fixture applied a scoped ARP fix commit.",
              commitRefs: [expectedHeadSha],
              pendingSettlements: findings.map((finding) => ({
                findingId: finding.findingId,
                fixCommitSha: expectedHeadSha,
                fixChangeSummary: `Fixture fix summary for ${finding.findingId}`,
                reason: "Fixture verified the fix locally.",
              })),
            }),
          );
        }
        return streamText(
          model,
          outcome.isError ? "fixture observed an arp-fix outcome tool error" : "fixture observed a successful arp-fix outcome",
        );
      }

      if (activeStage === "arp-review") {
        const discovery = latestToolResult(context, "fixture_discover_agentic_review_tools");
        const status = toolResults(context, "agentic_review_get_status");
        const request = latestToolResult(context, "agentic_review_request_review");
        const findingsResult = latestToolResult(context, "agentic_review_get_findings");
        const outcome = latestToolResult(context, "lifecycle_submit_outcome");

        if (!discovery) {
          return streamToolCall(
            model,
            makeToolCall(`fixture-call-${++callNumber}`, "fixture_discover_agentic_review_tools", { target: "agentic-review" }),
          );
        }

        if (outcome) {
          return streamText(model, outcome.isError ? "fixture observed an arp-review outcome tool error" : "fixture observed a successful arp-review outcome");
        }

        if (outcomeMode === "arp-discovery-missing") {
          return streamToolCall(
            model,
            makeToolCall(`fixture-call-${++callNumber}`, "lifecycle_submit_outcome", {
              schemaVersion: PROTOCOL_VERSION,
              outcome: "blocked",
              change: "not-applicable",
              report: "Fixture discovery did not return required ARP tools.",
              reviewEvidence: completionReviewEvidence(expectedHeadSha, expectedHeadSha, "error"),
            }),
          );
        }

        const discovered = (resultData<{ tools?: Array<{ name?: string }> }>(discovery)?.tools ?? [])
          .map((tool) => tool?.name)
          .filter((name): name is string => typeof name === "string");
        const hasRequiredTools =
          discovered.includes("agentic_review_get_status") &&
          discovered.includes("agentic_review_request_review") &&
          discovered.includes("agentic_review_get_findings") &&
          discovered.includes("agentic_review_resolve_finding");
        if (!hasRequiredTools && !outcome) {
          return streamToolCall(
            model,
            makeToolCall(`fixture-call-${++callNumber}`, "lifecycle_submit_outcome", {
              schemaVersion: PROTOCOL_VERSION,
              outcome: "blocked",
              change: "not-applicable",
              report: "Fixture discovery did not return required ARP tools.",
              reviewEvidence: completionReviewEvidence(expectedHeadSha, expectedHeadSha, "error"),
            }),
          );
        }

        if (status.length === 0) {
          return streamToolCall(
            model,
            makeToolCall(`fixture-call-${++callNumber}`, "agentic_review_get_status", FIXTURE_PR),
          );
        }

        const firstStatus = resultData<{ head_sha?: string; allowed_action?: string }>(status[0]);
        if (!firstStatus) return streamText(model, "fixture missing ARP status details");

        if (firstStatus.head_sha === expectedHeadSha && stagePendingSettlements.length > 0 && !outcome) {
          if (!findingsResult) {
            return streamToolCall(model, makeToolCall(`fixture-call-${++callNumber}`, "agentic_review_get_findings", { ...FIXTURE_PR, status: "all" }));
          }
          const successful = successfulResolutions(context);
          const pending = pendingAddressedResolution(stagePendingSettlements, successful);
          if (pending && !hasResolutionAttempt(context, pending.findingId, "addressed")) {
            return streamToolCall(model, makeToolCall(`fixture-call-${++callNumber}`, "agentic_review_resolve_finding", {
              ...FIXTURE_REPOSITORY, finding_id: Number(pending.findingId), resolution: "addressed",
              fix_commit_sha: pending.fixCommitSha, fix_change_summary: pending.fixChangeSummary, reason: pending.reason,
            }));
          }
          if (pending) {
            if (toolResults(context, "agentic_review_get_findings").length < 2) {
              return streamToolCall(model, makeToolCall(`fixture-call-${++callNumber}`, "agentic_review_get_findings", { ...FIXTURE_PR, status: "all" }));
            }
            return streamToolCall(model, makeToolCall(`fixture-call-${++callNumber}`, "lifecycle_submit_outcome", {
              schemaVersion: PROTOCOL_VERSION, outcome: "blocked", change: "not-applicable",
              report: "Fixture settlement failed before re-review.",
              reviewEvidence: { ...completionReviewEvidence(expectedHeadSha, expectedHeadSha, "error"), statusChecks: status.length },
              settledFindingIds: successful.map((entry) => String(entry.finding_id)),
            }));
          }
        }

        if (!request && firstStatus.head_sha === expectedHeadSha && firstStatus.allowed_action === "REVIEW_ACTION_REVIEW_ANYWAY") {
          return streamToolCall(
            model,
            makeToolCall(`fixture-call-${++callNumber}`, "agentic_review_request_review", {
              ...FIXTURE_PR,
              action: "review_anyway",
              expected_head_sha: expectedHeadSha,
              silent: true,
            }),
          );
        }

        if (firstStatus.head_sha !== expectedHeadSha && !outcome) {
          return streamToolCall(
            model,
            makeToolCall(`fixture-call-${++callNumber}`, "lifecycle_submit_outcome", {
              schemaVersion: PROTOCOL_VERSION,
              outcome: "blocked",
              change: "not-applicable",
              report: "Fixture detected stale review head.",
              reviewEvidence: completionReviewEvidence(expectedHeadSha, firstStatus.head_sha ?? staleHeadSha, "stale"),
            }),
          );
        }

        if (request?.isError && !outcome) {
          return streamToolCall(
            model,
            makeToolCall(`fixture-call-${++callNumber}`, "lifecycle_submit_outcome", {
              schemaVersion: PROTOCOL_VERSION,
              outcome: "blocked",
              change: "not-applicable",
              report: "Fixture review request failed.",
              reviewEvidence: completionReviewEvidence(expectedHeadSha, expectedHeadSha, "error"),
            }),
          );
        }

        if (status.length === 1 && !outcome && !request?.isError) {
          return streamToolCall(
            model,
            makeToolCall(`fixture-call-${++callNumber}`, "agentic_review_get_status", FIXTURE_PR),
          );
        }

        if ((!findingsResult || (stagePendingSettlements.length > 0 && toolResults(context, "agentic_review_get_findings").length < 2)) && !outcome) {
          return streamToolCall(
            model,
            makeToolCall(`fixture-call-${++callNumber}`, "agentic_review_get_findings", {
              ...FIXTURE_PR,
              status: "all",
            }),
          );
        }

        const successful = successfulResolutions(context);
        const pendingSettlement = pendingAddressedResolution(stagePendingSettlements, successful);
        if (pendingSettlement && !hasResolutionAttempt(context, pendingSettlement.findingId, "addressed")) {
          return streamToolCall(
            model,
            makeToolCall(`fixture-call-${++callNumber}`, "agentic_review_resolve_finding", {
              ...FIXTURE_REPOSITORY,
              finding_id: Number(pendingSettlement.findingId),
              resolution: "addressed",
              fix_commit_sha: pendingSettlement.fixCommitSha,
              fix_change_summary: pendingSettlement.fixChangeSummary,
              reason: pendingSettlement.reason,
            }),
          );
        }

        const settledFindingIds = [...new Set(successful.map((entry) => String(entry.finding_id)))];
        const addressed = new Set(successful.filter((entry) => entry.resolution === "addressed").map((entry) => String(entry.finding_id)));
        const capture = resultData<{ findings?: ArpFinding[]; reviewed_sha?: string; review_in_progress?: boolean }>(findingsResult);
        if (capture?.reviewed_sha !== expectedHeadSha || capture.review_in_progress !== false) {
          return streamToolCall(model, makeToolCall(`fixture-call-${++callNumber}`, "lifecycle_submit_outcome", {
            schemaVersion: PROTOCOL_VERSION, outcome: "blocked", change: "not-applicable", report: "Fixture capture is incomplete.",
            reviewEvidence: { ...completionReviewEvidence(expectedHeadSha, capture?.reviewed_sha ?? expectedHeadSha, "error"), statusChecks: status.length },
            settledFindingIds,
          }));
        }
        const findings = capture.findings ?? [];
        const actionableFindingDetails = findings
          .filter((finding) => !addressed.has(String(finding.finding_id)))
          .map((finding) => ({
            findingId: String(finding.finding_id),
            filePath: finding.file_path,
            startLine: finding.start_line,
            endLine: finding.end_line,
            reviewedSha: finding.reviewed_sha,
            summary: finding.summary,
          }));
        for (const settlement of stagePendingSettlements) {
          if (addressed.has(settlement.findingId)) continue;
          if (actionableFindingDetails.some((finding) => finding.findingId === settlement.findingId)) continue;
          actionableFindingDetails.push({
            findingId: settlement.findingId,
            filePath: "src/execute.txt",
            startLine: 1,
            endLine: 1,
            reviewedSha: expectedHeadSha,
            summary: `Fixture unresolved addressed settlement for ${settlement.findingId}`,
          });
        }

        const allPendingSettled = stagePendingSettlements.every((settlement) => addressed.has(settlement.findingId));
        if (!outcome && allPendingSettled && actionableFindingDetails.length === 0) {
          return streamToolCall(
            model,
            makeToolCall(`fixture-call-${++callNumber}`, "lifecycle_submit_outcome", {
              schemaVersion: PROTOCOL_VERSION,
              outcome: "success",
              change: "not-applicable",
              report: "Fixture completed silent ARP review for expected head.",
              reviewEvidence: completionReviewEvidence(expectedHeadSha, expectedHeadSha, "clean"),
              settledFindingIds,
            }),
          );
        }

        if (!outcome) {
          return streamToolCall(
            model,
            makeToolCall(`fixture-call-${++callNumber}`, "lifecycle_submit_outcome", {
              schemaVersion: PROTOCOL_VERSION,
              outcome: "blocked",
              change: "not-applicable",
              report: "Fixture could not settle all addressed findings.",
              reviewEvidence: {
                targetHeadSha: expectedHeadSha,
                reviewedHeadSha: expectedHeadSha,
                captureState: "complete",
                result: "findings",
                actionableFindings: actionableFindingDetails.length,
                statusChecks: status.length,
                reusedReview: true,
                silent: true,
              },
              settledFindingIds,
              actionableFindingDetails,
            }),
          );
        }

        return streamText(
          model,
          outcome.isError ? "fixture observed an arp-review outcome tool error" : "fixture observed a successful arp-review outcome",
        );
      }

      const decisionResult = latestToolResult(context, "lifecycle_request_decision");
      const outcomeResult = latestToolResult(context, "lifecycle_submit_outcome");

      if (!decisionResult) {
        return streamToolCall(
          model,
          makeToolCall(`fixture-call-${++callNumber}`, "lifecycle_request_decision", {
            question: "May I proceed?",
            evidence: "The fixture reached its approval gate.",
            proposal: "Continue the deterministic test.",
            context: "The test does not modify candidate files.",
          }),
        );
      }

      const approvalWasReturned = !decisionResult.isError && JSON.stringify(decisionResult).toLowerCase().includes("approv");
      if (!approvalWasReturned) return streamText(model, "fixture did not observe an approved decision");

      if (!outcomeResult) {
        if (outcomeMode === "missing") return streamText(model, "fixture completed without a structured outcome");
        const outcomeArgs =
          outcomeMode === "error"
            ? { schemaVersion: PROTOCOL_VERSION, outcome: "VERIFIED", change: "not-applicable", report: "Wrong-stage result." }
            : { schemaVersion: PROTOCOL_VERSION, outcome: "success", change: "unchanged", report: "Fixture completed without candidate changes." };
        return streamToolCall(
          model,
          makeToolCall(`fixture-call-${++callNumber}`, "lifecycle_submit_outcome", outcomeArgs),
        );
      }

      return streamText(
        model,
        outcomeResult.isError ? "fixture observed an outcome tool error" : "fixture observed a successful outcome",
      );
    },
  });
}
