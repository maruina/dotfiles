import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext, ExtensionHandler, SessionStartEvent } from "@earendil-works/pi-coding-agent";

type Catalog = {
  providers: Record<string, { apiKey?: string; baseUrl?: string; headers?: Record<string, string>; compat?: Record<string, unknown> }>;
};

type SessionStartHandler = ExtensionHandler<SessionStartEvent>;

function renderedCatalog(): Catalog {
  const extensionDirectory = dirname(fileURLToPath(import.meta.url));
  const repositoryRoot = resolve(extensionDirectory, "../../../..");
  const templatePath = resolve(repositoryRoot, "dot_pi/agent/models.json.tmpl");
  const rendered = execFileSync("chezmoi", ["--source", repositoryRoot, "execute-template"], {
    encoding: "utf8",
    input: readFileSync(templatePath, "utf8"),
  });
  return JSON.parse(rendered) as Catalog;
}

async function sessionStartHandler(): Promise<SessionStartHandler> {
  const { default: register } = await import("./index.ts");
  let handler: SessionStartHandler | undefined;
  register({
    on(event: string, callback: SessionStartHandler) {
      if (event === "session_start") handler = callback;
    },
  } as unknown as ExtensionAPI);
  if (!handler) throw new Error("extension did not register a session_start handler");
  return handler;
}

function sessionStartContext(sessionId: string): ExtensionContext {
  return {
    sessionManager: {
      getSessionId: () => sessionId,
    },
  } as unknown as ExtensionContext;
}

const attributionHeaders = {
  "x-dd-tag-ml_app": "pi",
  "ml-app-id": "ai-devx.pi",
  "x-dd-tag-dd.user_email": "matteo.ruina@datadoghq.com",
  "x-dd-tag-dd.team": "compute",
  "x-dd-tag-client_session_id": "$PI_CLIENT_SESSION_ID",
};

test("session_start sets PI_CLIENT_SESSION_ID to the current session id", async () => {
  const original = process.env.PI_CLIENT_SESSION_ID;
  try {
    delete process.env.PI_CLIENT_SESSION_ID;
    const handler = await sessionStartHandler();
    handler({ type: "session_start", reason: "new" }, sessionStartContext("019f0000-0000-7000-8000-000000000001"));
    assert.equal(process.env.PI_CLIENT_SESSION_ID, "019f0000-0000-7000-8000-000000000001");
  } finally {
    if (original === undefined) delete process.env.PI_CLIENT_SESSION_ID;
    else process.env.PI_CLIENT_SESSION_ID = original;
  }
});

test("session_start replaces the previous PI_CLIENT_SESSION_ID", async () => {
  const original = process.env.PI_CLIENT_SESSION_ID;
  try {
    process.env.PI_CLIENT_SESSION_ID = "019e0000-0000-7000-8000-000000000001";
    const handler = await sessionStartHandler();
    handler({ type: "session_start", reason: "new" }, sessionStartContext("019f0000-0000-7000-8000-000000000001"));
    assert.equal(process.env.PI_CLIENT_SESSION_ID, "019f0000-0000-7000-8000-000000000001");
  } finally {
    if (original === undefined) delete process.env.PI_CLIENT_SESSION_ID;
    else process.env.PI_CLIENT_SESSION_ID = original;
  }
});

test("rendered Gateway providers carry the attribution overlay and Claude compat", () => {
  const catalog = renderedCatalog();
  for (const provider of ["anthropic", "openai", "google", "baseten", "typesafe"]) {
    assert.ok(catalog.providers[provider], `missing provider ${provider}`);
    for (const [name, value] of Object.entries(attributionHeaders)) {
      assert.equal(catalog.providers[provider].headers?.[name], value, `${provider} header ${name}`);
    }
    assert.equal(catalog.providers[provider].headers?.["x-dd-tag-ml_app_id"], undefined, `${provider} must use the governed ml-app-id header`);
  }

  assert.equal(catalog.providers.typesafe.headers?.provider, "typesafe");
  assert.equal(catalog.providers.anthropic.headers?.["anthropic-beta"], "context-1m-2025-08-07");
  assert.deepEqual(catalog.providers.anthropic.compat, {
    supportsStrictTools: false,
    supportsMidConvoSystemMessages: false,
    supportsMidConvoToolChanges: false,
    supportsMidConvoEffort: false,
  });
});

test("cutover catalog uses stock providers with headers-only overlays", () => {
  const catalog = renderedCatalog();
  for (const provider of ["anthropic", "openai", "google", "baseten", "typesafe"]) {
    assert.equal(catalog.providers[provider].baseUrl, undefined, `${provider} must use the package base URL`);
    assert.equal(catalog.providers[provider].apiKey, undefined, `${provider} must use the package API key`);
  }
  for (const provider of [
    "ai-gw-openai",
    "ai-gw-google",
    "ai-gw-anthropic-200k",
    "ai-gw-anthropic-1m",
    "ai-gw-logical",
    "ai-gw-baseten",
  ]) {
    assert.equal(catalog.providers[provider], undefined, `${provider} must be removed after cutover`);
  }
});

test("an environment-backed session-id header requires the extension entrypoint", () => {
  const catalog = renderedCatalog();
  const hasSessionIdHeader = Object.values(catalog.providers).some((provider) =>
    Object.values(provider.headers ?? {}).some((value) => typeof value === "string" && value.includes("$PI_CLIENT_SESSION_ID")),
  );
  if (hasSessionIdHeader) {
    const extensionPath = resolve(dirname(fileURLToPath(import.meta.url)), "index.ts");
    assert.ok(existsSync(extensionPath), `missing extension entrypoint ${extensionPath}`);
  }
});
