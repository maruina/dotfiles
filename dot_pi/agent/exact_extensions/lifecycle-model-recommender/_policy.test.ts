import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { getSupportedThinkingLevels, type Model } from "@earendil-works/pi-ai";
import { LIFECYCLE_POLICY, parseLifecyclePhase, type LifecyclePolicy } from "./_policy.ts";

type Catalog = {
  providers: Record<
    string,
    {
      baseUrl: string;
      api: Model<any>["api"];
      models: Array<{
        id: string;
        name: string;
        reasoning: boolean;
        input: Model<any>["input"];
        contextWindow: number;
        maxTokens: number;
        thinkingLevelMap?: Model<any>["thinkingLevelMap"];
      }>;
    }
  >;
};

type CatalogModel = Pick<Model<any>, "provider" | "id" | "api" | "name" | "reasoning" | "input" | "contextWindow" | "maxTokens" | "thinkingLevelMap">;

const expected = {
  "/brainstorm": {
    lowerCost: ["ai-gw-baseten", "baseten/deepseek-ai/DeepSeek-V4-Flash-0731", "high", "Economy", "DeepSeek V4 Flash (Baseten)"],
    recommended: ["ai-gw-baseten", "baseten/zai-org/GLM-5.2", "max", "Balanced", "GLM-5.2 (Baseten)"],
    increaseQuality: ["ai-gw-openai", "openai/gpt-5.6-sol", "high", "Premium", "GPT-5.6 Sol"],
  },
  "/plan": {
    lowerCost: ["ai-gw-baseten", "baseten/deepseek-ai/DeepSeek-V4-Flash-0731", "high", "Economy", "DeepSeek V4 Flash (Baseten)"],
    recommended: ["ai-gw-baseten", "baseten/zai-org/GLM-5.2", "max", "Balanced", "GLM-5.2 (Baseten)"],
    increaseQuality: ["ai-gw-openai", "openai/gpt-5.6-sol", "xhigh", "Premium", "GPT-5.6 Sol"],
  },
  "/systematic-review": {
    lowerCost: ["ai-gw-baseten", "baseten/deepseek-ai/DeepSeek-V4-Flash-0731", "high", "Economy", "DeepSeek V4 Flash (Baseten)"],
    recommended: ["ai-gw-baseten", "baseten/zai-org/GLM-5.2", "max", "Balanced", "GLM-5.2 (Baseten)"],
    increaseQuality: ["ai-gw-openai", "openai/gpt-5.6-sol", "high", "Premium", "GPT-5.6 Sol"],
  },
  "/execute": {
    lowerCost: ["ai-gw-baseten", "baseten/deepseek-ai/DeepSeek-V4-Flash-0731", "high", "Economy", "DeepSeek V4 Flash (Baseten)"],
    recommended: ["ai-gw-baseten", "baseten/zai-org/GLM-5.2", "max", "Balanced", "GLM-5.2 (Baseten)"],
    increaseQuality: ["ai-gw-openai", "openai/gpt-5.6-sol", "high", "Premium", "GPT-5.6 Sol"],
  },
  "/verify": {
    lowerCost: ["ai-gw-baseten", "baseten/deepseek-ai/DeepSeek-V4-Flash-0731", "high", "Economy", "DeepSeek V4 Flash (Baseten)"],
    recommended: ["ai-gw-baseten", "baseten/zai-org/GLM-5.2", "max", "Balanced", "GLM-5.2 (Baseten)"],
    increaseQuality: ["ai-gw-openai", "openai/gpt-5.6-sol", "high", "Premium", "GPT-5.6 Sol"],
  },
} as const;

function renderedCatalog(): Catalog {
  const agentDirectory = dirname(fileURLToPath(import.meta.url));
  const repositoryRoot = resolve(agentDirectory, "../../../..");
  const templatePath = resolve(repositoryRoot, "dot_pi/agent/models.json.tmpl");
  if (!existsSync(templatePath)) {
    return JSON.parse(readFileSync(resolve(process.env.HOME!, ".pi/agent/models.json"), "utf8")) as Catalog;
  }

  const rendered = execFileSync("chezmoi", ["--source", repositoryRoot, "execute-template"], {
    encoding: "utf8",
    input: readFileSync(templatePath, "utf8"),
  });
  return JSON.parse(rendered) as Catalog;
}

function catalogModels(catalog: Catalog): CatalogModel[] {
  return Object.entries(catalog.providers).flatMap(([provider, config]) =>
    config.models.map((model) => ({ ...model, provider, api: config.api })),
  );
}

function assertCatalogCompatibility(policy: LifecyclePolicy, models: CatalogModel[]): void {
  for (const [phase, recommendations] of Object.entries(policy)) {
    for (const [position, choice] of Object.entries(recommendations)) {
      const model = models.find((candidate) => candidate.provider === choice.provider && candidate.id === choice.model);
      assert.ok(model, `${phase} ${position}: missing ${choice.provider}/${choice.model}`);
      const supportedLevels = getSupportedThinkingLevels({
        ...model,
        baseUrl: "https://example.invalid",
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      });
      assert.ok(
        supportedLevels.includes(choice.thinking),
        `${phase} ${position}: ${choice.provider}/${choice.model} does not support ${choice.thinking}`,
      );
    }
  }
}

describe("lifecycle model policy", () => {
  it("defines every approved recommendation", () => {
    for (const [phase, positions] of Object.entries(expected)) {
      const recommendations = LIFECYCLE_POLICY[phase as keyof typeof LIFECYCLE_POLICY];
      for (const [position, [provider, model, thinking, costClass, label]] of Object.entries(positions)) {
        const choice = recommendations[position as keyof typeof recommendations];
        assert.deepEqual([choice.provider, choice.model, choice.thinking, choice.costClass, choice.label], [
          provider,
          model,
          thinking,
          costClass,
          label,
        ]);
        assert.ok(choice.rationale.length > 0, `${phase} ${position} has a rationale`);
        // `max` is the approved default effort for the GLM-5.2 recommended slot;
        // the lower-cost (Economy) tier must not use it.
        if (position === "lowerCost") {
          assert.notEqual(choice.thinking, "max", `${phase} lowerCost: Economy tier must not use max`);
        }
        assert.notEqual(choice.model, "openai/gpt-5.6-luna");
      }
    }
  });

  it("matches only lifecycle commands at the beginning of input", () => {
    for (const phase of Object.keys(expected)) {
      assert.equal(parseLifecyclePhase(phase), phase);
      assert.equal(parseLifecyclePhase(`${phase} argument`), phase);
      assert.equal(parseLifecyclePhase(`${phase}\targument`), phase);
      assert.equal(parseLifecyclePhase(`${phase}\nargument`), phase);
    }

    for (const input of [" /plan", "\\/plan", "prose /plan", "/planning", "/planner", "/verify-more", "/execute2"]) {
      assert.equal(parseLifecyclePhase(input), undefined, input);
    }
  });

  it("uses supported thinking levels for every policy model in the managed work catalog", () => {
    assertCatalogCompatibility(LIFECYCLE_POLICY, catalogModels(renderedCatalog()));
  });

  it("detects catalog model and thinking-level drift", () => {
    const models = catalogModels(renderedCatalog());
    const removed = models.filter((model) => !(model.provider === "ai-gw-baseten" && model.id === "baseten/zai-org/GLM-5.2"));
    assert.throws(() => assertCatalogCompatibility(LIFECYCLE_POLICY, removed), /missing ai-gw-baseten\/baseten\/zai-org\/GLM-5\.2/);

    const unsupported = models.map((model) =>
      model.provider === "ai-gw-baseten" && model.id === "baseten/zai-org/GLM-5.2"
        ? { ...model, thinkingLevelMap: { off: "none", minimal: null, low: null, medium: null, high: "high", xhigh: null, max: null } }
        : model,
    );
    assert.throws(
      () => assertCatalogCompatibility(LIFECYCLE_POLICY, unsupported),
      /ai-gw-baseten\/baseten\/zai-org\/GLM-5\.2 does not support max/,
    );
  });
});
