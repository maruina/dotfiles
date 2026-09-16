import { getSupportedThinkingLevels, type Api, type Model, type ModelThinkingLevel } from "@earendil-works/pi-ai";

export type LifecyclePhase = "/brainstorm" | "/plan" | "/systematic-review" | "/execute" | "/verify";

const PHASES: readonly LifecyclePhase[] = ["/brainstorm", "/plan", "/systematic-review", "/execute", "/verify"];

export function parseLifecyclePhase(input: string): LifecyclePhase | undefined {
  return PHASES.find((phase) => input.startsWith(phase) && (input.length === phase.length || /\s/.test(input[phase.length])));
}

export type EnabledModelEntry = Readonly<{ provider: string; modelId: string; entry: string }>;

export function parseEnabledModels(raw: unknown): {
  entries: EnabledModelEntry[];
  skipped: string[];
} {
  const enabled = (raw as { enabledModels?: unknown } | null | undefined)?.enabledModels;
  if (!Array.isArray(enabled)) return { entries: [], skipped: [] };
  const entries: EnabledModelEntry[] = [];
  const skipped: string[] = [];
  for (const item of enabled) {
    if (typeof item !== "string") {
      skipped.push(String(item));
      continue;
    }
    const split = item.indexOf("/");
    if (split <= 0 || split === item.length - 1) {
      skipped.push(item);
      continue;
    }
    entries.push({ provider: item.slice(0, split), modelId: item.slice(split + 1), entry: item });
  }
  return { entries, skipped };
}

function matchesPhaseTier(phase: LifecyclePhase, modelId: string): boolean {
  const id = modelId.toLowerCase();
  // deliberate: tier membership rides on catalog ID substrings; a catalog rename can
  // empty the /execute or /verify pool (the extension fails open with a warning).
  // Upgrade path: per-model tier metadata in the catalog when Pi supports it.
  const flash = id.includes("flash");
  const gemini = id.includes("gemini");
  switch (phase) {
    case "/brainstorm":
    case "/plan":
    case "/systematic-review":
      return !flash;
    case "/execute":
      return flash && !gemini;
    case "/verify":
      return flash;
  }
}

export function poolForPhase<TApi extends Api>(phase: LifecyclePhase, models: readonly Model<TApi>[]): Model<TApi>[] {
  return models.filter((model) => matchesPhaseTier(phase, model.id));
}

export function defaultThinkingLevel<TApi extends Api>(model: Model<TApi>): ModelThinkingLevel | undefined {
  if (!model.thinkingLevelMap) return undefined;
  const supported = getSupportedThinkingLevels(model);
  if (supported.length === 0) return undefined;
  if (supported.length === 1) return supported[0];
  return supported[supported.length - 2];
}
