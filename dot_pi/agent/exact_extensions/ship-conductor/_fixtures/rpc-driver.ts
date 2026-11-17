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

function latestUserText(context: { messages: Array<{ role: string; content?: unknown }> }): string {
  for (const message of [...context.messages].reverse()) {
    if (message.role !== "user") continue;
    const content =
      typeof message.content === "string"
        ? message.content
        : Array.isArray(message.content)
          ? message.content
              .filter((part): part is { type: string; text?: string } => typeof part === "object" && part !== null && "type" in part)
              .filter((part) => part.type === "text")
              .map((part) => part.text ?? "")
              .join("")
          : "";
    if (content && !content.startsWith("Protocol version:")) return content;
  }
  return "";
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
  const stage = process.env.PI_LIFECYCLE_TEST_STAGE ?? "execute";
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
    ],
    streamSimple(model, context) {
      if (outcomeMode === "expansion") {
        return streamText(model, `fixture-expanded:${JSON.stringify(latestUserText(context))}`);
      }

      if (stage === "arp-review") {
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
