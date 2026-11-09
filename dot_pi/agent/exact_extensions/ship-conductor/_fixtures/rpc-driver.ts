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

function findToolResult(context: { messages: Array<{ role: string; toolName?: string; isError?: boolean; details?: unknown }> }, toolName: string) {
  return context.messages.find((message) => message.role === "toolResult" && message.toolName === toolName);
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

export default function lifecycleRpcDriver(pi: ExtensionAPI): void {
  let callNumber = 0;
  const outcomeMode = process.env.PI_LIFECYCLE_TEST_OUTCOME ?? "success";

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

      const decisionResult = findToolResult(context, "lifecycle_request_decision");
      const outcomeResult = findToolResult(context, "lifecycle_submit_outcome");

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
            ? { schemaVersion: 1, outcome: "VERIFIED", change: "not-applicable", report: "Wrong-stage result." }
            : { schemaVersion: 1, outcome: "success", change: "unchanged", report: "Fixture completed without candidate changes." };
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
