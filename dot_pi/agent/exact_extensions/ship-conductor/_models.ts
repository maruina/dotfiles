export type LifecycleModel = { provider: string; id: string; name: string };
export type ModelIdentity = { provider: string; id: string };
export type LifecycleModels = { execute: LifecycleModel; simplify: LifecycleModel; verify: LifecycleModel };
type SelectionStage = "execute" | "simplify" | "verify";
export type ScopedModelChoice = ModelIdentity & { thinkingLevel?: string };
export type ModelSelectionOptions = {
  /** Session-scoped models; empty means every available model is usable. */
  scoped?: readonly ScopedModelChoice[];
  /** Default thinking level when the scope does not pin one, usually the coordinator session level. */
  defaultThinkingLevel?: string;
  /** Levels the model supports; without it, every stage uses `defaultThinkingLevel` without a picker. */
  supportedThinkingLevels?: (model: LifecycleModel) => readonly string[];
};

export type ModelRegistryLike = {
  getAvailable(): readonly LifecycleModel[];
  find(provider: string, modelId: string): LifecycleModel | undefined;
  hasConfiguredAuth(model: LifecycleModel): boolean;
};

export type ModelSelectionUI = {
  select(stage: SelectionStage, options: string[]): Promise<string | undefined>;
  selectThinking(stage: SelectionStage, model: ModelIdentity, options: string[]): Promise<string | undefined>;
  confirmIndependent(verifier: ModelIdentity, writer: ModelIdentity): Promise<boolean>;
};

export type ModelSelectionResult =
  | { ok: true; models: LifecycleModels; thinkingLevels: Record<SelectionStage, string> }
  | { ok: false; reason: string };

const MAX_MODEL_CHOICES = 1000;
const MAX_MODEL_LABEL_BYTES = 1024;

function identityKey(model: ModelIdentity): string {
  return `${model.provider.trim().toLowerCase()}\0${model.id.trim().toLowerCase()}`;
}

function normalizedModelId(model: ModelIdentity): string {
  return model.id.trim().toLowerCase();
}

function sameKnownModel(left: ModelIdentity, right: ModelIdentity): boolean {
  return identityKey(left) === identityKey(right) || normalizedModelId(left) === normalizedModelId(right);
}

function formatModel(model: LifecycleModel, current: ModelIdentity | undefined): string {
  const suffix = `(${model.provider}/${model.id})`;
  return `${current && identityKey(model) === identityKey(current) ? "Current session model — " : ""}${model.name} ${suffix}`;
}

function availableModels(registry: ModelRegistryLike): LifecycleModel[] {
  const unique = new Map<string, LifecycleModel>();
  for (const model of registry.getAvailable()) {
    if (!model.provider.trim() || !model.id.trim() || !model.name.trim()) continue;
    if (!registry.find(model.provider, model.id) || !registry.hasConfiguredAuth(model)) continue;
    unique.set(identityKey(model), model);
  }
  return [...unique.values()].sort((left, right) =>
    left.provider.localeCompare(right.provider) || left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
  );
}

async function selectOne(
  registry: ModelRegistryLike,
  ui: ModelSelectionUI,
  stage: "execute" | "simplify" | "verify",
  candidates: LifecycleModel[],
  current: ModelIdentity | undefined,
): Promise<LifecycleModel | undefined> {
  const ordered = [...candidates].sort((left, right) => {
    const leftCurrent = current && identityKey(left) === identityKey(current) ? 0 : 1;
    const rightCurrent = current && identityKey(right) === identityKey(current) ? 0 : 1;
    return leftCurrent - rightCurrent || left.provider.localeCompare(right.provider) || left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
  });
  if (ordered.length === 0) return undefined;
  if (ordered.length > MAX_MODEL_CHOICES) throw new Error(`Model selection exceeds ${MAX_MODEL_CHOICES} choices`);

  const labels = ordered.map((model) => formatModel(model, current));
  if (labels.some((label) => Buffer.byteLength(label, "utf8") > MAX_MODEL_LABEL_BYTES)) {
    throw new Error(`Model selection contains a label longer than ${MAX_MODEL_LABEL_BYTES} bytes`);
  }
  const selected = await ui.select(stage, labels);
  if (selected === undefined) return undefined;
  const index = labels.indexOf(selected);
  if (index < 0) throw new Error(`Selected ${stage} model is not in the available choices`);

  const model = ordered[index];
  const registered = registry.find(model.provider, model.id);
  if (!registered || !registry.hasConfiguredAuth(registered)) {
    throw new Error(`Selected ${stage} model ${model.provider}/${model.id} is not an available authenticated model`);
  }
  return registered;
}

async function selectThinkingLevel(
  ui: ModelSelectionUI,
  stage: SelectionStage,
  model: LifecycleModel,
  options: ModelSelectionOptions,
): Promise<string | undefined> {
  const fallback = options.defaultThinkingLevel ?? "off";
  const levels = options.supportedThinkingLevels ? [...new Set(options.supportedThinkingLevels(model))] : [fallback];
  if (levels.length === 0) throw new Error(`${model.provider}/${model.id} reports no supported thinking levels`);
  if (levels.length === 1) return levels[0];

  const pinned = options.scoped?.find((entry) => identityKey(entry) === identityKey(model))?.thinkingLevel;
  const preferred = [pinned, options.defaultThinkingLevel].find((level) => level !== undefined && levels.includes(level));
  const ordered = preferred ? [preferred, ...levels.filter((level) => level !== preferred)] : levels;
  const labels = ordered.map((level) => (level === preferred ? `${level} (default)` : level));
  const selected = await ui.selectThinking(stage, { provider: model.provider, id: model.id }, labels);
  if (selected === undefined) return undefined;
  const index = labels.indexOf(selected);
  if (index < 0) throw new Error(`Selected ${stage} thinking level is not in the supported thinking levels`);
  return ordered[index];
}

export async function selectModels(
  registry: ModelRegistryLike,
  current: ModelIdentity | undefined,
  ui: ModelSelectionUI,
  options: ModelSelectionOptions = {},
): Promise<ModelSelectionResult> {
  const scoped = options.scoped ?? [];
  let available: LifecycleModel[];
  try {
    available = availableModels(registry);
  } catch (error) {
    return { ok: false, reason: `Cannot read authenticated models: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (available.length === 0) return { ok: false, reason: "No available authenticated chat models are configured" };
  // An empty scope means the session is not scoped, so every available model is usable (same rule as `/scoped-models`).
  if (scoped.length > 0) {
    const scopedKeys = new Set(scoped.map(identityKey));
    available = available.filter((model) => scopedKeys.has(identityKey(model)));
    if (available.length === 0) return { ok: false, reason: "None of the session's scoped models is an available authenticated chat model" };
  }

  try {
    const execute = await selectOne(registry, ui, "execute", available, current);
    if (!execute) return { ok: false, reason: "Execute model selection was cancelled" };
    const executeThinking = await selectThinkingLevel(ui, "execute", execute, options);
    if (!executeThinking) return { ok: false, reason: "Execute thinking level selection was cancelled" };
    const simplify = await selectOne(registry, ui, "simplify", available, current);
    if (!simplify) return { ok: false, reason: "Simplify model selection was cancelled" };
    const simplifyThinking = await selectThinkingLevel(ui, "simplify", simplify, options);
    if (!simplifyThinking) return { ok: false, reason: "Simplify thinking level selection was cancelled" };
    const writers = [execute, simplify].filter((model, index, all) => all.findIndex((candidate) => identityKey(candidate) === identityKey(model)) === index);
    const verifyCandidates = available.filter((candidate) => !writers.some((writer) => sameKnownModel(candidate, writer)));
    if (verifyCandidates.length === 0) return { ok: false, reason: "No distinct verifier model is available" };
    const verify = await selectOne(registry, ui, "verify", verifyCandidates, current);
    if (!verify) return { ok: false, reason: "Verify model selection was cancelled" };
    const verifyThinking = await selectThinkingLevel(ui, "verify", verify, options);
    if (!verifyThinking) return { ok: false, reason: "Verify thinking level selection was cancelled" };
    if (writers.some((writer) => sameKnownModel(verify, writer))) {
      return { ok: false, reason: "Verify model matches a selected writer after identity normalization" };
    }

    for (const writer of writers) {
      if (verify.provider !== writer.provider && !(await ui.confirmIndependent(verify, writer))) {
        return { ok: false, reason: `Verifier independence was not confirmed for ${verify.provider}/${verify.id} and ${writer.provider}/${writer.id}` };
      }
    }
    return {
      ok: true,
      models: { execute, simplify, verify },
      thinkingLevels: { execute: executeThinking, simplify: simplifyThinking, verify: verifyThinking },
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
