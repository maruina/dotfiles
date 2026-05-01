import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@mariozechner/pi-ai";

function getApiKey(): string {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error("TAVILY_API_KEY environment variable is not set");
  return key;
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "tavily_api",
    label: "Tavily Web Search",
    description:
      "Tavily AI web search and content extraction. Use for current events, documentation lookups, and research tasks that require live web data.",
    promptSnippet: "Search the web, extract content from URLs, or conduct deep research via Tavily",
    parameters: Type.Object({
      capability: StringEnum(["search", "extract", "crawl", "map", "research"] as const, {
        description:
          "search: keyword/semantic web search. extract: fetch and parse specific URLs. crawl: follow links from seed URLs. map: discover URL structure. research: deep multi-step search.",
      }),
      query: Type.Optional(
        Type.String({ description: "Search query. Required for 'search' and 'research'." })
      ),
      urls: Type.Optional(
        Type.Array(Type.String(), {
          description: "Target URLs. Required for 'extract', 'crawl', and 'map'.",
        })
      ),
    }),

    async execute(toolCallId, params, signal) {
      const apiKey = getApiKey();

      // Tavily uses /search endpoint for both search and research modes
      const endpoint = params.capability === "research" ? "search" : params.capability;

      const body: Record<string, unknown> = { api_key: apiKey };
      if (params.query) body.query = params.query;
      if (params.urls) body.urls = params.urls;
      if (params.capability === "research") body.search_depth = "advanced";
      if (params.capability === "search") body.search_depth = "basic";

      const response = await fetch(`https://api.tavily.com/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Tavily ${params.capability} failed (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
        details: { capability: params.capability, query: params.query, urls: params.urls },
      };
    },
  });
}
