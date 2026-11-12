import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { selectModels, type LifecycleModel, type ModelRegistryLike, type ModelSelectionUI } from "./_models.ts";

const MODELS: LifecycleModel[] = [
  { provider: "gateway-a", id: "family/model-1", name: "Model One" },
  { provider: "gateway-a", id: "family/model-2", name: "Model Two" },
  { provider: "gateway-b", id: "family/model-1", name: "Model One mirror" },
  { provider: "gateway-b", id: "family/model-3", name: "Model Three" },
];

function registry(available = MODELS): ModelRegistryLike {
  return {
    getAvailable: () => available,
    find(provider, id) {
      return available.find((model) => model.provider === provider && model.id === id);
    },
    hasConfiguredAuth(model) {
      return available.some((candidate) => candidate.provider === model.provider && candidate.id === model.id);
    },
  };
}

function choose(ids: Record<string, string>, confirmations: boolean[] = []): {
  ui: ModelSelectionUI;
  calls: Array<{ stage: string; options: string[] }>;
  confirmationsUsed: number[];
} {
  const calls: Array<{ stage: string; options: string[] }> = [];
  const confirmationsUsed: number[] = [];
  let confirmationIndex = 0;
  return {
    calls,
    confirmationsUsed,
    ui: {
      async select(stage, options) {
        calls.push({ stage, options });
        const id = ids[stage];
        return options.find((option) => option.endsWith(`(${id})`));
      },
      async selectThinking(stage, _model, options) {
        calls.push({ stage: `${stage}:thinking`, options });
        const level = ids[`${stage}:thinking`];
        return level === undefined ? options[0] : options.find((option) => option === level || option.startsWith(`${level} `));
      },
      async confirmIndependent(_verifier, _writer) {
        confirmationsUsed.push(confirmationIndex);
        return confirmations[confirmationIndex++] ?? false;
      },
    },
  };
}

const CURRENT = { provider: "gateway-a", id: "family/model-1" };

describe("selectModels", () => {
  it("asks for execute, simplify, and verify in order and puts the current model first for writers", async () => {
    const selections = choose({
      execute: "gateway-a/family/model-1",
      simplify: "gateway-a/family/model-1",
      verify: "gateway-a/family/model-2",
    });
    const result = await selectModels(registry(), CURRENT, selections.ui);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(selections.calls.map((call) => call.stage), ["execute", "simplify", "verify"]);
    assert.match(selections.calls[0].options[0], /gateway-a\/family\/model-1/);
    assert.match(selections.calls[1].options[0], /gateway-a\/family\/model-1/);
    assert.equal(result.models.execute.provider, "gateway-a");
    assert.equal(result.models.simplify.id, result.models.execute.id);
    assert.equal(result.models.verify.id, "family/model-2");
  });

  it("filters the same model ID across providers as a conservative known equivalent", async () => {
    const selections = choose({
      execute: "gateway-a/family/model-1",
      simplify: "gateway-a/family/model-1",
      verify: "gateway-a/family/model-2",
    });
    const result = await selectModels(registry(), CURRENT, selections.ui);
    assert.equal(result.ok, true);
    assert.ok(!selections.calls[2].options.some((option) => option.endsWith("(gateway-b/family/model-1)")));
    assert.equal(selections.confirmationsUsed.length, 0);
  });

  it("requires user confirmation before accepting an unknown cross-provider verifier", async () => {
    const selections = choose({
      execute: "gateway-a/family/model-1",
      simplify: "gateway-a/family/model-1",
      verify: "gateway-b/family/model-3",
    }, [true]);
    const result = await selectModels(registry(), CURRENT, selections.ui);
    assert.equal(result.ok, true);
    assert.deepEqual(selections.confirmationsUsed, [0]);
  });

  it("stops when independence is not confirmed", async () => {
    const selections = choose({
      execute: "gateway-a/family/model-1",
      simplify: "gateway-a/family/model-1",
      verify: "gateway-b/family/model-3",
    }, [false]);
    const result = await selectModels(registry(), CURRENT, selections.ui);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /independence was not confirmed/);
  });

  it("does not silently substitute a model when a selection is cancelled or unavailable", async () => {
    const cancelled = await selectModels(registry(), CURRENT, {
      select: async () => undefined,
      selectThinking: async () => undefined,
      confirmIndependent: async () => true,
    });
    assert.equal(cancelled.ok, false);
    if (!cancelled.ok) assert.match(cancelled.reason, /cancelled/);

    const invalid = await selectModels(registry(), CURRENT, {
      async select(stage, options) {
        return stage === "execute" ? "not a model" : options[0];
      },
      selectThinking: async (_stage, _model, options) => options[0],
      confirmIndependent: async () => true,
    });
    assert.equal(invalid.ok, false);
    if (!invalid.ok) assert.match(invalid.reason, /not in the available choices/);
  });

  it("refuses when no authenticated model registry entry is available", async () => {
    const result = await selectModels(registry([]), undefined, {
      select: async () => undefined,
      selectThinking: async () => undefined,
      confirmIndependent: async () => true,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /No available authenticated chat models/);
  });

  it("offers only the session's scoped models in every picker", async () => {
    const selections = choose({
      execute: "gateway-a/family/model-1",
      simplify: "gateway-a/family/model-1",
      verify: "gateway-b/family/model-3",
    }, [true]);
    const scoped = [
      { provider: "gateway-a", id: "family/model-1" },
      { provider: "gateway-b", id: "family/model-3" },
    ];
    const result = await selectModels(registry(), CURRENT, selections.ui, { scoped });
    assert.equal(result.ok, true);
    const offered = (stage: string) => selections.calls.find((call) => call.stage === stage)!.options.map((option) => option.match(/\(([^)]+)\)$/)![1]);
    assert.deepEqual(offered("execute"), ["gateway-a/family/model-1", "gateway-b/family/model-3"]);
    assert.deepEqual(offered("simplify"), ["gateway-a/family/model-1", "gateway-b/family/model-3"]);
    assert.deepEqual(offered("verify"), ["gateway-b/family/model-3"]);
  });

  it("asks for a supported thinking level after each model and records it per stage", async () => {
    const selections = choose({
      execute: "gateway-a/family/model-1",
      "execute:thinking": "high",
      simplify: "gateway-a/family/model-1",
      verify: "gateway-a/family/model-2",
      "verify:thinking": "low",
    });
    const result = await selectModels(registry(), CURRENT, selections.ui, {
      defaultThinkingLevel: "medium",
      supportedThinkingLevels: () => ["off", "low", "medium", "high"],
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(selections.calls.map((call) => call.stage), [
      "execute", "execute:thinking", "simplify", "simplify:thinking", "verify", "verify:thinking",
    ]);
    assert.deepEqual(selections.calls[1].options, ["medium (default)", "off", "low", "high"]);
    assert.deepEqual(result.thinkingLevels, { execute: "high", simplify: "medium", verify: "low" });
  });

  it("defaults to a thinking level pinned by the scope and skips the picker for a single supported level", async () => {
    const selections = choose({
      execute: "gateway-a/family/model-1",
      simplify: "gateway-a/family/model-1",
      verify: "gateway-a/family/model-2",
    });
    const result = await selectModels(registry(), CURRENT, selections.ui, {
      scoped: [
        { provider: "gateway-a", id: "family/model-1", thinkingLevel: "high" },
        { provider: "gateway-a", id: "family/model-2" },
      ],
      defaultThinkingLevel: "medium",
      supportedThinkingLevels: (model) => model.id === "family/model-2" ? ["off"] : ["low", "medium", "high"],
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(selections.calls.map((call) => call.stage), ["execute", "execute:thinking", "simplify", "simplify:thinking", "verify"]);
    assert.equal(selections.calls[1].options[0], "high (default)");
    assert.deepEqual(result.thinkingLevels, { execute: "high", simplify: "high", verify: "off" });
  });

  it("stops without substitution when a thinking selection is cancelled or invalid", async () => {
    for (const answer of [undefined, "ultra"]) {
      const result = await selectModels(registry(), CURRENT, {
        select: async (_stage, options) => options[0],
        selectThinking: async () => answer,
        confirmIndependent: async () => true,
      }, { defaultThinkingLevel: "medium", supportedThinkingLevels: () => ["low", "medium"] });
      assert.equal(result.ok, false);
      if (!result.ok) assert.match(result.reason, answer === undefined ? /thinking level selection was cancelled/ : /not in the supported thinking levels/);
    }
  });

  it("does not fall back to the full catalogue when no scoped model is available", async () => {
    const selections = choose({});
    const result = await selectModels(registry(), CURRENT, selections.ui, { scoped: [{ provider: "gateway-c", id: "missing" }] });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /scoped models/i);
    assert.equal(selections.calls.length, 0);
  });
});
