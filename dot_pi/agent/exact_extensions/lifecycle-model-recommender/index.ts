import type { ExtensionAPI, InputEventResult } from "@earendil-works/pi-coding-agent";
import { LIFECYCLE_POLICY, parseLifecyclePhase, type Recommendation } from "./_policy.ts";

const KEEP_CURRENT = "Keep current settings";

type Option = {
  label: string;
  recommendation?: Recommendation;
};

function matchesCurrentSettings(
  current: { provider: string; id: string } | undefined,
  thinking: string,
  recommendation: Recommendation,
): boolean {
  return (
    current?.provider === recommendation.provider &&
    current.id === recommendation.model &&
    thinking === recommendation.thinking
  );
}

function formatOption(label: string, recommendation: Recommendation, current: boolean): Option {
  return {
    label: `${label}: ${recommendation.label} | ${recommendation.thinking} | ${recommendation.costClass} | ${recommendation.rationale}${current ? " (current settings)" : ""}`,
    recommendation,
  };
}

export default function lifecycleModelRecommender(pi: ExtensionAPI): void {
  pi.on("input", async (event, ctx): Promise<InputEventResult> => {
    if (event.source === "extension") return { action: "continue" };

    const phase = parseLifecyclePhase(event.text);
    if (!phase) return { action: "continue" };

    if (event.streamingBehavior) {
      if (ctx.hasUI) ctx.ui.notify(`${phase}: queued lifecycle input keeps current settings`, "warning");
      return { action: "continue" };
    }

    if (!ctx.hasUI) return { action: "continue" };

    const recommendations = LIFECYCLE_POLICY[phase];
    const currentThinking = pi.getThinkingLevel();
    if (matchesCurrentSettings(ctx.model, currentThinking, recommendations.recommended)) {
      ctx.ui.notify(
        `${phase}: already using recommended ${recommendations.recommended.label} / ${recommendations.recommended.thinking}`,
        "info",
      );
      return { action: "continue" };
    }

    const options: Option[] = [
      formatOption(
        "Apply recommendation",
        recommendations.recommended,
        matchesCurrentSettings(ctx.model, currentThinking, recommendations.recommended),
      ),
      formatOption(
        "Lower cost",
        recommendations.lowerCost,
        matchesCurrentSettings(ctx.model, currentThinking, recommendations.lowerCost),
      ),
      formatOption(
        "Increase quality",
        recommendations.increaseQuality,
        matchesCurrentSettings(ctx.model, currentThinking, recommendations.increaseQuality),
      ),
      { label: KEEP_CURRENT },
    ];
    const selected = await ctx.ui.select(
      `${phase} model recommendation`,
      options.map((option) => option.label),
      ctx.mode === "rpc" ? { timeout: 30000 } : undefined,
    );
    const selectedIndex = options.map((option) => option.label).indexOf(selected ?? "");
    const choice = options[selectedIndex]?.recommendation;
    if (!choice) return { action: "continue" };

    const selectedModel = ctx.modelRegistry.find(choice.provider, choice.model);
    if (!selectedModel) {
      ctx.ui.notify(`${phase}: ${choice.provider}/${choice.model} is unavailable`, "warning");
      return { action: "continue" };
    }

    if (!(await pi.setModel(selectedModel))) {
      ctx.ui.notify(`${phase}: could not select ${choice.provider}/${choice.model}`, "warning");
      return { action: "continue" };
    }

    pi.setThinkingLevel(choice.thinking);
    const effectiveThinking = pi.getThinkingLevel();
    if (effectiveThinking !== choice.thinking) {
      ctx.ui.notify(`${phase}: requested ${choice.thinking}; using ${effectiveThinking}`, "warning");
    }
    return { action: "continue" };
  });
}
