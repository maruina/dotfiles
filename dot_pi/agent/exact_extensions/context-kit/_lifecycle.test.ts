import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import register from "./index.ts";

const usageDir = mkdtempSync(join(tmpdir(), "context-kit-lifecycle-usage-"));
process.env.PI_CONTEXT_KIT_USAGE_DIR = usageDir;
after(() => {
  delete process.env.PI_CONTEXT_KIT_USAGE_DIR;
  rmSync(usageDir, { recursive: true, force: true });
});

type AnyRecord = Record<string, unknown>;
type Handler = (event: AnyRecord, ctx: AnyRecord) => unknown;
type Harness = {
  handlers: Map<string, Handler>;
  sent: AnyRecord[];
  sentOptions: (AnyRecord | undefined)[];
  appended: AnyRecord[];
  root: string;
};

function createHarness(root: string): Harness {
  const harness: Harness = {
    handlers: new Map(),
    sent: [],
    sentOptions: [],
    appended: [],
    root,
  };
  register({
    on: (name: string, handler: Handler) => harness.handlers.set(name, handler),
    registerCommand() {},
    sendMessage: (message: AnyRecord, options?: AnyRecord) => {
      harness.sent.push(message);
      harness.sentOptions.push(options);
    },
    appendEntry: (customType: string, data: unknown) => harness.appended.push({ customType, data }),
    events: { emit() {} },
  } as never);
  return harness;
}

function ctx(h: Harness): AnyRecord {
  return {
    cwd: h.root,
    hasUI: false,
    ui: { notify() {} },
    sessionManager: { getSessionId: () => "lifecycle-test" },
  };
}

function getHandler(h: Harness, name: string): Handler {
  const handler = h.handlers.get(name);
  if (!handler) throw new Error(`${name} handler not registered`);
  return handler;
}

async function toolCall(h: Harness, toolName: string, path: string): Promise<unknown> {
  return getHandler(h, "tool_call")(
    { type: "tool_call", toolCallId: `${toolName}-${path}`, toolName, input: { path, content: "x" } },
    ctx(h),
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
    assert.equal(message.display, false);
    assert.deepEqual(h.sentOptions[0], { deliverAs: "steer" });
    assert.deepEqual(message.details.paths, [
      join(root, "sub", "AGENTS.md"),
      join(root, "sub", "AGENTS.local.md"),
      join(root, ".claude", "rules", "go.md"),
    ]);
    assert.ok(message.content.includes("sub instructions"));
    assert.ok(message.content.includes("personal sub instructions"));
    assert.ok(message.content.includes("Go instructions"));

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
    const second = (await toolCall(h, "write", "sub/other.go")) as { block: boolean; reason: string };
    assert.equal(first.block, true);
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
    assert.deepEqual(message.details, { paths: [local] });
    await deliver(h, message);

    assert.equal(await toolCall(h, "edit", "example.go"), undefined);
    assert.equal(await start(h, [agents]), undefined);
    assert.equal(h.sent.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
