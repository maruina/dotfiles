import { strict as assert } from "node:assert";
import test from "node:test";
import register from "./index.ts";

test("registers /context-kit status and reports empty session state", async () => {
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
  assert.match(notifications[0]?.text ?? "", /Injected: 0 message\(s\), 0 file\(s\), 0 B/);
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
