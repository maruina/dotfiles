import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

async function loadTools() {
  const { default: register } = await import("./cost-optimization.ts");
  const tools = new Map();
  register({ registerTool: (tool) => tools.set(tool.name, tool) });
  return tools;
}

test("limits bash output to 16KiB and preserves the complete output", async () => {
  const tools = await loadTools();
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
  const tools = await loadTools();
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
