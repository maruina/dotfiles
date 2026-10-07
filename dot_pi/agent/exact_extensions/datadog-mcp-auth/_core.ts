import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const MCP_URL = "https://mcp.datadoghq.com/api/unstable/mcp-server/mcp";
const KEY_PATTERN = /^[A-Za-z0-9_-]+$/;

const SERVERS = [
  {
    name: "datadog-prod",
    domain: "app.datadoghq.com",
    description:
      "Query Datadog production org 2 (app.datadoghq.com): metrics, logs, traces, monitors, dashboards, incidents, notebooks.",
  },
  {
    name: "datadog-staging",
    domain: "ddstaging.datadoghq.com",
    description: "Query Datadog staging org 197728 (ddstaging.datadoghq.com) for staging clusters and datacenters.",
  },
] as const;

type McpServerConfig = {
  url: string;
  exposure: "deferred";
  description: string;
  headers: Record<string, string>;
};

type McpRegistrar = {
  registerMcpServer(name: string, config: McpServerConfig): void;
};

export type AuthExtensionAPI = Pick<ExtensionAPI, "on"> & McpRegistrar;
export type DdAuthRunner = (domain: string) => Promise<string>;

function parseKeys(output: string): { apiKey: string; appKey: string } {
  const lines = output.trimEnd().split(/\r?\n/);
  if (lines.length !== 2 || !lines.every((key) => KEY_PATTERN.test(key))) {
    throw new Error("invalid output");
  }
  return { apiKey: lines[0]!, appKey: lines[1]! };
}

function failureKind(error: unknown): string {
  if (!(error instanceof Error)) return "dd-auth failed";
  if (error.message === "timeout" || error.message === "invalid output") return error.message;
  if (/^exit code [0-9]+$/.test(error.message)) return error.message;
  return "dd-auth failed";
}

export function registerDatadogMcpAuth(pi: AuthExtensionAPI, runDdAuth: DdAuthRunner): void {
  const failedDomains = new Set<string>();

  const fail = (ctx: ExtensionContext, domain: string, kind: string): void => {
    if (failedDomains.has(domain)) return;
    failedDomains.add(domain);
    ctx.ui.notify(`Datadog auth failed for ${domain} (${kind}).`, "warning");
  };

  const registerServers = async (ctx: ExtensionContext): Promise<void> => {
    for (const server of SERVERS) {
      let keys: { apiKey: string; appKey: string };
      try {
        keys = parseKeys(await runDdAuth(server.domain));
      } catch (error) {
        fail(ctx, server.domain, failureKind(error));
        continue;
      }

      try {
        pi.registerMcpServer(server.name, {
          url: MCP_URL,
          exposure: "deferred",
          description: server.description,
          headers: {
            "DD-API-KEY": keys.apiKey,
            "DD-APPLICATION-KEY": keys.appKey,
          },
        });
      } catch {
        fail(ctx, server.domain, "registration failed");
        continue;
      }

      if (failedDomains.delete(server.domain)) {
        ctx.ui.notify(`Datadog auth recovered for ${server.domain}.`, "info");
      }
    }
  };

  pi.on("session_start", (_event, ctx) => {
    void registerServers(ctx);
  });
}
