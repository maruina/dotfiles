import { createAssistantMessageEventStream, type Api, type AssistantMessage, type Model } from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync } from "node:fs";

export default function fixtureProvider(pi: ExtensionAPI): void {
  pi.registerProvider("worktrunk-fixture", {
    name: "Worktrunk fixture",
    baseUrl: "http://127.0.0.1",
    apiKey: "fixture-only",
    api: "worktrunk-fixture-api",
    models: [{ id: "fixture", name: "Fixture", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 8192, maxTokens: 1024 }],
    streamSimple(model: Model<Api>) {
      const stream = createAssistantMessageEventStream();
      const message: AssistantMessage = {
        role: "assistant", content: [], api: model.api, provider: model.provider, model: model.id,
        timestamp: Date.now(), usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: "pending",
      };
      stream.push({ type: "start", partial: message });
      const deadline = Date.now() + 10_000;
      const interval = setInterval(() => {
        if (!existsSync(process.env.WORKTRUNK_FIXTURE_RELEASE ?? "") && Date.now() < deadline) return;
        clearInterval(interval);
        message.content = [{ type: "text", text: "fixture complete" }];
        message.stopReason = "stop";
        stream.push({ type: "done", reason: "stop", message });
        stream.end(message);
      }, 20);
      return stream;
    },
  });
}
