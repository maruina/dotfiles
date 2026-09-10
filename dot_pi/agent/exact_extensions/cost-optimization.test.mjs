import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

async function loadExtension() {
  const { default: register } = await import("./cost-optimization.ts");
  const tools = new Map();
  const handlers = new Map();
  register({
    registerTool: (tool) => tools.set(tool.name, tool),
    on: (event, handler) => handlers.set(event, handler),
  });
  return { tools, handlers };
}

test("limits bash output to 16KiB and preserves the complete output", async () => {
  const { tools } = await loadExtension();
  const result = await tools.get("bash").execute(
    "test",
    { command: "yes x | head -c 20000" },
    undefined,
    undefined,
    { cwd: process.cwd() },
  );

  assert.match(result.content[0].text, /Output truncated/);
  assert.equal(result.details.truncation.maxBytes, 16 * 1024);
  assert.equal((await readFile(result.details.fullOutputPath)).length, 20000);
  await rm(dirname(result.details.fullOutputPath), { recursive: true, force: true });
});

test("limits MCP call output to 6KiB and preserves the complete output", async () => {
  const { tools } = await loadExtension();
  const binDir = await mkdtemp(join(tmpdir(), "pi-mcp-cli-test-"));
  const executable = join(binDir, "mcp-cli");
  await writeFile(executable, "#!/bin/sh\nhead -c 10000 /dev/zero | tr '\\0' x\n");
  await chmod(executable, 0o755);

  const originalPath = process.env.PATH;
  process.env.PATH = `${binDir}:${originalPath}`;
  try {
    const result = await tools.get("mcps_call").execute(
      "test",
      { server: "test", tool: "output" },
      undefined,
    );

    assert.match(result.content[0].text, /Output truncated/);
    assert.match(result.content[0].text, /6\.0KB/);
    assert.equal((await readFile(result.details.fullOutputPath)).length, 10000);
    await rm(dirname(result.details.fullOutputPath), { recursive: true, force: true });
  } finally {
    process.env.PATH = originalPath;
    await rm(binDir, { recursive: true, force: true });
  }
});

test("blocks a full-file read over 800 lines", async () => {
  const { handlers } = await loadExtension();
  const dir = await mkdtemp(join(tmpdir(), "pi-read-guard-"));
  await writeFile(join(dir, "big.ts"), "line\n".repeat(801));
  try {
    const result = await handlers.get("tool_call")({ toolName: "read", input: { path: "big.ts" } }, { cwd: dir });
    assert.equal(result.block, true);
    assert.match(result.reason, /800 lines/);
    assert.match(result.reason, /offset\/limit/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("allows targeted reads on large files", async () => {
  const { handlers } = await loadExtension();
  const dir = await mkdtemp(join(tmpdir(), "pi-read-guard-"));
  const file = join(dir, "big.ts");
  await writeFile(file, "line\n".repeat(801));
  try {
    const handler = handlers.get("tool_call");
    assert.equal(await handler({ toolName: "read", input: { path: file, offset: 100 } }, { cwd: dir }), undefined);
    assert.equal(await handler({ toolName: "read", input: { path: file, limit: 50 } }, { cwd: dir }), undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("allows full reads of small files and images", async () => {
  const { handlers } = await loadExtension();
  const dir = await mkdtemp(join(tmpdir(), "pi-read-guard-"));
  const small = join(dir, "small.ts");
  const image = join(dir, "big.png");
  await writeFile(small, "line\n".repeat(10));
  await writeFile(image, "line\n".repeat(801));
  try {
    const handler = handlers.get("tool_call");
    assert.equal(await handler({ toolName: "read", input: { path: small } }, { cwd: dir }), undefined);
    assert.equal(await handler({ toolName: "read", input: { path: image } }, { cwd: dir }), undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("fails open on missing files and ignores non-read tools", async () => {
  const { handlers } = await loadExtension();
  const handler = handlers.get("tool_call");
  const cwd = process.cwd();
  assert.equal(await handler({ toolName: "read", input: { path: join(cwd, "does-not-exist.ts") } }, { cwd }), undefined);
  assert.equal(await handler({ toolName: "bash", input: { command: "cat big.log" } }, { cwd }), undefined);
});
