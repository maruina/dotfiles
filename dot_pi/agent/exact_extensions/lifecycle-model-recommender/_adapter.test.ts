import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import type { Model, ModelThinkingLevel } from "@earendil-works/pi-ai";
import type { InputEvent, InputEventResult } from "@earendil-works/pi-coding-agent";
import recommender from "./index.ts";
import type { LifecyclePhase } from "./_policy.ts";

function fixtureModel(overrides: Partial<Model<any>> & { provider: string; id: string }): Model<any> {
  return {
    name: overrides.id,
    api: "openai-responses",
    baseUrl: "https://example.invalid",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1,
    maxTokens: 1,
    ...overrides,
  } as Model<any>;
}

type RegistryEntry = { name: string; thinkingLevelMap?: Partial<Record<ModelThinkingLevel, string | null>> };

const GLM_MAP = { off: null, minimal: null, low: "low", medium: null, high: "high", xhigh: null, max: "max" };
const KIMI_MAP = { off: null, low: "low", high: "high", max: "max" };
const DEEPSEEK_MAP = { off: "none", minimal: null, low: "low", medium: null, high: "high", xhigh: null, max: null };
const GEMINI_MAP = { off: null };

const registryModels: Record<string, RegistryEntry> = {
  "ai-gw-baseten/baseten/zai-org/GLM-5.3": { name: "GLM 5.3 (Baseten)", thinkingLevelMap: GLM_MAP },
  "ai-gw-databricks/databricks/system.ai.kimi-k3": { name: "Kimi K3 (Databricks)", thinkingLevelMap: KIMI_MAP },
  "ai-gw-openai/openai/gpt-6-sol": { name: "GPT-6 Sol (OpenAI)" },
  "ai-gw-baseten/baseten/zai-org/GLM-5.3-Flash": { name: "GLM 5.3 Flash (Baseten)", thinkingLevelMap: GLM_MAP },
  "ai-gw-baseten/baseten/deepseek-ai/DeepSeek-V4-Flash-0731": { name: "DeepSeek V4 Flash 0731 (Baseten)", thinkingLevelMap: DEEPSEEK_MAP },
  "ai-gw-google/gemini-3.8-flash": { name: "Gemini 3.8 Flash (Google)", thinkingLevelMap: GEMINI_MAP },
};

const DEFAULT_ENABLED = [
  "ai-gw-baseten/baseten/zai-org/GLM-5.3",
  "ai-gw-databricks/databricks/system.ai.kimi-k3",
  "ai-gw-openai/openai/gpt-6-sol",
  "ai-gw-baseten/baseten/zai-org/GLM-5.3-Flash",
  "ai-gw-baseten/baseten/deepseek-ai/DeepSeek-V4-Flash-0731",
  "ai-gw-google/gemini-3.8-flash",
];

const settingsDirectory = mkdtempSync(join(tmpdir(), "lifecycle-recommender-"));
let settingsFileCount = 0;
after(() => rmSync(settingsDirectory, { recursive: true, force: true }));

type HarnessOptions = {
  phase?: LifecyclePhase;
  currentModel?: Model<any>;
  thinking?: ModelThinkingLevel;
  mode?: "tui" | "rpc" | "json" | "print";
  hasUI?: boolean;
  source?: InputEvent["source"];
  streamingBehavior?: InputEvent["streamingBehavior"];
  select?: (options: string[]) => string | undefined;
  foundModel?: Model<any> | undefined;
  settings?: unknown;
  rawSettings?: string;
  settingsPath?: string;
  extraRegistry?: Record<string, RegistryEntry>;
  setModel?: () => boolean;
  effectiveThinking?: ModelThinkingLevel;
};

function createHarness(options: HarnessOptions = {}) {
  let handler: ((event: InputEvent, context: any) => Promise<InputEventResult>) | undefined;
  let thinking = options.thinking ?? "medium";
  const calls: string[] = [];
  const notifications: Array<{ message: string; type: string | undefined }> = [];
  const selects: Array<{ title: string; options: string[]; optionsArg: unknown }> = [];
  const phase = options.phase ?? "/plan";

  if (options.settingsPath) {
    process.env.PI_LIFECYCLE_SETTINGS_PATH = options.settingsPath;
  } else {
    const path = join(settingsDirectory, `settings-${settingsFileCount++}.json`);
    writeFileSync(path, options.rawSettings ?? JSON.stringify({ enabledModels: options.settings ?? DEFAULT_ENABLED }));
    process.env.PI_LIFECYCLE_SETTINGS_PATH = path;
  }

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

  const registry = { ...registryModels, ...options.extraRegistry };
  const registryModel = (provider: string, id: string): Model<any> => {
    const entry = registry[`${provider}/${id}`];
    assert.ok(entry, `registry fixture lacks ${provider}/${id}`);
    return fixtureModel({ provider, id, name: entry.name, thinkingLevelMap: entry.thinkingLevelMap });
  };

  const context = {
    model: options.currentModel,
    mode: options.mode ?? "tui",
    hasUI: options.hasUI ?? true,
    modelRegistry: {
      find(provider: string, id: string) {
        calls.push(`find:${provider}/${id}`);
        if (Object.hasOwn(options, "foundModel")) return options.foundModel;
        return Object.hasOwn(registry, `${provider}/${id}`) ? registryModel(provider, id) : undefined;
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
      return handler(
        {
          type: "input",
          text: phase,
          source: options.source ?? "interactive",
          streamingBehavior: options.streamingBehavior,
          ...overrides,
        },
        context,
      );
    },
  };
}

function assertContinues(result: InputEventResult): void {
  assert.deepEqual(result, { action: "continue" });
}

function assertAppliesNothing(calls: string[]): void {
  assert.ok(calls.every((call) => call.startsWith("find:")), `unexpected mutation calls: ${calls.join(", ")}`);
}

describe("lifecycle model recommender", () => {
  it("shows the picker on every matching invocation, even when current settings already fit the pool", async () => {
    const harness = createHarness({
      currentModel: fixtureModel({ provider: "ai-gw-baseten", id: "baseten/zai-org/GLM-5.3", name: "GLM 5.3 (Baseten)" }),
      thinking: "high",
      select: () => undefined,
    });

    assertContinues(await harness.invoke());
    assert.equal(harness.selects.length, 1);
    assert.equal(harness.selects[0].title, "/plan: model selection");
    assert.deepEqual(harness.selects[0].options, [
      "Keep current model",
      "GLM 5.3 (Baseten) | high (current model)",
      "Kimi K3 (Databricks) | high",
      "GPT-6 Sol (OpenAI)",
    ]);
  });

  it("mutates nothing when the active model is in the pool and Keep current model is selected", async () => {
    const harness = createHarness({
      currentModel: fixtureModel({ provider: "ai-gw-baseten", id: "baseten/zai-org/GLM-5.3", name: "GLM 5.3 (Baseten)" }),
      thinking: "high",
      select: (choices) => choices[0],
    });

    assertContinues(await harness.invoke());
    assertAppliesNothing(harness.calls);
    assert.deepEqual(harness.notifications, []);
    assert.ok(!harness.selects[0].options.includes("Keep current settings"));
  });

  it("offers only Keep current settings when the active model is outside the pool", async () => {
    for (const select of [(choices: string[]) => choices[choices.length - 1], () => undefined] as const) {
      const harness = createHarness({
        phase: "/execute",
        currentModel: fixtureModel({ provider: "ai-gw-baseten", id: "baseten/zai-org/GLM-5.3", name: "GLM 5.3 (Baseten)" }),
        select,
      });

      assertContinues(await harness.invoke());
      const options = harness.selects[0].options;
      assert.equal(options[options.length - 1], "Keep current settings");
      assert.ok(!options.includes("Keep current model"));
      assertAppliesNothing(harness.calls);
    }
  });

  it("treats a missing active model as outside the pool", async () => {
    const harness = createHarness({ select: () => undefined });

    assertContinues(await harness.invoke());
    const options = harness.selects[0].options;
    assert.equal(options[options.length - 1], "Keep current settings");
    assert.ok(!options.includes("Keep current model"));
  });

  it("labels candidates with the model name and the computed thinking level", async () => {
    const harness = createHarness({
      phase: "/verify",
      currentModel: fixtureModel({ provider: "ai-gw-baseten", id: "baseten/zai-org/GLM-5.3", name: "GLM 5.3 (Baseten)" }),
      select: () => undefined,
    });

    assertContinues(await harness.invoke());
    assert.deepEqual(harness.selects[0].options, [
      "GLM 5.3 Flash (Baseten) | high",
      "DeepSeek V4 Flash 0731 (Baseten) | low",
      "Gemini 3.8 Flash (Google) | medium",
      "Keep current settings",
    ]);
  });

  it("disambiguates duplicate catalog names with a provider suffix on both", async () => {
    const harness = createHarness({
      settings: ["prov-a/shared/model", "prov-b/shared/model"],
      extraRegistry: {
        "prov-a/shared/model": { name: "Shared Model", thinkingLevelMap: GLM_MAP },
        "prov-b/shared/model": { name: "Shared Model", thinkingLevelMap: GLM_MAP },
      },
      select: () => undefined,
    });

    assertContinues(await harness.invoke());
    assert.deepEqual(harness.selects[0].options, [
      "Shared Model [prov-a] | high",
      "Shared Model [prov-b] | high",
      "Keep current settings",
    ]);
    assert.equal(new Set(harness.selects[0].options).size, harness.selects[0].options.length);
  });

  it("disambiguates duplicate names within one provider with the scoped entry", async () => {
    for (const [choice, modelId] of [[0, "shared/model-one"], [1, "shared/model-two"]] as const) {
      const harness = createHarness({
        settings: ["prov-a/shared/model-one", "prov-a/shared/model-two"],
        extraRegistry: {
          "prov-a/shared/model-one": { name: "Shared Model", thinkingLevelMap: GLM_MAP },
          "prov-a/shared/model-two": { name: "Shared Model", thinkingLevelMap: GLM_MAP },
        },
        select: (choices) => choices[choice],
      });

      assertContinues(await harness.invoke());
      assert.deepEqual(harness.selects[0].options, [
        "Shared Model [prov-a/shared/model-one] | high",
        "Shared Model [prov-a/shared/model-two] | high",
        "Keep current settings",
      ]);
      assert.equal(new Set(harness.selects[0].options).size, harness.selects[0].options.length);
      assert.deepEqual(harness.calls.slice(-3), [`model:prov-a/${modelId}`, "thinking:high", "get-thinking"]);
    }
  });

  it("applies the resolved pool model before its computed thinking level and preserves input", async () => {
    const harness = createHarness({ phase: "/verify", select: (choices) => choices[0] });

    assertContinues(await harness.invoke());
    assert.deepEqual(harness.calls, [
      "find:ai-gw-baseten/baseten/zai-org/GLM-5.3",
      "find:ai-gw-databricks/databricks/system.ai.kimi-k3",
      "find:ai-gw-openai/openai/gpt-6-sol",
      "find:ai-gw-baseten/baseten/zai-org/GLM-5.3-Flash",
      "find:ai-gw-baseten/baseten/deepseek-ai/DeepSeek-V4-Flash-0731",
      "find:ai-gw-google/gemini-3.8-flash",
      "model:ai-gw-baseten/baseten/zai-org/GLM-5.3-Flash",
      "thinking:high",
      "get-thinking",
    ]);
    assert.equal(harness.event.text, "/verify");
    assert.deepEqual(harness.notifications, []);
  });

  it("changes only the model for a candidate without a thinking default", async () => {
    const harness = createHarness({
      phase: "/verify",
      settings: ["prov/flash-mapless"],
      extraRegistry: { "prov/flash-mapless": { name: "Flash Mapless" } },
      select: (choices) => choices[0],
    });

    assertContinues(await harness.invoke());
    assert.deepEqual(harness.calls, ["find:prov/flash-mapless", "model:prov/flash-mapless"]);
    assert.deepEqual(harness.selects[0].options, ["Flash Mapless", "Keep current settings"]);
  });

  it("warns without setting thinking when the model selection fails", async () => {
    const harness = createHarness({ phase: "/verify", select: (choices) => choices[0], setModel: () => false });

    assertContinues(await harness.invoke());
    assert.equal(harness.notifications[0].type, "warning");
    assert.match(harness.notifications[0].message, /could not select ai-gw-baseten\/baseten\/zai-org\/GLM-5\.3-Flash/);
    assert.ok(!harness.calls.some((call) => call.startsWith("thinking:")));
  });

  it("warns when Pi clamps the requested thinking level", async () => {
    const harness = createHarness({ phase: "/verify", select: (choices) => choices[0], effectiveThinking: "medium" });

    assertContinues(await harness.invoke());
    assert.equal(harness.notifications[0].type, "warning");
    assert.match(harness.notifications[0].message, /requested high; using medium/);
  });

  it("fails open with one warning when settings are unreadable or malformed", async () => {
    const cases = [
      () => createHarness({ settingsPath: join(settingsDirectory, "missing.json") }),
      () => createHarness({ rawSettings: "{ not json" }),
      () => createHarness({ settings: "not-an-array" }),
    ];
    for (const createCase of cases) {
      const harness = createCase();
      assertContinues(await harness.invoke());
      assert.equal(harness.selects.length, 0);
      assert.equal(harness.notifications.length, 1);
      assert.equal(harness.notifications[0].type, "warning");
      assert.deepEqual(harness.calls, []);
    }
  });

  it("names skipped entries in one warning and offers the remaining pool", async () => {
    const harness = createHarness({
      phase: "/verify",
      settings: ["ghost/missing-one", "phantom/missing-two", "ai-gw-baseten/baseten/zai-org/GLM-5.3-Flash", "noslash"],
      select: (choices) => choices[0],
    });

    assertContinues(await harness.invoke());
    assert.equal(harness.notifications.length, 1);
    assert.match(harness.notifications[0].message, /noslash, ghost\/missing-one, phantom\/missing-two/);
    assert.deepEqual(harness.selects[0].options, ["GLM 5.3 Flash (Baseten) | high", "Keep current settings"]);
    assert.deepEqual(harness.calls.slice(-3), [
      "model:ai-gw-baseten/baseten/zai-org/GLM-5.3-Flash",
      "thinking:high",
      "get-thinking",
    ]);
  });

  it("warns and continues when the phase pool is empty", async () => {
    const filtered = createHarness({ phase: "/execute", settings: ["ai-gw-baseten/baseten/zai-org/GLM-5.3"] });
    assertContinues(await filtered.invoke());
    assert.equal(filtered.selects.length, 0);
    assert.equal(filtered.notifications.length, 1);
    assert.match(filtered.notifications[0].message, /no candidate models/);

    const unresolved = createHarness({ settings: ["ghost/missing"] });
    assertContinues(await unresolved.invoke());
    assert.equal(unresolved.selects.length, 0);
    assert.equal(unresolved.notifications.length, 2);
    assert.match(unresolved.notifications[1].message, /no candidate models/);
  });

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
      assertAppliesNothing(harness.calls);
    }
  });

  it("warns for queued lifecycle input when UI is available", async () => {
    const harness = createHarness({ streamingBehavior: "steer" });

    assertContinues(await harness.invoke());
    assert.equal(harness.notifications[0].type, "warning");
    assert.match(harness.notifications[0].message, /queued lifecycle input/);
  });

  it("passes through lookalike commands", async () => {
    const harness = createHarness();

    assertContinues(await harness.invoke({ text: "/planning" }));
    assert.equal(harness.selects.length, 0);
    assert.deepEqual(harness.calls, []);
  });

  it("uses a 30-second select timeout only for RPC input and treats no answer as cancellation", async () => {
    const rpc = createHarness({ mode: "rpc", select: () => undefined });
    assertContinues(await rpc.invoke());
    assert.deepEqual(rpc.selects[0].optionsArg, { timeout: 30000 });
    assertAppliesNothing(rpc.calls);

    const tui = createHarness({ select: () => undefined });
    assertContinues(await tui.invoke());
    assert.equal(tui.selects[0].optionsArg, undefined);
  });

  it("re-reads settings on every invocation so scoped edits apply at the next command", async () => {
    const path = join(settingsDirectory, "settings-live.json");
    writeFileSync(path, JSON.stringify({ enabledModels: DEFAULT_ENABLED }));

    const first = createHarness({ settingsPath: path, select: () => undefined });
    assertContinues(await first.invoke());
    assert.ok(first.selects[0].options.some((label) => label.startsWith("GPT-6 Sol")));

    writeFileSync(
      path,
      JSON.stringify({ enabledModels: DEFAULT_ENABLED.filter((entry) => entry !== "ai-gw-openai/openai/gpt-6-sol") }),
    );
    const second = createHarness({ settingsPath: path, select: () => undefined });
    assertContinues(await second.invoke());
    assert.ok(!second.selects[0].options.some((label) => label.startsWith("GPT-6 Sol")));
  });
});
