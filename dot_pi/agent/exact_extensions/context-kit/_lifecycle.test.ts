import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import register from "./index.ts";

const usageDir = mkdtempSync(join(tmpdir(), "context-kit-lifecycle-usage-"));
const previousUsageDir = process.env.PI_CONTEXT_KIT_USAGE_DIR;
process.env.PI_CONTEXT_KIT_USAGE_DIR = usageDir;
after(() => {
  if (previousUsageDir === undefined) delete process.env.PI_CONTEXT_KIT_USAGE_DIR;
  else process.env.PI_CONTEXT_KIT_USAGE_DIR = previousUsageDir;
  rmSync(usageDir, { recursive: true, force: true });
});

type AnyRecord = Record<string, unknown>;
type Handler = (event: AnyRecord, ctx: AnyRecord) => unknown;
type Renderer = (message: AnyRecord, options: AnyRecord, theme: AnyRecord) => {
  render: (width: number) => string[];
  invalidate: () => void;
};
type Harness = {
  handlers: Map<string, Handler>;
  commands: Map<string, (args: string, ctx: AnyRecord) => Promise<void>>;
  renderers: Map<string, Renderer>;
  sent: AnyRecord[];
  sentOptions: (AnyRecord | undefined)[];
  appended: AnyRecord[];
  warnings: string[];
  notifications: Array<{ message: string; level: string }>;
  root: string;
};

function createHarness(root: string): Harness {
  const harness: Harness = {
    handlers: new Map(),
    commands: new Map(),
    renderers: new Map(),
    sent: [],
    sentOptions: [],
    appended: [],
    warnings: [],
    notifications: [],
    root,
  };
  register({
    on: (name: string, handler: Handler) => harness.handlers.set(name, handler),
    registerCommand: (name: string, command: { handler: (args: string, ctx: AnyRecord) => Promise<void> }) => harness.commands.set(name, command.handler),
    registerMessageRenderer: (name: string, renderer: Renderer) => harness.renderers.set(name, renderer),
    sendMessage: (message: AnyRecord, options?: AnyRecord) => {
      harness.sent.push(message);
      harness.sentOptions.push(options);
    },
    appendEntry: (customType: string, data: unknown) => harness.appended.push({ customType, data }),
    events: { emit() {} },
  } as never);
  return harness;
}

function ctx(h: Harness, hasUI = false): AnyRecord {
  return {
    cwd: h.root,
    hasUI,
    ui: { notify: (message: string, level: string) => {
      h.notifications.push({ message, level });
      if (level === "warning") h.warnings.push(message);
    } },
    sessionManager: { getSessionId: () => "lifecycle-test" },
  };
}

function getHandler(h: Harness, name: string): Handler {
  const handler = h.handlers.get(name);
  if (!handler) throw new Error(`${name} handler not registered`);
  return handler;
}

async function toolCall(h: Harness, toolName: string, path: string, context: AnyRecord = ctx(h), toolCallId = `${toolName}-${path}`): Promise<unknown> {
  return getHandler(h, "tool_call")(
    { type: "tool_call", toolCallId, toolName, input: { path, content: "x" } },
    context,
  );
}

async function start(h: Harness, contextFiles: string[] = []): Promise<AnyRecord | undefined> {
  return (await getHandler(h, "before_agent_start")(
    {
      type: "before_agent_start",
      prompt: "go",
      systemPrompt: "",
      systemPromptOptions: { cwd: h.root, contextFiles: contextFiles.map((path) => ({ path })), skills: [] },
    },
    ctx(h),
  )) as AnyRecord | undefined;
}

async function deliver(h: Harness, message: AnyRecord): Promise<void> {
  await getHandler(h, "context")(
    { type: "context", messages: [{ role: "custom", ...message }] },
    ctx(h),
  );
}

async function toolResult(h: Harness, toolName: string, path: string, toolCallId: string, isError = false): Promise<void> {
  await getHandler(h, "tool_result")(
    { type: "tool_result", toolName, toolCallId, input: { path }, content: [], isError },
    ctx(h),
  );
}

async function deliverToolResult(h: Harness, toolCallId: string, isError = false): Promise<void> {
  await getHandler(h, "context")(
    { type: "context", messages: [{ role: "toolResult", toolName: "read", toolCallId, content: [], isError }] },
    ctx(h),
  );
}

function makeFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "context-kit-lifecycle-"));
  mkdirSync(join(root, "sub"), { recursive: true });
  mkdirSync(join(root, ".claude", "rules"), { recursive: true });
  writeFileSync(join(root, "sub", "AGENTS.md"), "sub instructions");
  writeFileSync(join(root, "sub", "AGENTS.local.md"), "personal sub instructions");
  writeFileSync(join(root, ".claude", "rules", "go.md"), "---\npaths:\n  - '**/*.go'\n---\nGo instructions");
  return root;
}

test("read discovers nested files and matching rules in the same run", async () => {
  const root = makeFixture();
  try {
    const h = createHarness(root);
    await start(h);

    assert.equal(await toolCall(h, "read", "sub/example.go"), undefined);
    assert.equal(h.sent.length, 1);

    const message = h.sent[0] as { customType: string; content: string; display: boolean; details: { paths: string[] } };
    assert.equal(message.customType, "context-kit-discovery");
    assert.equal(message.display, true);
    assert.deepEqual(h.sentOptions[0], { deliverAs: "steer" });
    assert.deepEqual(message.details.paths, [
      join(root, "sub", "AGENTS.md"),
      join(root, "sub", "AGENTS.local.md"),
      join(root, ".claude", "rules", "go.md"),
    ]);
    assert.ok(message.content.includes("sub instructions"));
    assert.ok(message.content.includes("personal sub instructions"));
    assert.ok(message.content.includes("Go instructions"));
    const renderer = h.renderers.get("context-kit-discovery");
    assert.ok(renderer, "discovery renderer must be registered");
    const rendered = renderer(message, {}, { fg: (_color: string, text: string) => text }).render(120).map((line) => line.trimEnd());
    assert.deepEqual(rendered, [
      "✓ context-kit loaded:",
      "  ├─ [AGENTS.md] sub/AGENTS.md",
      "  ├─ [AGENTS.local.md] sub/AGENTS.local.md",
      "  └─ [Claude rule] .claude/rules/go.md",
    ]);
    assert.ok(!rendered.join("\n").includes("sub instructions"));
    assert.ok(!rendered.join("\n").includes("personal sub instructions"));
    assert.ok(!rendered.join("\n").includes("Go instructions"));

    await deliver(h, message);
    assert.equal(await toolCall(h, "read", "sub/another.go"), undefined);
    assert.equal(h.sent.length, 1, "confirmed files must not be injected again");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("mutations block until delivery and parallel calls share one announcement", async () => {
  const root = makeFixture();
  try {
    const h = createHarness(root);
    await start(h);

    const first = (await toolCall(h, "edit", "sub/example.go")) as { block: boolean; reason: string };
    assert.equal(first.block, true);
    const status = h.commands.get("context-kit");
    assert.ok(status, "status command must be registered");
    await status("status", ctx(h, true));
    assert.match(h.notifications.at(-1)?.message ?? "", /Blocked mutations: 1/);

    const second = (await toolCall(h, "write", "sub/other.go")) as { block: boolean; reason: string };
    assert.equal(second.block, true);
    for (const result of [first, second]) {
      assert.ok(result.reason.includes(join(root, "sub", "AGENTS.md")));
      assert.ok(result.reason.includes(join(root, ".claude", "rules", "go.md")));
      assert.match(result.reason, /Retry the same call/);
    }
    assert.equal(h.sent.length, 1);

    const message = h.sent[0] as AnyRecord;
    await deliver(h, message);
    assert.equal(await toolCall(h, "edit", "sub/example.go"), undefined);
    assert.equal(h.sent.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a new run re-announces a steer message that was not delivered", async () => {
  const root = makeFixture();
  try {
    const h = createHarness(root);
    await start(h);

    await toolCall(h, "read", "sub/example.go");
    assert.equal(h.sent.length, 1);
    await start(h);
    await toolCall(h, "read", "sub/example.go");

    assert.equal(h.sent.length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("large context files are truncated on a UTF-8 boundary", async () => {
  const root = mkdtempSync(join(tmpdir(), "context-kit-large-"));
  try {
    const sub = join(root, "sub");
    mkdirSync(sub);
    const agents = join(sub, "AGENTS.md");
    writeFileSync(agents, `${"a".repeat(24 * 1024 - 2)}🌍${"z".repeat(6 * 1024)}`);
    const h = createHarness(root);
    await start(h);

    const blocked = await toolCall(h, "edit", "sub/example.go") as { block: boolean };
    assert.equal(blocked.block, true);
    const message = h.sent[0] as { content: string; details: { paths: string[] } };
    assert.deepEqual(message.details.paths, [agents]);
    const block = message.content.split(`## ${agents}\n\n`)[1]?.trimEnd() ?? "";
    assert.ok(block.endsWith("[truncated: file exceeds the per-file size limit]"));
    assert.ok(Buffer.byteLength(block, "utf8") <= 24 * 1024);
    assert.ok(!block.includes("\uFFFD"), "truncation must not split a UTF-8 character");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("batch overflow lists skipped paths and keeps them blocking", async () => {
  const root = mkdtempSync(join(tmpdir(), "context-kit-batch-"));
  try {
    const directories = ["one", "two", "three", "four", "five", "six"];
    const sizes = [24, 24, 24, 20, 8, 2];
    let target = root;
    const agents: string[] = [];
    for (const [index, directory] of directories.entries()) {
      target = join(target, directory);
      mkdirSync(target);
      const path = join(target, "AGENTS.md");
      writeFileSync(path, "x".repeat((sizes[index] ?? 0) * 1024));
      agents.push(path);
    }
    const h = createHarness(root);
    await start(h);

    const blocked = await toolCall(h, "edit", `${directories.join("/")}/example.go`) as { block: boolean; reason: string };
    assert.equal(blocked.block, true);
    const firstMessage = h.sent[0] as { content: string; details: { paths: string[] } };
    assert.deepEqual(firstMessage.details.paths, [...agents.slice(0, 4), agents[5]]);
    assert.ok(firstMessage.content.includes(agents[4] ?? ""));
    assert.ok(firstMessage.content.indexOf(agents[4] ?? "") < firstMessage.content.indexOf(`## ${agents[0]}`));
    assert.ok(blocked.reason.includes(agents[4] ?? ""));

    await deliver(h, firstMessage);
    const retry = await toolCall(h, "edit", `${directories.join("/")}/example.go`) as { block: boolean };
    assert.equal(retry.block, true);
    assert.equal(h.sent.length, 2);
    assert.deepEqual((h.sent[1] as { details: { paths: string[] } }).details.paths, [agents[4]]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("unreadable applicable files warn and do not block mutations", async () => {
  const root = mkdtempSync(join(tmpdir(), "context-kit-unreadable-"));
  try {
    const sub = join(root, "sub");
    mkdirSync(sub);
    mkdirSync(join(root, ".pi"));
    const agents = join(sub, "AGENTS.md");
    const local = join(sub, "AGENTS.local.md");
    writeFileSync(agents, "shared instructions");
    writeFileSync(local, "personal instructions");
    writeFileSync(join(root, ".pi", "agentsignore"), "sub/AGENTS.md\n");
    chmodSync(local, 0);
    const h = createHarness(root);
    await start(h);

    const result = await toolCall(h, "edit", "sub/example.go", ctx(h, true));
    assert.equal(result, undefined);
    assert.equal(h.sent.length, 0);
    assert.ok(h.warnings.some((warning) => warning.includes(local)));
  } finally {
    chmodSync(join(root, "sub", "AGENTS.local.md"), 0o600);
    rmSync(root, { recursive: true, force: true });
  }
});

test("discovery exceptions warn and fail open", async () => {
  const root = makeFixture();
  try {
    const h = createHarness(root);
    await start(h);
    const brokenContext = ctx(h, true);
    Object.defineProperty(brokenContext, "cwd", { get: () => { throw new Error("injected discovery fault"); } });

    assert.equal(await toolCall(h, "edit", "sub/example.go", brokenContext), undefined);
    assert.equal(h.sent.length, 0);
    assert.ok(h.warnings.some((warning) => warning.includes("injected discovery fault")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("directly read rules count as delivered after their result reaches context", async () => {
  const root = makeFixture();
  const rule = join(root, ".claude", "rules", "go.md");
  try {
    const h = createHarness(root);
    await start(h);

    const callId = "direct-rule-read";
    assert.equal(await toolCall(h, "read", ".claude/rules/go.md", ctx(h), callId), undefined);
    await toolResult(h, "read", rule, callId);
    await deliverToolResult(h, callId);

    const result = await toolCall(h, "edit", "sub/example.go") as { block: boolean; reason: string };
    assert.equal(result.block, true, "other applicable files can still block the mutation");
    assert.ok(!result.reason.includes(rule), "the directly read rule must not block the mutation");
    assert.ok(!h.sent.some((message) => (message.details as { paths: string[] }).paths.includes(rule)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("direct results suppress reinjection but keep mutations blocked until context confirmation", async () => {
  const root = makeFixture();
  const rule = join(root, ".claude", "rules", "go.md");
  try {
    const h = createHarness(root);
    await start(h);

    await toolCall(h, "read", ".claude/rules/go.md", ctx(h), "unconfirmed-rule-read");
    await toolResult(h, "read", rule, "unconfirmed-rule-read");
    const result = await toolCall(h, "edit", "sub/example.go") as { block: boolean; reason: string };

    assert.equal(result.block, true);
    assert.ok(result.reason.includes(rule), "the in-flight direct result must keep its path blocking");
    assert.ok(!h.sent.some((message) => (message.details as { paths: string[] }).paths.includes(rule)));

    await deliverToolResult(h, "unconfirmed-rule-read");
    const confirmed = await toolCall(h, "edit", "sub/example.go") as { block: boolean; reason: string };
    assert.equal(confirmed.block, true);
    assert.ok(!confirmed.reason.includes(rule));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("failed direct reads leave context files eligible for injection", async () => {
  const root = makeFixture();
  const rule = join(root, ".claude", "rules", "go.md");
  try {
    const h = createHarness(root);
    await start(h);

    await toolCall(h, "read", ".claude/rules/go.md", ctx(h), "failed-rule-read");
    await toolResult(h, "read", rule, "failed-rule-read", true);
    await deliverToolResult(h, "failed-rule-read", true);

    await toolCall(h, "edit", "sub/example.go");
    assert.ok(h.sent.some((message) => (message.details as { paths: string[] }).paths.includes(rule)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("direct reads, edits, and writes of nested instruction files count as delivery", async () => {
  const root = mkdtempSync(join(tmpdir(), "context-kit-direct-"));
  try {
    const h = createHarness(root);
    await start(h);

    for (const toolName of ["read", "edit", "write"]) {
      const directory = join(root, toolName);
      mkdirSync(directory);
      const agents = join(directory, "AGENTS.md");
      writeFileSync(agents, `${toolName} instructions`);
      const relativeAgents = `${toolName}/AGENTS.md`;
      const callId = `direct-${toolName}`;

      assert.equal(await toolCall(h, toolName, relativeAgents, ctx(h), callId), undefined);
      assert.ok(!h.sent.some((message) => (message.details as { paths: string[] }).paths.includes(agents)));
      await toolResult(h, toolName, agents, callId);
      await deliverToolResult(h, callId);

      assert.equal(await toolCall(h, "edit", `${toolName}/example.go`), undefined);
      assert.ok(!h.sent.some((message) => (message.details as { paths: string[] }).paths.includes(agents)));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("startup local sibling is delivered and does not block later mutations", async () => {
  const root = mkdtempSync(join(tmpdir(), "context-kit-startup-"));
  try {
    const agents = join(root, "AGENTS.md");
    const local = join(root, "AGENTS.local.md");
    writeFileSync(agents, "shared instructions");
    writeFileSync(local, "personal instructions");
    const h = createHarness(root);

    const startupMessage = await start(h, [agents]);
    assert.ok(startupMessage?.message);
    const message = startupMessage.message as AnyRecord;
    assert.equal(message.customType, "context-kit-discovery");
    assert.deepEqual(message.details, { paths: [local], cwd: root });
    await deliver(h, message);

    assert.equal(await toolCall(h, "edit", "example.go"), undefined);
    assert.equal(await start(h, [agents]), undefined);
    assert.equal(h.sent.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
