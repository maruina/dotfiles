import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.toolManager.addTool({
      name: "tavily_api",
      description: "Tavily AI professional-grade research and web scraping tool covering search, extraction, crawling, mapping, and research tasks.",
      parameters: {
        type: "object",
        properties: {
          capability: {
            type: "string",
            enum: ["search", "extract", "crawl", "map", "research"],
            description: "The Tavily function to execute."
          },
          query: { type: "string", description: "Search query for 'search' or 'research'." },
          urls: { type: "array", items: { type: "string" }, description: "Target URLs for 'extract', 'crawl', or 'map'." }
        },
        required: ["capability"]
      },
      execute: async (args: any) => {
        const apiKey = await pi.onepassword.read("op://Private/Tavily/api-key");
        
        // Research is essentially a specialized search in the Tavily API
        const endpoint = args.capability === "research" ? "search" : args.capability;
        
        const body: any = { api_key: apiKey };
        if (args.query) body.query = args.query;
        if (args.urls) body.urls = args.urls;
        
        // Advanced configurations
        if (args.capability === "research") body.search_depth = "advanced";
        if (args.capability === "search") body.search_depth = "basic";

        const response = await fetch(`https://api.tavily.com/${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Tavily ${args.capability} failed (${response.status}): ${errorText}`);
        }
        return JSON.stringify(await response.json());
      }
    });
  });
}
