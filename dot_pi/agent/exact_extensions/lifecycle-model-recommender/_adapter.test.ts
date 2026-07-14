import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { Model, ModelThinkingLevel } from "@earendil-works/pi-ai";
import type { InputEvent, InputEventResult } from "@earendil-works/pi-coding-agent";
import recommender from "./index.ts";
import { LIFECYCLE_POLICY, type LifecyclePhase } from "./_policy.ts";

function model(provider: string, id: string): Model<any> {
  return {
    provider,
    id,
    name: id,
    api: "openai-responses",
    baseUrl: "https://example.invalid",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1,
    maxTokens: 1,
  };
}

function createHarness(options: {
  phase?: LifecyclePhase;
  currentModel?: Model<any>;
  thinking?: ModelThinkingLevel;
  mode?: "tui" | "rpc" | "json" | "print";
  hasUI?: boolean;
  source?: InputEvent["source"];
  streamingBehavior?: InputEvent["streamingBehavior"];
  select?: (options: string[]) => string | undefined;
  foundModel?: Model<any> | undefined;
  setModel?: () => boolean;
  effectiveThinking?: ModelThinkingLevel;
} = {}) {
  let handler: ((event: InputEvent, context: any) => Promise<InputEventResult>) | undefined;
  let thinking = options.thinking ?? "medium";
  const selectedModel = options.currentModel;
  const calls: string[] = [];
  const notifications: Array<{ message: string; type: string | undefined }> = [];
  const selects: Array<{ title: string; options: string[]; optionsArg: unknown }> = [];
  const phase = options.phase ?? "/plan";
  const hasFoundModelOverride = Object.hasOwn(options, "foundModel");

  recommender({
    on(event: string, registered: typeof handler) {
      assert.equal(event, "input");
      handler = registered;
    },
    async setModel(nextModel: Model<any>) {
      calls.push(`model:${nextModel.provider}/${nextModel.id}`);
      return options.setModel?.() ?? true;
    },
    getThinkingLevel() {
      calls.push("get-thinking");
      return thinking;
    },
    setThinkingLevel(level: ModelThinkingLevel) {
      calls.push(`thinking:${level}`);
      thinking = options.effectiveThinking ?? level;
    },
  } as any);

  const context = {
    model: selectedModel,
    mode: options.mode ?? "tui",
    hasUI: options.hasUI ?? true,
    modelRegistry: {
      find(provider: string, id: string) {
        calls.push(`find:${provider}/${id}`);
        return hasFoundModelOverride ? options.foundModel : model(provider, id);
      },
    },
    ui: {
      async select(title: string, choices: string[], selectOptions?: unknown) {
        selects.push({ title, options: choices, optionsArg: selectOptions });
        return options.select?.(choices);
      },
      notify(message: string, type?: string) {
        notifications.push({ message, type });
      },
    },
  };

  return {
    calls,
    context,
    notifications,
    selects,
    event: {
      type: "input",
      text: phase,
      source: options.source ?? "interactive",
      streamingBehavior: options.streamingBehavior,
    } as InputEvent,
    invoke: async (overrides: Partial<InputEvent> = {}) => {
      assert.ok(handler, "input handler registered");
      return handler({
        type: "input",
        text: phase,
        source: options.source ?? "interactive",
        streamingBehavior: options.streamingBehavior,
        ...overrides,
      }, context);
    },
  };
}

function assertContinues(result: InputEventResult): void {
  assert.deepEqual(result, { action: "continue" });
}

describe("lifecycle model recommender", () => {
  it("notifies without prompting when settings already match the recommendation", async () => {
    const choice = LIFECYCLE_POLICY["/plan"].recommended;
    const harness = createHarness({ currentModel: model(choice.provider, choice.model), thinking: choice.thinking });

    assertContinues(await harness.invoke());
    assert.equal(harness.selects.length, 0);
    assert.deepEqual(harness.notifications, [{ message: "/plan: already using recommended GPT-5.6 Sol / high", type: "info" }]);
    assert.deepEqual(harness.calls, ["get-thinking"]);
  });

  it("treats an undefined current model as a mismatch and presents stable, unique options", async () => {
    const harness = createHarness({ currentModel: undefined, select: () => undefined });

    assertContinues(await harness.invoke());
    assert.equal(harness.selects.length, 1);
    assert.deepEqual(harness.selects[0].optionsArg, undefined);
    assert.match(harness.selects[0].options[0], /^Apply recommendation: GPT-5\.6 Sol \| high \| Balanced \| /);
    assert.match(harness.selects[0].options[1], /^Lower cost: GPT-5\.6 Terra \| high \| Economy \| /);
    assert.match(harness.selects[0].options[2], /^Increase quality: GPT-5\.6 Sol \| xhigh \| Premium \| /);
    assert.equal(harness.selects[0].options[3], "Keep current settings");
    assert.equal(new Set(harness.selects[0].options).size, 4);
  });

  it("marks a choice that matches the current settings", async () => {
    const choice = LIFECYCLE_POLICY["/plan"].lowerCost;
    const harness = createHarness({ currentModel: model(choice.provider, choice.model), thinking: choice.thinking, select: () => undefined });

    assertContinues(await harness.invoke());
    assert.match(harness.selects[0].options[1], /\(current settings\)$/);
  });

  it("uses a 30-second select timeout only for RPC input", async () => {
    const harness = createHarness({ mode: "rpc", select: () => undefined });

    assertContinues(await harness.invoke());
    assert.deepEqual(harness.selects[0].optionsArg, { timeout: 30000 });
  });

  for (const [position, index] of [["recommended", 0], ["lowerCost", 1], ["increaseQuality", 2]] as const) {
    it(`applies ${position} model before thinking and preserves input`, async () => {
      const phase = "/execute";
      const choice = LIFECYCLE_POLICY[phase][position];
      const harness = createHarness({ phase, select: (choices) => choices[index] });

      assertContinues(await harness.invoke());
      assert.deepEqual(harness.calls, [
        "get-thinking",
        `find:${choice.provider}/${choice.model}`,
        `model:${choice.provider}/${choice.model}`,
        `thinking:${choice.thinking}`,
        "get-thinking",
      ]);
      assert.equal(harness.event.text, phase);
    });
  }

  for (const selection of [undefined, "Keep current settings"] as const) {
    it(`does not mutate for ${selection ?? "cancellation or RPC timeout"}`, async () => {
      const harness = createHarness({ select: () => selection ?? undefined });

      assertContinues(await harness.invoke());
      assert.deepEqual(harness.calls, ["get-thinking"]);
    });
  }

  it("passes through non-interactive, queued, lookalike, and extension input without mutation", async () => {
    for (const options of [
      { mode: "print" as const, hasUI: false },
      { mode: "json" as const, hasUI: false },
      { streamingBehavior: "steer" as const, hasUI: true },
      { streamingBehavior: "followUp" as const, hasUI: false },
      { source: "extension" as const },
    ]) {
      const harness = createHarness(options);
      assertContinues(await harness.invoke());
      assert.equal(harness.selects.length, 0);
      assert.equal(harness.calls.length, 0);
    }

    const harness = createHarness();
    assertContinues(await harness.invoke({ text: "/planning" }));
    assert.equal(harness.selects.length, 0);
    assert.equal(harness.calls.length, 0);
  });

  it("warns for queued lifecycle input when UI is available", async () => {
    const harness = createHarness({ streamingBehavior: "steer" });

    assertContinues(await harness.invoke());
    assert.equal(harness.notifications[0].type, "warning");
    assert.match(harness.notifications[0].message, /queued lifecycle input/);
  });

  it("warns and continues when the selected model is unavailable or unauthenticated", async () => {
    const missing = createHarness({ foundModel: undefined, select: (choices) => choices[0] });
    assertContinues(await missing.invoke());
    assert.deepEqual(missing.calls, ["get-thinking", "find:ai-gw-openai/openai/gpt-5.6-sol"]);
    assert.equal(missing.notifications[0].type, "warning");

    const unauthenticated = createHarness({ setModel: () => false, select: (choices) => choices[0] });
    assertContinues(await unauthenticated.invoke());
    assert.deepEqual(unauthenticated.calls, [
      "get-thinking",
      "find:ai-gw-openai/openai/gpt-5.6-sol",
      "model:ai-gw-openai/openai/gpt-5.6-sol",
    ]);
    assert.equal(unauthenticated.notifications[0].type, "warning");
  });

  it("warns when Pi clamps the requested thinking level", async () => {
    const harness = createHarness({ select: (choices) => choices[0], effectiveThinking: "medium" });

    assertContinues(await harness.invoke());
    assert.equal(harness.notifications[0].type, "warning");
    assert.match(harness.notifications[0].message, /requested high; using medium/);
  });
});
