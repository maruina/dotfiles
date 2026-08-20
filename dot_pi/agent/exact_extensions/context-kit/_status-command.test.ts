import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, beforeEach, test } from "node:test";
import register from "./index.ts";

// The status command loads the cross-session aggregate from a usage dir.
// Point it at an empty temp dir so the test never touches the real ~/.pi/agent
// and so the aggregate reports a clean empty store.
const usageDir = mkdtempSync(join(tmpdir(), "ck-cmd-usage-"));

beforeEach(() => {
  process.env.PI_CONTEXT_KIT_USAGE_DIR = usageDir;
});
afterEach(() => {
  delete process.env.PI_CONTEXT_KIT_USAGE_DIR;
});

test("registers /context-kit status and reports empty session + empty aggregate", async () => {
  const commands = new Map<string, { handler: (args: string, ctx: unknown) => Promise<void> }>();
  register({
    on() {},
    registerCommand(name: string, command: { handler: (args: string, ctx: unknown) => Promise<void> }) {
      commands.set(name, command);
    },
  } as never);

  const notifications: Array<{ text: string; level: string }> = [];
  await commands.get("context-kit")?.handler("status", {
    cwd: "/repo",
    ui: { notify: (text: string, level: string) => notifications.push({ text, level }) },
  });

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.level, "info");
  const text = notifications[0]?.text ?? "";
  // Current-session block.
  assert.match(text, /Context-kit status \(current session\)/);
  assert.match(text, /Injected: 0 message\(s\), 0 file\(s\), 0 B/);
  // Cross-session block.
  assert.match(text, /All sessions/);
  assert.match(text, /Recorded: 0 session\(s\), 0 used context-kit/);
});

test("rejects unsupported /context-kit actions", async () => {
  const commands = new Map<string, { handler: (args: string, ctx: unknown) => Promise<void> }>();
  register({
    on() {},
    registerCommand(name: string, command: { handler: (args: string, ctx: unknown) => Promise<void> }) {
      commands.set(name, command);
    },
  } as never);

  const notifications: Array<{ text: string; level: string }> = [];
  await commands.get("context-kit")?.handler("reset", {
    cwd: "/repo",
    ui: { notify: (text: string, level: string) => notifications.push({ text, level }) },
  });

  assert.deepEqual(notifications, [{ text: "Usage: /context-kit [status]", level: "error" }]);
});

after(() => {
  rmSync(usageDir, { recursive: true, force: true });
});
