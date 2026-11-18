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
import { PROTOCOL_VERSION } from "../_protocol.ts";

const PROVIDER = "lifecycle-test";
const API = "lifecycle-test-api";
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
  context: { messages: Array<{ role: string; toolName?: string; isError?: boolean; details?: unknown }> },
  toolName: string,
) {
  return context.messages.filter((message) => message.role === "toolResult" && message.toolName === toolName);
}

function latestToolResult(
  context: { messages: Array<{ role: string; toolName?: string; isError?: boolean; details?: unknown }> },
  toolName: string,
): { role: string; toolName?: string; isError?: boolean; details?: unknown } | undefined {
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

function contractPendingSettlementIds(contract: string | undefined): string[] {
  const raw = contractValue(contract, "Pending settlement IDs");
  if (!raw || raw === "none") return [];
  return raw.split(",").map((value) => value.trim()).filter(Boolean);
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

export default function lifecycleRpcDriver(pi: ExtensionAPI): void {
  let callNumber = 0;
  let statusChecks = 0;
  const outcomeMode = process.env.PI_LIFECYCLE_TEST_OUTCOME ?? "success";
  const configuredStage = process.env.PI_LIFECYCLE_TEST_STAGE ?? "execute";
  const expectedHeadSha = process.env.PI_LIFECYCLE_TEST_EXPECTED_HEAD ?? "a".repeat(40);
  const staleHeadSha = process.env.PI_LIFECYCLE_TEST_STALE_HEAD ?? "f".repeat(40);

  pi.registerTool({
    name: "fixture_discover_agentic_review_tools",
    label: "Fixture deferred tool discovery",
    description: "Fixture deferred tool discovery",
    parameters: { type: "object", additionalProperties: true } as const,
    async execute() {
      if (outcomeMode === "arp-discovery-missing") {
        return {
          content: [{ type: "text" as const, text: "fixture discovery intentionally omitted review-request tool" }],
          details: { tools: [{ name: "agentic_review_get_status" }] },
        };
      }
      return {
        content: [{ type: "text" as const, text: "fixture discovered ARP tools" }],
        details: {
          tools: [
            { name: "agentic_review_get_status" },
            { name: "agentic_review_request_review" },
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
    parameters: { type: "object", additionalProperties: true } as const,
    async execute() {
      statusChecks += 1;
      const stale = outcomeMode === "arp-stale-head";
      const head = stale ? staleHeadSha : expectedHeadSha;
      const details = {
        head_sha: head,
        allowed_action: outcomeMode === "arp-discovery-missing"
          ? "REVIEW_ACTION_NONE"
          : statusChecks === 1
            ? "REVIEW_ACTION_REVIEW_ANYWAY"
            : "REVIEW_ACTION_NONE",
        capture_complete: !stale && statusChecks >= 2,
        review_in_progress: stale || statusChecks < 2,
        actionable_findings: stale ? 1 : 0,
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
    parameters: { type: "object", additionalProperties: true } as const,
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
    name: "agentic_review_resolve_finding",
    label: "Fixture ARP resolve",
    description: "Fixture ARP resolve",
    parameters: { type: "object", additionalProperties: true } as const,
    async execute(_toolCallId, params) {
      return {
        content: [{ type: "text" as const, text: "fixture finding resolved" }],
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

      if (configuredStage === "auto") {
        const outcome = latestToolResult(context, "lifecycle_submit_outcome");
        const bashResult = latestToolResult(context, "bash");
        const pendingSettlementIds = contractPendingSettlementIds(contract);

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

        if (activeStage === "pr-publish") {
          if (!outcome) {
            const publishedHead = contractCandidateHead ?? expectedHeadSha;
            return streamToolCall(
              model,
              makeToolCall(`fixture-call-${++callNumber}`, "lifecycle_submit_outcome", {
                schemaVersion: PROTOCOL_VERSION,
                outcome: "success",
                change: "not-applicable",
                report: "Fixture published the current candidate head.",
                prUrl: "https://github.com/DataDog/repo/pull/123",
                publishedHeadSha: publishedHead,
                commitRefs: [publishedHead],
              }),
            );
          }
          return streamText(model, outcome.isError ? "fixture observed pr-publish outcome tool error" : "fixture observed pr-publish success");
        }

        if (activeStage === "arp-review") {
          if (!outcome) {
            const reviewHead = contractExpectedReviewHead ?? contractCandidateHead ?? expectedHeadSha;
            if (pendingSettlementIds.length > 0) {
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
                    statusChecks: 2,
                    reusedReview: true,
                    silent: true,
                  },
                  settledFindingIds: pendingSettlementIds,
                }),
              );
            }
            return streamToolCall(
              model,
              makeToolCall(`fixture-call-${++callNumber}`, "lifecycle_submit_outcome", {
                schemaVersion: PROTOCOL_VERSION,
                outcome: "blocked",
                change: "not-applicable",
                report: "Fixture review found one actionable issue and one false positive.",
                reviewEvidence: {
                  targetHeadSha: reviewHead,
                  reviewedHeadSha: reviewHead,
                  captureState: "complete",
                  result: "findings",
                  actionableFindings: 1,
                  statusChecks: 2,
                  reusedReview: true,
                  silent: true,
                },
                actionableFindingDetails: [{
                  findingId: "finding-1",
                  filePath: "src/execute.txt",
                  startLine: 1,
                  endLine: 1,
                  reviewedSha: reviewHead,
                  summary: "Fixture actionable finding",
                }],
                settledFindingIds: ["invalid-1"],
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
            return streamToolCall(
              model,
              makeToolCall(`fixture-call-${++callNumber}`, "lifecycle_submit_outcome", {
                schemaVersion: PROTOCOL_VERSION,
                outcome: "success",
                change: "not-applicable",
                report: "Fixture applied one deterministic fix commit.",
                commitRefs: [fixHead],
                pendingSettlements: [{
                  findingId: "finding-1",
                  fixCommitSha: fixHead,
                  fixChangeSummary: "Fixture applied deterministic fix",
                  reason: "Fixture verified the fix locally.",
                }],
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
          return streamToolCall(
            model,
            makeToolCall(`fixture-call-${++callNumber}`, "lifecycle_submit_outcome", {
              schemaVersion: PROTOCOL_VERSION,
              outcome: "success",
              change: "not-applicable",
              report: "Fixture applied a scoped ARP fix commit.",
              commitRefs: [expectedHeadSha],
              pendingSettlements: [{
                findingId: "finding-1",
                fixCommitSha: expectedHeadSha,
                fixChangeSummary: "Fixture fix summary",
                reason: "Fixture verified the fix locally.",
              }],
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
        const outcome = latestToolResult(context, "lifecycle_submit_outcome");

        if (!discovery) {
          return streamToolCall(
            model,
            makeToolCall(`fixture-call-${++callNumber}`, "fixture_discover_agentic_review_tools", { target: "agentic-review" }),
          );
        }

        if (outcomeMode === "arp-discovery-missing" && !outcome) {
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

        const discovered = ((discovery.details as { tools?: Array<{ name?: string }> } | undefined)?.tools ?? [])
          .map((tool) => tool?.name)
          .filter((name): name is string => typeof name === "string");
        const hasRequiredTools = discovered.includes("agentic_review_get_status") && discovered.includes("agentic_review_request_review");
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
            makeToolCall(`fixture-call-${++callNumber}`, "agentic_review_get_status", {
              pr_url: "https://github.com/DataDog/repo/pull/123",
              expected_head_sha: expectedHeadSha,
            }),
          );
        }

        const firstStatus = status[0]?.details as
          | { head_sha?: string; allowed_action?: string; review_in_progress?: boolean; unresolved_findings?: number }
          | undefined;
        if (!firstStatus) return streamText(model, "fixture missing ARP status details");

        if (!request && firstStatus.head_sha === expectedHeadSha && firstStatus.allowed_action === "REVIEW_ACTION_REVIEW_ANYWAY") {
          return streamToolCall(
            model,
            makeToolCall(`fixture-call-${++callNumber}`, "agentic_review_request_review", {
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
            makeToolCall(`fixture-call-${++callNumber}`, "agentic_review_get_status", {
              pr_url: "https://github.com/DataDog/repo/pull/123",
              expected_head_sha: expectedHeadSha,
              poll: true,
            }),
          );
        }

        if (!outcome) {
          return streamToolCall(
            model,
            makeToolCall(`fixture-call-${++callNumber}`, "lifecycle_submit_outcome", {
              schemaVersion: PROTOCOL_VERSION,
              outcome: "success",
              change: "not-applicable",
              report: "Fixture completed silent ARP review for expected head.",
              reviewEvidence: completionReviewEvidence(expectedHeadSha, expectedHeadSha, "clean"),
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
