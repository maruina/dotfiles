import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, stat, truncate, writeFile } from "node:fs/promises";
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

test("blocks full-file reads over 800 lines, including a final unterminated line", async () => {
  const { handlers } = await loadExtension();
  const dir = await mkdtemp(join(tmpdir(), "pi-read-guard-"));
  await writeFile(join(dir, "terminated.ts"), "line\n".repeat(801));
  await writeFile(join(dir, "unterminated.ts"), "line\n".repeat(800) + "line");
  try {
    const handler = handlers.get("tool_call");
    const terminated = await handler({ toolName: "read", input: { path: "terminated.ts" } }, { cwd: dir });
    const unterminated = await handler({ toolName: "read", input: { path: "unterminated.ts" } }, { cwd: dir });
    assert.equal(terminated.block, true);
    assert.equal(unterminated.block, true);
    assert.match(terminated.reason, /800 lines/);
    assert.match(terminated.reason, /offset\/limit/);
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

test("allows full reads of small files and verified images", async () => {
  const { handlers } = await loadExtension();
  const dir = await mkdtemp(join(tmpdir(), "pi-read-guard-"));
  const small = join(dir, "small.ts");
  const image = join(dir, "image.png");
  const disguisedText = join(dir, "text.png");
  await writeFile(small, "line\n".repeat(10));
  await writeFile(image, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
  await writeFile(disguisedText, "line\n".repeat(801));
  try {
    const handler = handlers.get("tool_call");
    assert.equal(await handler({ toolName: "read", input: { path: small } }, { cwd: dir }), undefined);
    assert.equal(await handler({ toolName: "read", input: { path: image } }, { cwd: dir }), undefined);
    assert.equal((await handler({ toolName: "read", input: { path: disguisedText } }, { cwd: dir })).block, true);
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

test("skips non-regular read targets without waiting for EOF", { timeout: 500 }, async (t) => {
  const devicePath = "/dev/zero";
  const deviceStat = await stat(devicePath).catch(() => undefined);
  if (!deviceStat || deviceStat.isFile()) {
    t.skip(`${devicePath} is unavailable or regular on this platform`);
    return;
  }

  const { handlers } = await loadExtension();
  const signal = AbortSignal.timeout(100);
  const result = await handlers.get("tool_call")(
    { toolName: "read", input: { path: devicePath } },
    { cwd: process.cwd(), signal },
  );
  assert.equal(result, undefined);
  assert.equal(signal.aborted, false);
});

test("stops line counting when the tool call is cancelled", { timeout: 500 }, async () => {
  const { handlers } = await loadExtension();
  const dir = await mkdtemp(join(tmpdir(), "pi-read-guard-"));
  const file = join(dir, "large-line.txt");
  await writeFile(file, "");
  await truncate(file, 256 * 1024 * 1024);
  const signal = AbortSignal.timeout(10);
  try {
    await handlers.get("tool_call")({ toolName: "read", input: { path: file } }, { cwd: dir, signal });
    assert.equal(signal.aborted, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
