import type { ModelThinkingLevel } from "@earendil-works/pi-ai";

export type LifecyclePhase = "/brainstorm" | "/plan" | "/systematic-review" | "/execute" | "/verify";
export type RecommendationPosition = "lowerCost" | "recommended" | "increaseQuality";
export type CostClass = "Economy" | "Balanced" | "Premium";

export type Recommendation = Readonly<{
  provider: string;
  model: string;
  label: string;
  thinking: ModelThinkingLevel;
  costClass: CostClass;
  rationale: string;
}>;

export type PhaseRecommendations = Readonly<Record<RecommendationPosition, Recommendation>>;
export type LifecyclePolicy = Readonly<Record<LifecyclePhase, PhaseRecommendations>>;

function recommendation(
  provider: string,
  model: string,
  label: string,
  thinking: ModelThinkingLevel,
  costClass: CostClass,
  rationale: string,
): Recommendation {
  return { provider, model, label, thinking, costClass, rationale };
}

const terra = (thinking: ModelThinkingLevel, costClass: CostClass, rationale: string): Recommendation =>
  recommendation("ai-gw-openai", "openai/gpt-5.6-terra", "GPT-5.6 Terra", thinking, costClass, rationale);
const sol = (thinking: ModelThinkingLevel, costClass: CostClass, rationale: string): Recommendation =>
  recommendation("ai-gw-openai", "openai/gpt-5.6-sol", "GPT-5.6 Sol", thinking, costClass, rationale);
const opus200k = (thinking: ModelThinkingLevel, costClass: CostClass, rationale: string): Recommendation =>
  recommendation("ai-gw-anthropic-200k", "anthropic/claude-opus-4-8", "Claude Opus 4.8 200K", thinking, costClass, rationale);
const sonnet200k = (thinking: ModelThinkingLevel, costClass: CostClass, rationale: string): Recommendation =>
  recommendation("ai-gw-anthropic-200k", "anthropic/claude-sonnet-5", "Claude Sonnet 5 200K", thinking, costClass, rationale);
const sonnet1m = (thinking: ModelThinkingLevel, costClass: CostClass, rationale: string): Recommendation =>
  recommendation("ai-gw-anthropic-1m", "anthropic/claude-sonnet-5", "Claude Sonnet 5 1M", thinking, costClass, rationale);

export const LIFECYCLE_POLICY: LifecyclePolicy = {
  "/brainstorm": {
    lowerCost: terra("medium", "Economy", "Explore the problem with a balanced reasoning budget."),
    recommended: sol("medium", "Balanced", "Frame durable decisions with flagship reasoning."),
    increaseQuality: sol("high", "Premium", "Use deeper flagship reasoning for difficult framing."),
  },
  "/plan": {
    lowerCost: terra("high", "Economy", "Build an implementation plan with balanced high-effort reasoning."),
    recommended: sol("high", "Balanced", "Plan durable implementation decisions with flagship reasoning."),
    increaseQuality: sol("xhigh", "Premium", "Use the deepest approved planning reasoning."),
  },
  "/systematic-review": {
    lowerCost: sonnet200k("medium", "Economy", "Review the plan with an independent, efficient perspective."),
    recommended: opus200k("high", "Balanced", "Apply adversarial, independent review to the plan."),
    increaseQuality: opus200k("xhigh", "Premium", "Use deeper adversarial review for high-risk plans."),
  },
  "/execute": {
    lowerCost: terra("medium", "Economy", "Implement the reviewed plan efficiently."),
    recommended: terra("high", "Balanced", "Execute the reviewed plan with balanced high-effort reasoning."),
    increaseQuality: sol("high", "Premium", "Escalate implementation reasoning for difficult changes."),
  },
  "/verify": {
    lowerCost: sonnet200k("medium", "Economy", "Check implementation evidence with an independent reviewer."),
    recommended: sonnet1m("medium", "Balanced", "Verify with independent long-context review."),
    increaseQuality: sonnet1m("high", "Premium", "Use deeper long-context review for difficult verification."),
  },
};

const phases = Object.keys(LIFECYCLE_POLICY) as LifecyclePhase[];

export function parseLifecyclePhase(input: string): LifecyclePhase | undefined {
  return phases.find((phase) => input.startsWith(phase) && (input.length === phase.length || /\s/.test(input[phase.length])));
}
