import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  IMPLEMENTER_POOL,
  VERIFIER_POOL,
  selectModels,
  type ModelRegistryLike,
  type PooledModel,
} from "./_pools.ts";

function registry(available: PooledModel[]): ModelRegistryLike {
  const byId = new Map(available.map((m) => [m.id, m]));
  return {
    find(provider, modelId) {
      const model = byId.get(modelId);
      return model && model.provider === provider ? model : undefined;
    },
    getProviderAuthStatus(provider) {
      return { configured: available.some((m) => m.provider === provider) };
    },
  };
}

const ALL = [...IMPLEMENTER_POOL, ...VERIFIER_POOL];

describe("selectModels", () => {
  it("selects the first available implementer and a distinct verifier", () => {
    const selection = selectModels(registry(ALL));
    assert.ok(selection.ok);
    if (!selection.ok) return;
    assert.deepEqual(selection.implementer, { provider: "ai-gw-baseten", id: "baseten/zai-org/GLM-5.3" });
    assert.deepEqual(selection.verifier, { provider: "ai-gw-baseten", id: "baseten/zai-org/GLM-5.3-Flash" });
    assert.notEqual(selection.implementer.id, selection.verifier.id);
  });

  it("skips an unavailable first implementer and uses the next entry", () => {
    const available = ALL.filter((m) => m.id !== "baseten/zai-org/GLM-5.3");
    const selection = selectModels(registry(available));
    assert.ok(selection.ok);
    if (!selection.ok) return;
    assert.equal(selection.implementer.id, "baseten/zai-org/GLM-5.3-Flash");
    assert.equal(selection.verifier.id, "baseten/deepseek-ai/DeepSeek-V4-Flash-0731");
  });

  it("skips a pooled model whose provider is unauthenticated", () => {
    const available = ALL.filter((m) => m.id !== "baseten/zai-org/GLM-5.3");
    const unauthenticated: ModelRegistryLike = {
      find(provider, modelId) {
        const model = available.find((m) => m.id === modelId && m.provider === provider);
        return model ? model : undefined;
      },
      getProviderAuthStatus(provider) {
        return { configured: provider !== "ai-gw-baseten" };
      },
    };
    const selection = selectModels(unauthenticated);
    assert.ok(selection.ok);
    if (!selection.ok) return;
    assert.equal(selection.implementer.id, "databricks/system.ai.kimi-k3");
    assert.equal(selection.verifier.id, "gemini-3.8-flash");
  });

  it("refuses when no distinct verifier is available", () => {
    const selection = selectModels(registry([{ provider: "ai-gw-baseten", id: "baseten/zai-org/GLM-5.3" }]));
    assert.ok(!selection.ok);
    if (selection.ok) return;
    assert.match(selection.reason, /No distinct verifier/);
  });

  it("refuses when the implementer pool is exhausted", () => {
    const selection = selectModels(registry([]));
    assert.ok(!selection.ok);
    if (selection.ok) return;
    assert.match(selection.reason, /No available implementer/);
  });

  it("refuses when the only shared model is the implementer", () => {
    const only = { provider: "ai-gw-baseten", id: "baseten/zai-org/GLM-5.3-Flash" };
    const selection = selectModels(registry([only]));
    assert.ok(!selection.ok);
    if (selection.ok) return;
    assert.match(selection.reason, /No distinct verifier/);
  });
});
