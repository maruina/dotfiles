import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { getSupportedThinkingLevels, type Model } from "@earendil-works/pi-ai";
import { defaultThinkingLevel, parseEnabledModels, parseLifecyclePhase, poolForPhase } from "./_policy.ts";

function fixtureModel(overrides: Partial<Model<any>> & { provider: string; id: string }): Model<any> {
  return {
    name: overrides.id,
    api: "openai-responses",
    baseUrl: "https://example.invalid",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1,
    maxTokens: 1,
    ...overrides,
  } as Model<any>;
}

const GLM_MAP = { off: null, minimal: null, low: "low", medium: null, high: "high", xhigh: null, max: "max" };
const KIMI_MAP = { off: null, low: "low", high: "high", max: "max" };
const SOL_MAP = { off: "none", xhigh: "xhigh", max: "max" };
const DEEPSEEK_MAP = { off: "none", minimal: null, low: "low", medium: null, high: "high", xhigh: null, max: null };
const GEMINI_MAP = { off: null };

const scopedSet = [
  fixtureModel({ provider: "ai-gw-baseten", id: "baseten/zai-org/GLM-5.3", name: "GLM 5.3 (Baseten)", thinkingLevelMap: GLM_MAP }),
  fixtureModel({ provider: "ai-gw-databricks", id: "databricks/system.ai.kimi-k3", name: "Kimi K3 (Databricks)", thinkingLevelMap: KIMI_MAP }),
  fixtureModel({ provider: "ai-gw-openai", id: "openai/gpt-6-sol", name: "GPT-6 Sol (OpenAI)" }),
  fixtureModel({ provider: "ai-gw-baseten", id: "baseten/zai-org/GLM-5.3-Flash", name: "GLM 5.3 Flash (Baseten)", thinkingLevelMap: GLM_MAP }),
  fixtureModel({ provider: "ai-gw-baseten", id: "baseten/deepseek-ai/DeepSeek-V4-Flash-0731", name: "DeepSeek V4 Flash 0731 (Baseten)", thinkingLevelMap: DEEPSEEK_MAP }),
  fixtureModel({ provider: "ai-gw-google", id: "gemini-3.8-flash", name: "Gemini 3.8 Flash (Google)", thinkingLevelMap: GEMINI_MAP }),
];

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

describe("lifecycle model policy", () => {
  it("matches only lifecycle commands at the beginning of input", () => {
    const phases = ["/brainstorm", "/plan", "/systematic-review", "/execute", "/verify"] as const;
    for (const phase of phases) {
      assert.equal(parseLifecyclePhase(phase), phase);
      assert.equal(parseLifecyclePhase(`${phase} argument`), phase);
      assert.equal(parseLifecyclePhase(`${phase}\targument`), phase);
      assert.equal(parseLifecyclePhase(`${phase}\nargument`), phase);
    }

    for (const input of [" /plan", "\\/plan", "prose /plan", "/planning", "/planner", "/verify-more", "/execute2"]) {
      assert.equal(parseLifecyclePhase(input), undefined, input);
    }
  });

  it("derives phase pools from the scoped set with tier filters and stable order", () => {
    const framing = ["baseten/zai-org/GLM-5.3", "databricks/system.ai.kimi-k3", "openai/gpt-6-sol"];
    for (const phase of ["/brainstorm", "/plan", "/systematic-review"] as const) {
      assert.deepEqual(poolForPhase(phase, scopedSet).map((model) => model.id), framing, phase);
    }
    assert.deepEqual(
      poolForPhase("/execute", scopedSet).map((model) => model.id),
      ["baseten/zai-org/GLM-5.3-Flash", "baseten/deepseek-ai/DeepSeek-V4-Flash-0731"],
    );
    assert.deepEqual(
      poolForPhase("/verify", scopedSet).map((model) => model.id),
      ["baseten/zai-org/GLM-5.3-Flash", "baseten/deepseek-ai/DeepSeek-V4-Flash-0731", "gemini-3.8-flash"],
    );
  });

  it("matches tier substrings case-insensitively", () => {
    const mixed = [
      fixtureModel({ provider: "prov", id: "prov/Model-FLASH", name: "Model Flash" }),
      fixtureModel({ provider: "prov", id: "prov/Gemini-Flash", name: "Gemini Flash" }),
      fixtureModel({ provider: "prov", id: "prov/Reasoner", name: "Reasoner" }),
    ];
    assert.deepEqual(poolForPhase("/plan", mixed).map((model) => model.id), ["prov/Reasoner"]);
    assert.deepEqual(poolForPhase("/execute", mixed).map((model) => model.id), ["prov/Model-FLASH"]);
    assert.deepEqual(poolForPhase("/verify", mixed).map((model) => model.id), ["prov/Model-FLASH", "prov/Gemini-Flash"]);
  });

  it("parses enabledModels entries at the first slash and preserves order", () => {
    const parsed = parseEnabledModels({
      enabledModels: ["ai-gw-baseten/baseten/zai-org/GLM-5.3", "ai-gw-google/gemini-3.8-flash"],
    });
    assert.deepEqual(parsed.skipped, []);
    assert.deepEqual(parsed.entries, [
      { provider: "ai-gw-baseten", modelId: "baseten/zai-org/GLM-5.3", entry: "ai-gw-baseten/baseten/zai-org/GLM-5.3" },
      { provider: "ai-gw-google", modelId: "gemini-3.8-flash", entry: "ai-gw-google/gemini-3.8-flash" },
    ]);
  });

  it("skips malformed entries and keeps the rest", () => {
    const parsed = parseEnabledModels({ enabledModels: [42, "noslash", "/leading", "trailing/", "prov/model", null] });
    assert.deepEqual(parsed.skipped, ["42", "noslash", "/leading", "trailing/", "null"]);
    assert.deepEqual(parsed.entries, [{ provider: "prov", modelId: "model", entry: "prov/model" }]);
  });

  it("treats a missing or non-array enabledModels value as empty", () => {
    assert.deepEqual(parseEnabledModels({}), { entries: [], skipped: [] });
    assert.deepEqual(parseEnabledModels({ enabledModels: "nope" }), { entries: [], skipped: [] });
    assert.deepEqual(parseEnabledModels(null), { entries: [], skipped: [] });
    assert.deepEqual(parseEnabledModels(undefined), { entries: [], skipped: [] });
  });

  it("computes the default thinking level from the supported levels", () => {
    assert.equal(defaultThinkingLevel(fixtureModel({ provider: "p", id: "glm", thinkingLevelMap: GLM_MAP })), "high");
    assert.equal(defaultThinkingLevel(fixtureModel({ provider: "p", id: "kimi", thinkingLevelMap: KIMI_MAP })), "high");
    assert.equal(defaultThinkingLevel(fixtureModel({ provider: "p", id: "sol", thinkingLevelMap: SOL_MAP })), "xhigh");
    assert.equal(defaultThinkingLevel(fixtureModel({ provider: "p", id: "deepseek", thinkingLevelMap: DEEPSEEK_MAP })), "low");
    assert.equal(defaultThinkingLevel(fixtureModel({ provider: "p", id: "gemini", thinkingLevelMap: GEMINI_MAP })), "medium");
    assert.equal(
      defaultThinkingLevel(
        fixtureModel({
          provider: "p",
          id: "single",
          thinkingLevelMap: { off: "none", minimal: null, low: null, medium: null, high: null, xhigh: null, max: null },
        }),
      ),
      "off",
    );
    assert.equal(
      defaultThinkingLevel(
        fixtureModel({
          provider: "p",
          id: "empty",
          thinkingLevelMap: { off: null, minimal: null, low: null, medium: null, high: null, xhigh: null, max: null },
        }),
      ),
      undefined,
    );
    assert.equal(defaultThinkingLevel(fixtureModel({ provider: "p", id: "mapless" })), undefined);
  });

  it("computes a supported default for every managed-catalog map shape", () => {
    for (const model of catalogModels(renderedCatalog())) {
      const full = fixtureModel({
        provider: model.provider,
        id: model.id,
        name: model.name,
        api: model.api,
        reasoning: model.reasoning,
        input: model.input,
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
        thinkingLevelMap: model.thinkingLevelMap,
      });
      if (model.thinkingLevelMap) {
        const supported = getSupportedThinkingLevels(full);
        const computed = defaultThinkingLevel(full);
        assert.ok(computed !== undefined, `${model.provider}/${model.id} has a map but no default`);
        assert.ok(
          supported.includes(computed),
          `${model.provider}/${model.id}: default ${computed} is not supported (${supported.join(", ")})`,
        );
      } else {
        assert.equal(defaultThinkingLevel(full), undefined, `${model.provider}/${model.id} has no map`);
      }
    }
  });
});
