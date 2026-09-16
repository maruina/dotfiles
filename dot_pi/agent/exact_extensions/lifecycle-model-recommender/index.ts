import { getAgentDir, type ExtensionAPI, type InputEventResult } from "@earendil-works/pi-coding-agent";
import type { Model } from "@earendil-works/pi-ai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  defaultThinkingLevel,
  parseEnabledModels,
  parseLifecyclePhase,
  poolForPhase,
  type LifecyclePhase,
} from "./_policy.ts";

const KEEP_CURRENT_MODEL = "Keep current model";
const KEEP_CURRENT_SETTINGS = "Keep current settings";

function readScopedModels(): unknown {
  const path = process.env.PI_LIFECYCLE_SETTINGS_PATH ?? join(getAgentDir(), "settings.json");
  return JSON.parse(readFileSync(path, "utf8"));
}

type Option = { label: string; model?: Model<any> };

function buildOptions(pool: readonly Model<any>[], current: Model<any> | undefined): Option[] {
  const nameCounts = new Map<string, number>();
  for (const candidate of pool) nameCounts.set(candidate.name, (nameCounts.get(candidate.name) ?? 0) + 1);
  const currentIndex = current
    ? pool.findIndex((candidate) => candidate.provider === current.provider && candidate.id === current.id)
    : -1;

  const options: Option[] = pool.map((candidate, index) => {
    const level = defaultThinkingLevel(candidate);
    const duplicated = (nameCounts.get(candidate.name) ?? 0) > 1;
    const sharedProvider =
      duplicated &&
      pool.some(
        (other) => other.name === candidate.name && other.provider === candidate.provider && other.id !== candidate.id,
      );
    const scope = sharedProvider ? `${candidate.provider}/${candidate.id}` : candidate.provider;
    const name = duplicated ? `${candidate.name} [${scope}]` : candidate.name;
    let label = level ? `${name} | ${level}` : name;
    if (index === currentIndex) label = `${label} (current model)`;
    return { label, model: candidate };
  });

  if (currentIndex >= 0) options.unshift({ label: KEEP_CURRENT_MODEL });
  else options.push({ label: KEEP_CURRENT_SETTINGS });
  return options;
}

export default function lifecycleModelRecommender(pi: ExtensionAPI): void {
  pi.on("input", async (event, ctx): Promise<InputEventResult> => {
    if (event.source === "extension") return { action: "continue" };

    const phase: LifecyclePhase | undefined = parseLifecyclePhase(event.text);
    if (!phase) return { action: "continue" };

    if (event.streamingBehavior) {
      if (ctx.hasUI) ctx.ui.notify(`${phase}: queued lifecycle input keeps current settings`, "warning");
      return { action: "continue" };
    }

    if (!ctx.hasUI) return { action: "continue" };

    let settings: unknown;
    try {
      settings = readScopedModels();
    } catch {
      ctx.ui.notify(`${phase}: could not read scoped models; keeping current settings`, "warning");
      return { action: "continue" };
    }

    const parsed = parseEnabledModels(settings);
    const models: Model<any>[] = [];
    const unresolved: string[] = [];
    for (const entry of parsed.entries) {
      const resolved = ctx.modelRegistry.find(entry.provider, entry.modelId);
      if (resolved) models.push(resolved);
      else unresolved.push(entry.entry);
    }
    const skipped = [...parsed.skipped, ...unresolved];
    if (skipped.length > 0) {
      ctx.ui.notify(`${phase}: skipping scoped models: ${skipped.join(", ")}`, "warning");
    }

    const pool = poolForPhase(phase, models);
    if (pool.length === 0) {
      ctx.ui.notify(`${phase}: no candidate models in the scoped set`, "warning");
      return { action: "continue" };
    }

    const options = buildOptions(pool, ctx.model);
    const labels = options.map((option) => option.label);
    const selected = await ctx.ui.select(
      `${phase}: model selection`,
      labels,
      ctx.mode === "rpc" ? { timeout: 30000 } : undefined,
    );
    const choice = options[labels.indexOf(selected ?? "")]?.model;
    if (!choice) return { action: "continue" };

    if (!(await pi.setModel(choice))) {
      ctx.ui.notify(`${phase}: could not select ${choice.provider}/${choice.id}`, "warning");
      return { action: "continue" };
    }

    const requested = defaultThinkingLevel(choice);
    if (requested) {
      pi.setThinkingLevel(requested);
      const effective = pi.getThinkingLevel();
      if (effective !== requested) {
        ctx.ui.notify(`${phase}: requested ${requested}; using ${effective}`, "warning");
      }
    }
    return { action: "continue" };
  });
}
