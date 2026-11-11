import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import implementCoordinator from "./index.ts";

type CommandOptions = Parameters<ExtensionAPI["registerCommand"]>[1];
type EventHandler = (...args: unknown[]) => unknown;

function createExtension() {
  const commands = new Map<string, CommandOptions>();
  const events = new Map<string, EventHandler>();
  const shortcuts = new Map<string, { handler: (ctx: unknown) => unknown }>();
  const entries: Array<{ customType: string; data: { summary: string; level: string } }> = [];
  const pi = {
    on: (event: string, handler: EventHandler) => {
      events.set(event, handler);
      return () => undefined;
    },
    registerCommand: (name: string, options: CommandOptions) => commands.set(name, options),
    registerShortcut: (key: string, options: { handler: (ctx: unknown) => unknown }) => shortcuts.set(key, options),
    registerEntryRenderer: () => undefined,
    appendEntry: (customType: string, data: { summary: string; level: string }) => entries.push({ customType, data }),
    sendUserMessage: () => undefined,
  } as unknown as ExtensionAPI;
  implementCoordinator(pi);
  return { commands, events, shortcuts, entries };
}

function git(root: string, args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

function createRepo(): { root: string; planPath: string; tempRoot: string } {
  const tempRoot = mkdtempSync(join(tmpdir(), "implement-command-"));
  const root = join(tempRoot, "repo");
  const planPath = join(root, "plans", "fixture", "plan.md");
  mkdirSync(join(root, "plans", "fixture"), { recursive: true });
  writeFileSync(planPath, "# Plan\n\n### Task 1: Command guard\n- [ ] Keep the coordinator input guard active.\n");
  git(root, ["init", "--quiet", "--initial-branch=trunk"]);
  git(root, ["config", "user.name", "Implement command test"]);
  git(root, ["config", "user.email", "implement-command@example.invalid"]);
  git(root, ["config", "commit.gpgsign", "false"]);
  git(root, ["remote", "add", "origin", "https://example.invalid/repo.git"]);
  git(root, ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/trunk"]);
  git(root, ["add", "plans/fixture/plan.md"]);
  git(root, ["commit", "--quiet", "-m", "fixture baseline"]);
  git(root, ["switch", "--quiet", "-c", "feature"]);
  return { root, planPath, tempRoot };
}

const CHILD_CONFIG_ENV = "PI_LIFECYCLE_CHILD_CONFIG";

describe("/implement extension command", () => {
  it("registers /implement without a /ship alias and refuses child-stage dispatch", async () => {
    const previousConfig = process.env[CHILD_CONFIG_ENV];
    process.env[CHILD_CONFIG_ENV] = "/tmp/stage.json";
    const { commands } = createExtension();
    const notices: string[] = [];
    try {
      assert.deepEqual([...commands.keys()], ["implement"]);
      await commands.get("implement")!.handler("plans/fixture/plan.md", {
        ui: { notify: (message: string) => notices.push(message) },
      } as unknown as ExtensionCommandContext);
      assert.match(notices[0] ?? "", /nested lifecycle orchestration is disabled in a child stage/);
    } finally {
      if (previousConfig === undefined) delete process.env[CHILD_CONFIG_ENV];
      else process.env[CHILD_CONFIG_ENV] = previousConfig;
    }
  });

  it("requires an interactive UI before doing lifecycle preflight", async () => {
    const previousConfig = process.env[CHILD_CONFIG_ENV];
    delete process.env[CHILD_CONFIG_ENV];
    const { commands } = createExtension();
    const notices: string[] = [];
    try {
      await commands.get("implement")!.handler("not-a-plan", {
        hasUI: false,
        ui: { notify: (message: string) => notices.push(message) },
      } as unknown as ExtensionCommandContext);
      assert.match(notices[0] ?? "", /requires an interactive UI/);
    } finally {
      if (previousConfig === undefined) delete process.env[CHILD_CONFIG_ENV];
      else process.env[CHILD_CONFIG_ENV] = previousConfig;
    }
  });

  for (const stopWith of ["cancel shortcut", "session shutdown"] as const) it(`blocks concurrent input and nested dispatch while model selection is active, then stops on ${stopWith}`, async () => {
    const fixture = createRepo();
    const previousConfig = process.env[CHILD_CONFIG_ENV];
    delete process.env[CHILD_CONFIG_ENV];
    let resolveSelection!: (selection: string | undefined) => void;
    let selectionStarted = false;
    const notices: string[] = [];
    const models = [
      { provider: "fixture", id: "writer", name: "Writer" },
      { provider: "fixture", id: "verifier", name: "Verifier" },
    ];
    const registry = {
      getAvailable: () => models,
      find: (provider: string, id: string) => models.find((model) => model.provider === provider && model.id === id),
      hasConfiguredAuth: () => true,
    };
    const context = {
      hasUI: true,
      mode: "tui",
      cwd: fixture.root,
      model: models[0],
      modelRegistry: registry,
      scopedModels: [],
      thinkingLevel: "minimal",
      signal: new AbortController().signal,
      sessionManager: { getSessionId: () => "coordinator-session" },
      ui: {
        select: () => {
          selectionStarted = true;
          return new Promise<string | undefined>((resolve) => {
            resolveSelection = resolve;
          });
        },
        confirm: async () => true,
        notify: (message: string) => notices.push(message),
        setStatus: () => undefined,
        setWidget: () => undefined,
        setEditorText: () => undefined,
      },
    } as unknown as ExtensionCommandContext;
    const { commands, events, shortcuts, entries } = createExtension();
    const command = commands.get("implement")!;
    let activeRun: Promise<void> | undefined;
    try {
      activeRun = command.handler(fixture.planPath, context);
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.equal(selectionStarted, true);

      await command.handler(fixture.planPath, context);
      assert.match(notices[0] ?? "", /another lifecycle run is already active/);

      const inputResult = await events.get("input")!({ input: "Please continue" }, context);
      assert.deepEqual(inputResult, { action: "handled" });
      assert.match(notices.at(-1) ?? "", /owns this session.*Ctrl\+Shift\+X/);

      assert.equal(entries.length, 0, "the run is still active after the command handler returned");
      if (stopWith === "cancel shortcut") {
        await shortcuts.get("ctrl+shift+x")!.handler(context);
        assert.match(notices.find((notice) => /Cancelling the active \/implement run/.test(notice)) ?? "", /Cancelling/);
        for (let wait = 0; wait < 50 && entries.length === 0; wait++) await new Promise<void>((resolve) => setTimeout(resolve, 10));
      } else {
        await events.get("session_shutdown")!({});
      }
      assert.equal(entries.length, 1, "the run ends with one summary entry");
      assert.equal(entries[0]!.customType, "implement-summary");
      assert.match(entries[0]!.data.summary, /cancelled/i);
      const afterStop = notices.length;
      await command.handler(fixture.planPath, { ...context, ui: { ...context.ui, select: async () => undefined } } as unknown as ExtensionCommandContext);
      assert.doesNotMatch(notices.slice(afterStop).join("\n"), /already active/, "a stopped run must release the session");
    } finally {
      resolveSelection?.(undefined);
      if (activeRun) await activeRun;
      await events.get("session_shutdown")!({});
      rmSync(fixture.tempRoot, { recursive: true, force: true });
      if (previousConfig === undefined) delete process.env[CHILD_CONFIG_ENV];
      else process.env[CHILD_CONFIG_ENV] = previousConfig;
    }
  });
});
