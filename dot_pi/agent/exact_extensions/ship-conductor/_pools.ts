/**
 * Model pools for the /ship stages, declared as data so selection stays
 * explicit and reviewable. The subprocess `--model` receives the bare catalog
 * id (unique in the catalog); the provider is used only for registry lookups.
 */

export type PooledModel = {
  provider: string;
  id: string;
};

export const IMPLEMENTER_POOL: PooledModel[] = [
  { provider: "ai-gw-baseten", id: "baseten/zai-org/GLM-5.3" },
  { provider: "ai-gw-baseten", id: "baseten/zai-org/GLM-5.3-Flash" },
  { provider: "ai-gw-baseten", id: "baseten/deepseek-ai/DeepSeek-V4-Flash-0731" },
  { provider: "ai-gw-databricks", id: "databricks/system.ai.kimi-k3" },
];

export const VERIFIER_POOL: PooledModel[] = [
  { provider: "ai-gw-baseten", id: "baseten/zai-org/GLM-5.3-Flash" },
  { provider: "ai-gw-baseten", id: "baseten/deepseek-ai/DeepSeek-V4-Flash-0731" },
  { provider: "ai-gw-google", id: "gemini-3.8-flash" },
];

/** The subset of ctx.modelRegistry the conductor needs for pre-flight. */
export type ModelRegistryLike = {
  find(provider: string, modelId: string): unknown;
  getProviderAuthStatus(provider: string): { configured: boolean };
};

export type ModelSelection =
  | { ok: true; implementer: PooledModel; verifier: PooledModel }
  | { ok: false; reason: string };

function isAvailable(registry: ModelRegistryLike, model: PooledModel): boolean {
  return Boolean(registry.find(model.provider, model.id)) && registry.getProviderAuthStatus(model.provider).configured;
}

export function selectModels(
  registry: ModelRegistryLike,
  implementerPool: PooledModel[] = IMPLEMENTER_POOL,
  verifierPool: PooledModel[] = VERIFIER_POOL,
): ModelSelection {
  // deliberate: first-available selection; upgrade path is round-robin or
  // cost-aware selection once the pools grow.
  const implementer = implementerPool.find((model) => isAvailable(registry, model));
  if (!implementer) {
    return {
      ok: false,
      reason: `No available implementer model (checked ${implementerPool.map((m) => m.id).join(", ")})`,
    };
  }
  const verifier = verifierPool.find((model) => model.id !== implementer.id && isAvailable(registry, model));
  if (!verifier) {
    return {
      ok: false,
      reason: `No distinct verifier model available (implementer ${implementer.id}; checked ${verifierPool.map((m) => m.id).join(", ")})`,
    };
  }
  return { ok: true, implementer, verifier };
}
