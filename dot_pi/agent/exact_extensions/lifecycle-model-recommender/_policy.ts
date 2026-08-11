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
const glm = (thinking: ModelThinkingLevel, costClass: CostClass, rationale: string): Recommendation =>
  recommendation("ai-gw-baseten", "baseten/zai-org/GLM-5.2", "GLM-5.2 (Baseten)", thinking, costClass, rationale);

export const LIFECYCLE_POLICY: LifecyclePolicy = {
  "/brainstorm": {
    lowerCost: glm("high", "Economy", "Explore the problem with a cost-effective reasoning budget."),
    recommended: terra("medium", "Balanced", "Frame durable decisions with balanced reasoning."),
    increaseQuality: sol("high", "Premium", "Use deeper flagship reasoning for difficult framing."),
  },
  "/plan": {
    lowerCost: glm("high", "Economy", "Build an implementation plan with cost-effective high-effort reasoning."),
    recommended: terra("high", "Balanced", "Plan durable implementation decisions with balanced high-effort reasoning."),
    increaseQuality: sol("xhigh", "Premium", "Use the deepest approved planning reasoning."),
  },
  "/systematic-review": {
    lowerCost: glm("high", "Economy", "Review the plan with an independent, cost-effective perspective."),
    recommended: terra("high", "Balanced", "Apply adversarial, independent review to the plan."),
    increaseQuality: sol("high", "Premium", "Use adversarial review for high-risk plans."),
  },
  "/execute": {
    lowerCost: glm("high", "Economy", "Implement the reviewed plan cost-effectively."),
    recommended: terra("high", "Balanced", "Execute the reviewed plan with balanced high-effort reasoning."),
    increaseQuality: sol("high", "Premium", "Escalate implementation reasoning for difficult changes."),
  },
  "/verify": {
    lowerCost: glm("high", "Economy", "Check implementation evidence with a cost-effective reviewer."),
    recommended: terra("medium", "Balanced", "Verify with independent review."),
    increaseQuality: sol("high", "Premium", "Use deeper review for difficult verification."),
  },
};

const phases = Object.keys(LIFECYCLE_POLICY) as LifecyclePhase[];

export function parseLifecyclePhase(input: string): LifecyclePhase | undefined {
  return phases.find((phase) => input.startsWith(phase) && (input.length === phase.length || /\s/.test(input[phase.length])));
}
