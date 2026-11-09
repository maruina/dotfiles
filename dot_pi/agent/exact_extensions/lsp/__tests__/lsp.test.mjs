import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import Module from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
const piNodeModules = join(globalRoot, "@earendil-works/pi-coding-agent/node_modules");
process.env.NODE_PATH = [piNodeModules, globalRoot, process.env.NODE_PATH].filter(Boolean).join(":");
Module._initPaths();

const require = Module.createRequire(import.meta.url);
const { createJiti } = require("jiti");
const testDir = dirname(fileURLToPath(import.meta.url));
const agentRoot = resolve(testDir, "../../..");
const extensionsDir = resolve(testDir, "../..");
const extensionPrefix = extensionsDir.endsWith("/extensions") ? "extensions/lsp" : "exact_extensions/lsp";
const jiti = createJiti(`${agentRoot}/`);

const utils = jiti(`./${extensionPrefix}/utils.ts`);
const servers = jiti(`./${extensionPrefix}/servers.ts`);
const transport = jiti(`./${extensionPrefix}/transport.ts`);
const entry = jiti(`./${extensionPrefix}.ts`);

function tempDir() { return mkdtempSync(join(tmpdir(), "pi-lsp-test-")); }

function fakeClient(config = { id: "x", label: "X", command: "x", args: [], extensions: [], rootMarkers: [], languageId: () => "x" }) {
  const writes = [];
  const client = new transport.LspClient(process.cwd(), config, "/bin/false");
  client.process = { stdin: { write: (text) => writes.push(text) }, exitCode: null };
  return { client, writes };
}

function rpcBodies(writes) {
  return writes.map((text) => JSON.parse(text.slice(text.indexOf("\r\n\r\n") + 4)));
}

function fakePi() {
  const tools = new Map();
  const commands = new Map();
  const handlers = [];
  return {
    tools,
    commands,
    handlers,
    pi: {
      on(name, handler) { handlers.push({ name, handler }); },
      appendEntry() {},
      registerTool(tool) { tools.set(tool.name, tool); },
      registerCommand(name, command) { commands.set(name, command); },
    },
  };
}

test("extension registers LSP tools and command", () => {
  const app = fakePi();
  entry.default(app.pi);

  assert.equal(app.tools.size, 16);
  assert.ok(app.tools.has("lsp_context"));
  assert.ok(app.tools.has("lsp_prepare_edit_context"));
  assert.ok(app.tools.has("lsp_workspace_symbols"));
  assert.ok(app.commands.has("lsp"));
  assert.ok(app.handlers.some((h) => h.name === "session_start"));
  assert.ok(app.handlers.some((h) => h.name === "session_shutdown"));
});

test("lsp_workspace_symbols without file does not default to Go", async () => {
  const app = fakePi();
  entry.default(app.pi);

  const result = await app.tools.get("lsp_workspace_symbols").execute("tool-id", { query: "Foo" });

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /pass file to choose language\/root/);
});

test("/lsp status reports debug-oriented state", async () => {
  const app = fakePi();
  entry.default(app.pi);
  const notifications = [];

  await app.commands.get("lsp").handler("status", { ui: { notify: (text, level) => notifications.push({ text, level }) } });

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].level, "info");
  assert.match(notifications[0].text, /LSP clients \(0\):/);
  assert.match(notifications[0].text, /- none/);
  assert.match(notifications[0].text, /Roots:/);
});

test("position candidates prefer exact identifier position and snap nearby whitespace", () => {
  const dir = tempDir();
  const file = join(dir, "sample.ts");
  writeFileSync(file, "const value = service?.client.method();\n");

  assert.deepEqual(utils.lspPositionCandidates(file, 1, 7)[0], { line: 0, character: 6 });

  const snapped = utils.lspPositionCandidates(file, 1, 14);
  assert.ok(snapped[0].line === 0 && snapped[0].character >= 14 && snapped[0].character <= 35);
  assert.ok(snapped.some((p) => p.line === 0 && p.character === 13));
});

test("position validation rejects non-positive line or column", () => {
  assert.throws(() => utils.toLspPosition(0, 1), /positive integers/);
  assert.throws(() => utils.toLspPosition(1, 0), /positive integers/);
});

test("workspace root discovery and path containment are project scoped", () => {
  const dir = tempDir();
  const projectA = join(dir, "a");
  const projectB = join(dir, "b");
  mkdirSync(join(projectA, "src"), { recursive: true });
  mkdirSync(join(projectB, "src"), { recursive: true });
  writeFileSync(join(projectA, "go.mod"), "module a\n");
  writeFileSync(join(projectB, "go.mod"), "module b\n");
  const fileA = join(projectA, "src", "main.go");
  const fileB = join(projectB, "src", "main.go");
  writeFileSync(fileA, "package main\n");
  writeFileSync(fileB, "package main\n");
  const config = { rootMarkers: ["go.mod"] };

  assert.equal(utils.findWorkspaceRoot(fileA, config), projectA);
  assert.equal(utils.findWorkspaceRoot(fileB, config), projectB);
  assert.equal(utils.isInsidePath(fileA, projectA), true);
  assert.equal(utils.isInsidePath(fileB, projectA), false);
});

test("routes Helm chart files before generic YAML files", () => {
  const dir = tempDir();
  const chart = join(dir, "chart");
  const templates = join(chart, "templates");
  const other = join(dir, "other");
  mkdirSync(templates, { recursive: true });
  mkdirSync(other, { recursive: true });
  writeFileSync(join(chart, "Chart.yaml"), "apiVersion: v2\nname: demo\nversion: 0.1.0\n");
  writeFileSync(join(chart, "values.yaml"), "replicaCount: 1\n");
  writeFileSync(join(templates, "deployment.yaml"), "apiVersion: apps/v1\nkind: Deployment\n");
  writeFileSync(join(other, "deployment.yaml"), "apiVersion: apps/v1\nkind: Deployment\n");

  assert.equal(utils.configForFile(join(chart, "Chart.yaml"), servers.SERVER_CONFIGS).id, "helm");
  assert.equal(utils.configForFile(join(chart, "values.yaml"), servers.SERVER_CONFIGS).id, "helm");
  assert.equal(utils.configForFile(join(templates, "deployment.yaml"), servers.SERVER_CONFIGS).id, "helm");
  assert.equal(utils.configForFile(join(other, "deployment.yaml"), servers.SERVER_CONFIGS).id, "yaml");
});

test("routes Terraform files to the terraform-ls server with module context", () => {
  const dir = tempDir();
  const module = join(dir, "module");
  const env = join(module, "env");
  mkdirSync(env, { recursive: true });
  writeFileSync(join(module, "main.tf"), 'variable "env" {\n  type = string\n}\n');
  writeFileSync(join(env, "prod.tfvars"), 'env = "demo"\n');
  const config = utils.configForFile(join(module, "main.tf"), servers.SERVER_CONFIGS);

  assert.equal(config.id, "terraform");
  assert.equal(config.languageId(join(module, "main.tf")), "terraform");
  assert.equal(config.languageId(join(env, "prod.tfvars")), "terraform-vars");
  assert.ok(!config.initializationOptions || config.initializationOptions.terraform.path.endsWith("/tofu"));
  assert.equal(utils.findWorkspaceRoot(join(env, "prod.tfvars"), config), env);
  assert.equal(config.root(join(env, "prod.tfvars")), module);
  assert.equal(config.root(join(dir, "standalone.tfvars")), null);
  assert.equal(servers.findTerraformModuleRoot(join(env, "prod.tfvars")), module);

  writeFileSync(join(module, ".terraform.lock.hcl"), "");
  assert.equal(utils.findWorkspaceRoot(join(env, "prod.tfvars"), config), module);
});

test("workspace configuration returns server settings by section", () => {
  const { client, writes } = fakeClient({ id: "yaml", label: "YAML", command: "yaml-language-server", args: [], extensions: [".yaml"], rootMarkers: [], settings: { yaml: { validate: true }, nested: { value: 1 } }, languageId: () => "yaml" });

  client.handleServerRequest({ jsonrpc: "2.0", id: 1, method: "workspace/configuration", params: { items: [{ section: "yaml" }, { section: "nested.value" }, { section: "missing" }] } });

  const response = rpcBodies(writes)[0];
  assert.deepEqual(response.result, [{ validate: true }, 1, null]);
});

test("normalizes LocationLink results to Locations", () => {
  const result = utils.normalizeLocations([{ targetUri: "file:///tmp/a.ts", targetRange: { start: { line: 1, character: 2 }, end: { line: 1, character: 3 } }, targetSelectionRange: { start: { line: 4, character: 5 }, end: { line: 4, character: 6 } } }]);

  assert.deepEqual(result, [{ uri: "file:///tmp/a.ts", range: { start: { line: 4, character: 5 }, end: { line: 4, character: 6 } } }]);
  assert.deepEqual(utils.normalizeLocations(null), []);
});

test("finds the smallest enclosing document symbol", () => {
  const symbols = [{ name: "Outer", kind: 5, range: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } }, selectionRange: { start: { line: 0, character: 6 }, end: { line: 0, character: 11 } }, children: [{ name: "inner", kind: 12, range: { start: { line: 2, character: 2 }, end: { line: 4, character: 2 } }, selectionRange: { start: { line: 2, character: 11 }, end: { line: 2, character: 16 } } }] }];

  const enclosing = utils.findEnclosingSymbol(symbols, 3, 3);

  assert.equal(enclosing.name, "inner");
});

test("document sync opens once, changes versions, and invalidates diagnostics", async () => {
  const dir = tempDir();
  const file = join(dir, "sample.ts");
  const uri = pathToFileURL(file).href;
  writeFileSync(file, "export const value = 1;\n");
  const { client, writes } = fakeClient();

  client.diagnosticsByUri.set(uri, [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, message: "stale" }]);
  await client.openDocument(file);
  await client.openDocument(file);

  let bodies = rpcBodies(writes);
  assert.equal(bodies.filter((m) => m.method === "textDocument/didOpen").length, 1);
  assert.equal(bodies.filter((m) => m.method === "textDocument/didChange").length, 0);
  assert.equal(client.diagnostics(file).size, 0);

  client.diagnosticsByUri.set(uri, [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, message: "stale" }]);
  writeFileSync(file, "export const value = 2;\n");
  await client.openDocument(file);

  bodies = rpcBodies(writes);
  const changes = bodies.filter((m) => m.method === "textDocument/didChange");
  assert.equal(changes.length, 1);
  assert.equal(changes[0].params.textDocument.version, 2);
  assert.equal(client.diagnostics(file).size, 0);
});

test("document sync coalesces concurrent opens for the same URI", async () => {
  const dir = tempDir();
  const file = join(dir, "sample.ts");
  writeFileSync(file, "export const value = 1;\n");
  const { client } = fakeClient();
  let calls = 0;
  client.syncDocumentUnsafe = async () => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return pathToFileURL(file).href;
  };

  await Promise.all([client.openDocument(file), client.openDocument(file)]);

  assert.equal(calls, 1);
});

test("TypeScript selection uses the workspace package and preserves the legacy path", () => {
  const base = servers.SERVER_CONFIGS.find((c) => c.id === "typescript");
  const root = tempDir();
  const pkg = join(root, "node_modules/typescript");
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(pkg, "package.json"), JSON.stringify({ version: "7.0.2", bin: { tsc: "bin/tsc" } }));
  const selected = servers.typescriptServerConfig(join(root, "index.ts"), base);
  assert.equal(selected.command, join(pkg, "bin/tsc"));
  assert.deepEqual(selected.args, ["--lsp", "--stdio"]);
  writeFileSync(join(pkg, "package.json"), JSON.stringify({ version: "6.0.3" }));
  assert.equal(servers.typescriptServerConfig(join(root, "index.ts"), base), base);
  assert.equal(servers.typescriptServerConfig(join(tempDir(), "index.ts"), base), base);
});

test("real TypeScript 7.0.2 initializes, syncs, and serves the registered tools", async () => {
  const base = servers.SERVER_CONFIGS.find((c) => c.id === "typescript");
  const file = join(agentRoot, "node_modules/.pi-lsp-integration.ts");
  const { rmSync } = await import("node:fs");
  writeFileSync(file, "export const value = 1;\nconst use: string = value;\n");
  const config = servers.typescriptServerConfig(file, base);
  const client = new transport.LspClient(agentRoot, config, config.command);
  const app = fakePi();
  entry.default(app.pi);
  try {
    const info = await client.start();
    assert.equal(info.serverInfo.version, "7.0.2");
    assert.equal(info.capabilities.textDocumentSync.change, 2);
    assert.equal(info.capabilities.diagnosticProvider.identifier, "typescript");
    await client.openDocument(file);
    await client.waitForDiagnostics(file);
    assert.ok(client.diagnostics(file).get(file).some((d) => d.code === 2322));
    writeFileSync(file, "export const value = 123;\nexport const use: number = value;\n");
    await client.openDocument(file);
    await client.waitForDiagnostics(file);
    assert.deepEqual(client.diagnostics(file).get(file), []);
    for (const name of ["lsp_go_to_definition", "lsp_find_references"]) {
      const result = await app.tools.get(name).execute("integration", { file, line: 2, column: 28 }, undefined, undefined, { cwd: agentRoot });
      assert.ok(result.details.locations.length > 0, JSON.stringify(result));
    }
    writeFileSync(file, "export const value = 1;\nconst use: string = value;\n");
    const result = await app.tools.get("lsp_diagnostics").execute("integration", { file }, undefined, undefined, { cwd: agentRoot });
    assert.ok(result.details.diagnostics.some((d) => d.code === 2322), JSON.stringify(result));
  } finally {
    await client.shutdown();
    for (const h of app.handlers.filter((h) => h.name === "session_shutdown")) await h.handler();
    rmSync(file, { force: true });
  }
  assert.equal(client.isRunning, false);
});

test("startup failure rejects and cleans up the process", async () => {
  const config = { id: "x", label: "X", command: "missing", args: [], languageId: () => "x" };
  const client = new transport.LspClient(tempDir(), config, "/does-not-exist/pi-lsp");
  await assert.rejects(client.start(), /ENOENT/);
  assert.equal(client.isRunning, false);
});

test("startup exit includes stderr and leaves no running process", async () => {
  const config = { id: "x", label: "X", command: process.execPath, args: ["-e", "process.stderr.write('startup failed'); process.exit(23)"], languageId: () => "x" };
  const client = new transport.LspClient(tempDir(), config, process.execPath);
  await assert.rejects(client.start(), /code 23[\s\S]*startup failed/);
  assert.equal(client.isRunning, false);
  assert.equal(client.pending.size, 0);
});

test("incremental sync replaces the old UTF-16 range", async () => {
  const file = join(tempDir(), "index.ts");
  writeFileSync(file, "const value = '😀';\n");
  const { client, writes } = fakeClient();
  client.capabilities = { textDocumentSync: { openClose: true, change: 2 } };
  await client.openDocument(file);
  writeFileSync(file, "export const value = 2;\n");
  await client.openDocument(file);
  assert.deepEqual(rpcBodies(writes)[1].params.contentChanges, [{ range: { start: { line: 0, character: 0 }, end: { line: 1, character: 0 } }, text: "export const value = 2;\n" }]);
});

test("LspClient debug state is safe before startup", () => {
  const client = new transport.LspClient(process.cwd(), { id: "x", label: "X", command: "x", args: [], extensions: [], rootMarkers: [], languageId: () => "x" }, "/bin/false");

  assert.deepEqual(client.debugState(), { running: false, initialized: false, command: "x", commandPath: "/bin/false", args: [], activeOverride: undefined, env: {}, openDocuments: 0, diagnostics: 0, syncingDocuments: 0 });
});
