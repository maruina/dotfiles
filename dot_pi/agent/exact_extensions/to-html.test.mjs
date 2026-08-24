import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  lstat,
  mkdtemp,
  readFile,
  rm,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import registerToHtml, {
  MAX_PREVIEW_BYTES,
  createPreviewStorage,
  getPreviewOpener,
  openPreview,
  renderHtml,
  selectLatestAssistantText,
  validateInput,
} from "./to-html.ts";

const require = createRequire(import.meta.url);
const mermaidBundle = await readFile(
  require.resolve("mermaid/dist/mermaid.min.js"),
  "utf8",
);

function assistant(content, stopReason = "stop") {
  return {
    type: "message",
    message: { role: "assistant", content, stopReason },
  };
}

const renderedMain = (html) => html.match(/<main>([\s\S]*?)<\/main>/)?.[1] ?? "";

function createHarness() {
  const commands = new Map();
  registerToHtml({
    on() {},
    registerCommand(name, command) {
      commands.set(name, command);
    },
  });
  return commands;
}

test("registers the /to-html command", () => {
  const commands = createHarness();
  assert.equal(commands.get("to-html")?.description, "Open the latest assistant response as local HTML");
  assert.equal(typeof commands.get("to-html")?.handler, "function");
});

test("selects text blocks from the newest completed assistant response", () => {
  const result = selectLatestAssistantText([
    assistant([{ type: "text", text: "older" }]),
    { type: "message", message: { role: "toolResult", content: [] } },
    assistant([
      { type: "text", text: "first" },
      { type: "thinking", thinking: "ignore" },
      { type: "text", text: "second" },
    ]),
  ]);

  assert.deepEqual(result, { status: "ok", text: "first\nsecond" });
});

test("rejects the newest assistant response when it is incomplete", () => {
  const result = selectLatestAssistantText([
    assistant([{ type: "text", text: "complete" }]),
    assistant([{ type: "text", text: "incomplete" }], "toolUse"),
  ]);

  assert.deepEqual(result, { status: "incomplete" });
});

test("rejects branches without usable assistant text", () => {
  assert.deepEqual(selectLatestAssistantText([]), { status: "missing" });
  assert.deepEqual(
    selectLatestAssistantText([assistant([{ type: "toolCall", name: "read" }])]),
    { status: "missing" },
  );
});

test("renders Markdown, code, and Mermaid in source order", () => {
  const html = renderHtml(
    [
      "Before",
      "```mermaid",
      "flowchart TD",
      "  A --> B",
      "```",
      "Between",
      "```javascript",
      "const answer = 42;",
      "```",
      "```text",
      "unknown <tag>",
      "```",
      "After",
    ].join("\n"),
    mermaidBundle,
  );

  assert.ok(html.indexOf("Before") < html.indexOf("flowchart TD"));
  assert.ok(html.indexOf("flowchart TD") < html.indexOf("Between"));
  assert.ok(html.indexOf("Between") < html.indexOf("hljs-keyword"));
  assert.ok(html.indexOf("hljs-keyword") < html.indexOf("unknown &lt;tag&gt;"));
  assert.ok(html.indexOf("unknown &lt;tag&gt;") < html.indexOf("After"));
  assert.match(html, /<pre class="mermaid">flowchart TD/);
  assert.match(html, /securityLevel: "strict"/);
  assert.match(html, /Diagram unavailable/);
});

test("embeds Mermaid's standalone browser bundle instead of unresolved ESM chunks", () => {
  const html = renderHtml(
    [
      "```mermaid",
      " sequenceDiagram",
      "     participant Trigger as Provision or child upgrade",
      "     participant Account as Account workflow",
      "     Trigger->>Account: start lifecycle operation",
      "```",
    ].join("\n"),
    mermaidBundle,
  );

  assert.match(html, /<pre class="mermaid"> sequenceDiagram/);
  assert.match(html, /globalThis\["mermaid"\]/);
  assert.match(html, /const mermaid = globalThis\.mermaid/);
  assert.match(html, /error instanceof Error \? error\.message : String\(error\)/);
  assert.doesNotMatch(html, /from"\.\/chunks\/mermaid/);
});

test("escapes untrusted markup and keeps media and unsafe links inert", () => {
  const html = renderHtml(
    [
      "<script>alert(1)</script>",
      "![remote image](https://example.test/image.png)",
      "[safe](https://example.test/path) [bad](javascript:alert(1))",
      "```mermaid",
      "flowchart TD",
      "  A[</pre><script>alert(1)</script>] --> B",
      "```",
    ].join("\n"),
    mermaidBundle,
  );

  const body = renderedMain(html);
  assert.match(body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(body, /<img\b/);
  assert.match(body, /remote image/);
  assert.match(body, /href="https:\/\/example\.test\/path"/);
  assert.doesNotMatch(body, /href="javascript:/);
  assert.match(body, /&lt;\/pre&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<(?:script|link|img)\b[^>]+(?:src|href)="https?:\/\//);
});

test("renders GFM tables with legible local styling", () => {
  const html = renderHtml(
    [
      "| Component | Result |",
      "| --- | --- |",
      "| Renderer | Passed |",
    ].join("\n"),
    mermaidBundle,
  );

  assert.match(renderedMain(html), /<table>/);
  assert.match(renderedMain(html), /<th>Component<\/th>/);
  assert.match(renderedMain(html), /<td>Passed<\/td>/);
  assert.match(html, /table \{ background: #292c3c;/);
  assert.match(html, /th \{ background: #ca9ee6; color: #303446;/);
  assert.match(html, /td:nth-child\(4n \+ 1\) \{ background: #8caaee26;/);
  assert.match(html, /td:nth-child\(4n \+ 2\) \{ background: #a6d18926;/);
  assert.match(html, /td:nth-child\(4n \+ 3\) \{ background: #e5c89026;/);
  assert.match(html, /td:nth-child\(4n \+ 4\) \{ background: #ca9ee626;/);
});

test("rejects response input beyond byte and complete Mermaid-fence limits", () => {
  assert.deepEqual(validateInput("x".repeat(1024 * 1024 + 1)), {
    ok: false,
    reason: "input-too-large",
  });

  const diagrams = Array.from(
    { length: 21 },
    () => "```mermaid\nflowchart TD\nA --> B\n```",
  ).join("\n");
  assert.deepEqual(validateInput(diagrams), {
    ok: false,
    reason: "too-many-mermaid-diagrams",
  });
  assert.deepEqual(validateInput("```mermaid\nunterminated"), { ok: true });
});

const previewName = (index) => `response-${index}-00000000-0000-4000-8000-000000000000.html`;

async function withPreviewDirectory(run) {
  const parent = await mkdtemp(path.join(tmpdir(), "pi-to-html-test-"));
  const directory = path.join(parent, "pi-to-html");
  try {
    await run(directory);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

async function writePreview(directory, index, content, ageMs = 0) {
  const file = path.join(directory, previewName(index));
  await writeFile(file, content, { mode: 0o600 });
  const time = new Date(Date.now() - ageMs);
  await utimes(file, time, time);
  return file;
}

test("creates an owner-only preview directory and removes only eligible stale files", async () => {
  await withPreviewDirectory(async (directory) => {
    const storage = createPreviewStorage({ directory, now: () => Date.now() });
    await storage.prepare(1);
    const directoryStats = await lstat(directory);
    if (process.platform !== "win32") assert.equal(directoryStats.mode & 0o777, 0o700);

    const stale = await writePreview(directory, 1, "stale", 25 * 60 * 60 * 1000);
    const unrelated = path.join(directory, "unrelated.txt");
    await writeFile(unrelated, "keep");
    const link = path.join(directory, previewName(2));
    await symlink(unrelated, link);

    await storage.prepare(1);
    await assert.rejects(lstat(stale));
    assert.equal((await lstat(unrelated)).isFile(), true);
    assert.equal((await lstat(link)).isSymbolicLink(), true);
  });
});

test("retains newest matching previews while reserving count and byte capacity", async () => {
  await withPreviewDirectory(async (directory) => {
    const storage = createPreviewStorage({
      directory,
      now: () => 100_000,
      maxFiles: 3,
      maxBytes: 10,
    });
    await storage.prepare(1);
    for (let index = 1; index <= 3; index += 1) {
      await writePreview(directory, index, "1234", 4 - index);
    }

    const output = await storage.prepare(3);
    assert.match(output, /response-/);
    await assert.rejects(lstat(path.join(directory, previewName(1))));
    await assert.rejects(lstat(path.join(directory, previewName(2))));
    assert.equal((await readFile(path.join(directory, previewName(3)), "utf8")), "1234");
  });
  assert.equal(MAX_PREVIEW_BYTES, 50 * 1024 * 1024);
});

test("rejects an unsafe preview root and only fails cleanup when capacity cannot be reserved", async () => {
  await withPreviewDirectory(async (directory) => {
    await writeFile(directory, "not a directory");
    const storage = createPreviewStorage({ directory });
    await assert.rejects(storage.prepare(1), /unsafe preview directory/);
  });

  await withPreviewDirectory(async (directory) => {
    const storage = createPreviewStorage({
      directory,
      maxFiles: 2,
      maxBytes: 20,
      now: () => Date.now(),
      removeFile: async () => { throw new Error("denied"); },
    });
    await storage.prepare(1);
    const stale = await writePreview(directory, 1, "1234567890", 25 * 60 * 60 * 1000);
    await storage.prepare(1);
    assert.equal((await lstat(stale)).isFile(), true);
  });

  await withPreviewDirectory(async (directory) => {
    const storage = createPreviewStorage({
      directory,
      maxFiles: 2,
      maxBytes: 10,
      removeFile: async () => { throw new Error("denied"); },
    });
    await storage.prepare(1);
    await writePreview(directory, 1, "1234567890");
    await assert.rejects(storage.prepare(1), /preview capacity/);
  });
});

test("writes matching owner-only previews with exclusive creation", async () => {
  await withPreviewDirectory(async (directory) => {
    const storage = createPreviewStorage({
      directory,
      randomUuid: () => "00000000-0000-4000-8000-000000000000",
      now: () => 123,
    });
    const output = await storage.prepare(Buffer.byteLength("document"));
    await storage.write(output, "document");
    assert.equal(await readFile(output, "utf8"), "document");
    if (process.platform !== "win32") assert.equal((await lstat(output)).mode & 0o777, 0o600);
    await assert.rejects(storage.write(output, "again"));
  });
});

test("selects platform openers and retains previews when opening fails", async () => {
  const preview = "/tmp/pi-to-html/response.html";
  assert.deepEqual(getPreviewOpener("darwin", preview), { command: "open", args: [preview] });
  assert.deepEqual(getPreviewOpener("linux", preview), { command: "xdg-open", args: [preview] });
  assert.deepEqual(getPreviewOpener("win32", preview), {
    command: "cmd.exe",
    args: ["/d", "/s", "/c", `start "" "${preview}"`],
  });
  assert.equal(getPreviewOpener("freebsd", preview), null);

  const calls = [];
  const pi = {
    async exec(command, args, options) {
      calls.push({ command, args, options });
      return { code: 1, killed: false, stdout: "", stderr: "failed" };
    },
  };
  assert.equal(await openPreview(pi, preview, "darwin"), false);
  assert.deepEqual(calls, [{ command: "open", args: [preview], options: { timeout: 10_000 } }]);
  assert.equal(await openPreview({ exec: async () => { throw new Error("missing"); } }, preview, "linux"), false);
});
