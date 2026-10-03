import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parseTags, resolveScanRoot, scanSessions, tagsFromBranch } from "./session-tags.ts";

// Deterministic date formatting: session header timestamps are UTC ISO strings,
// and the scan renders them in the local timezone.
process.env.TZ = "UTC";

function tagEntry(id, tags) {
  return {
    type: "custom",
    id,
    parentId: null,
    timestamp: "2026-01-01T00:00:00.000Z",
    customType: "pi.session-tags",
    data: { tags },
  };
}

function messageEntry(id, text, timestamp) {
  return {
    type: "message",
    id,
    parentId: null,
    timestamp,
    message: { role: "user", content: text },
  };
}

function infoEntry(name, timestamp) {
  return {
    type: "session_info",
    id: "info",
    parentId: null,
    timestamp,
    name,
  };
}

async function writeSession(dir, { timestamp, cwd = "/repo", name, tags = [], userMessages = [], corruptLine, header, sessionId = "session-id" } = {}) {
  const fileId = `${timestamp}-${tags.length}-${userMessages.length}`.replace(/[^\w-]/g, "_");
  const file = join(dir, `${fileId}.jsonl`);
  const lines = [];
  lines.push(
    header ??
      JSON.stringify({ type: "session", version: 3, id: sessionId, timestamp, cwd }),
  );
  let parentId = sessionId;
  for (const [index, text] of userMessages.entries()) {
    const entryId = `m${index}`;
    lines.push(JSON.stringify({ type: "message", id: entryId, parentId, timestamp, message: { role: "user", content: text } }));
    parentId = entryId;
  }
  if (name !== undefined) lines.push(JSON.stringify({ type: "session_info", id: "info", parentId, timestamp, name }));
  for (const [index, tagSet] of tags.entries()) {
    const entryId = `t${index}`;
    lines.push(JSON.stringify({ type: "custom", id: entryId, parentId, timestamp, customType: "pi.session-tags", data: { tags: tagSet } }));
    parentId = entryId;
  }
  if (corruptLine !== undefined) lines.push(corruptLine);
  await writeFile(file, lines.join("\n") + "\n");
  return file;
}

async function loadExtension() {
  const { default: register } = await import("./session-tags.ts");
  const tools = new Map();
  const commands = new Map();
  const handlers = new Map();
  const entries = [];
  const notifications = [];
  register({
    registerTool: (tool) => tools.set(tool.name, tool),
    registerCommand: (name, options) => commands.set(name, options),
    on: (event, handler) => handlers.set(event, handler),
    appendEntry: (customType, data) => entries.push({ customType, data }),
  });
  return { tools, commands, handlers, entries, notifications };
}

function toolContext(sessionManager) {
  return { sessionManager, cwd: "/workspace" };
}

test("parseTags trims, lowercases, and deduplicates the valid tags", () => {
  const result = parseTags(" Cla ,  controllers, cla ");
  assert.deepEqual(result, { tags: ["cla", "controllers"], invalid: [] });
});

test("parseTags rejects tags outside [a-z0-9][a-z0-9-]* and lists them", () => {
  const result = parseTags("cla, con&trollers, 9x, -leading, cla");
  assert.deepEqual(result, { tags: ["cla", "9x"], invalid: ["con&trollers", "-leading"] });
});

test("parseTags treats an empty submission as clearing the set", () => {
  assert.deepEqual(parseTags(""), { tags: [], invalid: [] });
  assert.deepEqual(parseTags(" , , "), { tags: [], invalid: [] });
});

test("tagsFromBranch takes the last pi.session-tags entry on the branch", () => {
  const branch = [tagEntry("a", ["cla"]), messageEntry("m", "hello", "2026-01-01T00:00:00.000Z"), tagEntry("b", ["cla", "controllers"])];
  assert.deepEqual(tagsFromBranch(branch), ["cla", "controllers"]);
});

test("tagsFromBranch returns an empty set for an empty-tags entry (clears)", () => {
  const branch = [tagEntry("a", ["cla"]), tagEntry("b", [])];
  assert.deepEqual(tagsFromBranch(branch), []);
});

test("tagsFromBranch returns [] when the branch carries no tag entry", () => {
  assert.deepEqual(tagsFromBranch([messageEntry("m", "hello", "2026-01-01T00:00:00.000Z")]), []);
});

test("resolveScanRoot walks the whole sessions tree under the default layout", () => {
  assert.equal(resolveScanRoot("/home/u/.pi/agent/sessions/my-slug", true), "/home/u/.pi/agent/sessions");
});

test("resolveScanRoot uses the custom sessionDir itself", () => {
  assert.equal(resolveScanRoot("/custom/flat-sessions", false), "/custom/flat-sessions");
});

test("scanSessions takes the last tag entry in file order and skips untagged files", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-session-tags-"));
  try {
    await mkdir(join(root, "slug-a"), { recursive: true });
    const a = await writeSession(join(root, "slug-a"), {
      timestamp: "2026-01-03T10:00:00.000Z",
      tags: [["cla"], ["cla", "controllers"]],
    });
    const b = await writeSession(join(root, "slug-a"), { timestamp: "2026-01-02T10:00:00.000Z", tags: [["controllers"]] });
    await writeSession(join(root, "slug-a"), { timestamp: "2026-01-01T10:00:00.000Z", tags: [] });

    const { sessions, skipped, total } = await scanSessions(root);
    assert.equal(skipped, 0);
    assert.equal(total, 3);
    assert.deepEqual(
      sessions.map((s) => s.file),
      [a, b],
    );
    assert.deepEqual(sessions[0].tags, ["cla", "controllers"]);
    assert.deepEqual(sessions[1].tags, ["controllers"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("scanSessions treats an empty tag array at the end as clearing the set", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-session-tags-"));
  try {
    await writeSession(root, {
      timestamp: "2026-01-03T10:00:00.000Z",
      tags: [["cla"], []],
    });
    const { sessions, total } = await scanSessions(root);
    assert.equal(total, 1);
    assert.deepEqual(sessions, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("scanSessions returns sessions newest first by header timestamp", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-session-tags-"));
  try {
    await writeSession(root, { timestamp: "2026-01-01T10:00:00.000Z", tags: [["a"]] });
    await writeSession(root, { timestamp: "2026-01-03T10:00:00.000Z", tags: [["a"]] });
    await writeSession(root, { timestamp: "2026-01-02T10:00:00.000Z", tags: [["a"]] });
    const { sessions } = await scanSessions(root);
    assert.deepEqual(
      sessions.map((s) => s.date),
      ["2026-01-03 10:00", "2026-01-02 10:00", "2026-01-01 10:00"],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("scanSessions truncates a long first-user-message fallback to one line", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-session-tags-"));
  try {
    const longMessage = "how do we structure the cla controller package how do we structure the cla controller package how do we structure the cla controller package how do we structure the cla";
    assert.ok(longMessage.length > 100);
    const file = await writeSession(root, {
      timestamp: "2026-01-01T10:00:00.000Z",
      userMessages: [longMessage],
      tags: [["cla"]],
    });
    const { sessions } = await scanSessions(root);
    assert.equal(sessions.length, 1);
    const name = sessions[0].name;
    assert.ok(name.startsWith('(no name) "'));
    assert.ok(name.endsWith('…"'));
    // The message body is capped at 100 chars including the trailing ellipsis;
    // the `(no name) "` prefix and closing quote add 12 more.
    assert.ok(name.length <= 112, `name too long: ${name.length}`);
    assert.ok((await readFile(file, "utf8")).length > 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("scanSessions uses the latest session_info name and falls back to the first user message", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-session-tags-"));
  try {
    const named = await writeSession(root, {
      timestamp: "2026-01-02T10:00:00.000Z",
      name: "Renovate incident follow-up",
      userMessages: ["we discussed renovate"],
      tags: [["cla"]],
    });
    const unnamed = await writeSession(root, {
      timestamp: "2026-01-01T10:00:00.000Z",
      userMessages: ["how do we structure the cla controller\n  package?"],
      tags: [["cla"]],
    });
    const noMessage = await writeSession(root, { timestamp: "2026-01-03T10:00:00.000Z", tags: [["cla"]] });
    const { sessions } = await scanSessions(root);
    const byFile = new Map(sessions.map((s) => [s.file, s]));
    assert.equal(byFile.get(named).name, "Renovate incident follow-up");
    assert.equal(byFile.get(unnamed).name, '(no name) "how do we structure the cla controller package?"');
    assert.equal(byFile.get(noMessage).name, "(no name)");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("scanSessions skips and counts corrupt files instead of failing", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-session-tags-"));
  try {
    await writeSession(root, { timestamp: "2026-01-03T10:00:00.000Z", tags: [["a"]] });
    await writeSession(root, { timestamp: "2026-01-02T10:00:00.000Z", tags: [["a"]], corruptLine: "{not json" });
    await writeSession(root, { header: "not a header\n", timestamp: "2026-01-01T10:00:00.000Z", tags: [["a"]] });
    const { sessions, skipped, total } = await scanSessions(root);
    assert.equal(total, 3);
    assert.equal(skipped, 2);
    assert.equal(sessions.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the tool returns only sessions carrying all requested tags", async () => {
  const { tools } = await loadExtension();
  const root = await mkdtemp(join(tmpdir(), "pi-session-tags-"));
  try {
    await mkdir(join(root, "asking-slug"), { recursive: true });
    await mkdir(join(root, "worktree-slug"), { recursive: true });
    const claOnly = await writeSession(join(root, "worktree-slug"), {
      timestamp: "2026-01-03T10:00:00.000Z",
      tags: [["cla"]],
      userMessages: ["only cla"],
    });
    const both = await writeSession(join(root, "asking-slug"), {
      timestamp: "2026-01-02T10:00:00.000Z",
      tags: [["cla", "controllers"]],
      userMessages: ["both"],
    });
    await writeSession(join(root, "worktree-slug"), {
      timestamp: "2026-01-01T10:00:00.000Z",
      tags: [["controllers"]],
      userMessages: ["only controllers"],
    });
    const tool = tools.get("search_sessions_by_tags");
    assert.ok(tool);
    assert.equal(tool.exposure, "deferred");
    assert.ok(tool.outputSchema, "outputSchema must be declared");
    assert.ok(tool.parameters, "parameters must be declared");

    const result = await tool.execute(
      "call-1",
      { tags: ["cla", "controllers"] },
      undefined,
      undefined,
      toolContext({ getSessionDir: () => join(root, "asking-slug"), usesDefaultSessionDir: () => true }),
    );
    assert.equal(result.structuredContent.truncated, false);
    assert.deepEqual(
      result.structuredContent.sessions.map((s) => s.file),
      [both],
    );
    assert.deepEqual(result.structuredContent.sessions[0].tags, ["cla", "controllers"]);
    assert.equal(result.details.total, 3);
    assert.equal(result.details.matched, 1);
    assert.equal(result.details.skipped, 0);
    const text = result.content[0].text;
    assert.match(text, /2026-01-02 10:00  \(no name\) "both"  \[cla, controllers\]/);
    assert.ok(text.includes(claOnly) === false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the tool truncates at 50 sessions, reports skipped files, and marks truncation", async () => {
  const { tools } = await loadExtension();
  const root = await mkdtemp(join(tmpdir(), "pi-session-tags-"));
  try {
    for (let index = 0; index < 60; index++) {
      await writeSession(root, {
        timestamp: new Date(Date.UTC(2026, 0, index + 1, 10, 0, 0)).toISOString(),
        tags: [["shared"]],
        userMessages: [`session ${index + 1}`],
      });
    }
    await writeSession(root, { timestamp: "2026-04-01T10:00:00.000Z", tags: [["shared"]], corruptLine: "garbage" });
    const tool = tools.get("search_sessions_by_tags");
    const result = await tool.execute(
      "call-1",
      { tags: ["shared"] },
      undefined,
      undefined,
      toolContext({ getSessionDir: () => root, usesDefaultSessionDir: () => false }),
    );
    assert.equal(result.structuredContent.sessions.length, 50);
    assert.equal(result.structuredContent.truncated, true);
    assert.equal(result.details.total, 61);
    assert.equal(result.details.matched, 60);
    assert.equal(result.details.skipped, 1);
    assert.match(result.content[0].text, /\(truncated: showing 50 of 60 sessions\)/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the tool rejects an empty tags parameter", async () => {
  const { tools } = await loadExtension();
  const tool = tools.get("search_sessions_by_tags");
  await assert.rejects(
    tool.execute("call-1", { tags: [] }, undefined, undefined, toolContext({ getSessionDir: () => "/none", usesDefaultSessionDir: () => false })),
  );
});

test("before_agent_start tells the agent about tags and the search tool", async () => {
  const { handlers } = await loadExtension();
  const result = handlers.get("before_agent_start")({ type: "before_agent_start", prompt: "what did we decide in sessions tagged cla?" }, { cwd: "/workspace" });
  assert.equal(result.message.customType, "session-tags");
  assert.equal(result.message.display, false);
  assert.match(result.message.content, /search_sessions_by_tags/);
  assert.match(result.message.content, /tool_search/);
  assert.match(result.message.content, /\/tag/);
});

test("session_start reconstructs tags from the branch and /tag prefills the dialog", async () => {
  const { commands, handlers } = await loadExtension();
  await handlers.get("session_start")(
    { type: "session_start", reason: "resume" },
    { sessionManager: { getEntries: () => [tagEntry("a", ["cla", "controllers"])] } },
  );
  let prefill;
  const ui = {
    // The input dialog cannot be prefilled in pi 1.0.0; the editor dialog is
    // the prefill-capable one and /tag uses it.
    editor: async (_title, value) => {
      prefill = value;
      return "aaa";
    },
    notify: () => {},
  };
  await commands.get("tag").handler("", { ui });
  assert.equal(prefill, "cla, controllers");
});

test("/tag with arguments normalizes, appends a custom entry, and notifies", async () => {
  const { commands, entries } = await loadExtension();
  const ui = { input: async () => "", notify: () => {} };
  await commands.get("tag").handler("Cla, controllers, cla", { ui });
  assert.deepEqual(entries, [{ customType: "pi.session-tags", data: { tags: ["cla", "controllers"] } }]);
});

test("/tag with invalid arguments appends nothing and notifies an error listing them", async () => {
  const { commands, entries } = await loadExtension();
  const notifications = [];
  const ui = { input: async () => "", notify: (message, type) => notifications.push({ message, type }) };
  await commands.get("tag").handler("cla, con&trollers", { ui });
  assert.deepEqual(entries, []);
  assert.deepEqual(notifications, [{ message: "Invalid tags: con&trollers", type: "error" }]);
});

test("/tag dialog cancel resolves undefined and changes nothing", async () => {
  const { commands, entries } = await loadExtension();
  const ui = { editor: async () => undefined, notify: () => {} };
  await commands.get("tag").handler("", { ui });
  assert.deepEqual(entries, []);
});

test("/tag dialog empty submission clears the tags", async () => {
  const { commands, handlers, entries } = await loadExtension();
  await handlers.get("session_start")({ type: "session_start", reason: "resume" }, { sessionManager: { getEntries: () => [tagEntry("a", ["cla"])] } });
  const ui = { editor: async () => "", notify: () => {} };
  await commands.get("tag").handler("", { ui });
  assert.deepEqual(entries, [{ customType: "pi.session-tags", data: { tags: [] } }]);
});

test("/tag unchanged resubmission appends nothing", async () => {
  const { commands, handlers, entries } = await loadExtension();
  await handlers.get("session_start")({ type: "session_start", reason: "resume" }, { sessionManager: { getEntries: () => [tagEntry("a", ["cla", "controllers"])] } });
  const ui = { editor: async () => "cla, controllers", notify: () => {} };
  await commands.get("tag").handler("", { ui });
  assert.deepEqual(entries, []);
});

test("/tags prints the tagged sessions grouped by tag with counts and session ids", async () => {
  const { commands } = await loadExtension();
  const root = await mkdtemp(join(tmpdir(), "pi-session-tags-"));
  try {
    await writeSession(root, {
      timestamp: "2026-01-02T10:00:00.000Z",
      name: "Renovate incident follow-up",
      userMessages: ["renovate"],
      tags: [["cla"]],
      sessionId: "id-named",
    });
    await writeSession(root, {
      timestamp: "2026-01-03T10:00:00.000Z",
      userMessages: ["how do we structure the cla controller\npackage?"],
      tags: [["cla", "controllers"]],
      sessionId: "id-unnamed",
    });
    await writeSession(root, { timestamp: "2026-01-01T10:00:00.000Z", userMessages: ["untagged"] });
    let message;
    const ui = { input: async () => "", notify: (m) => { message = m; } };
    await commands.get("tags").handler("", {
      ui,
      sessionManager: { getSessionDir: () => root, usesDefaultSessionDir: () => false },
    });
    const expected = [
      "Tags across 3 sessions (2 tagged):",
      "",
      "cla (2)",
      "  2026-01-03 10:00  (no name) \"how do we structure the cla controller package?\"",
      "    id-unnamed",
      "  2026-01-02 10:00  Renovate incident follow-up",
      "    id-named",
      "",
      "controllers (1)",
      "  2026-01-03 10:00  (no name) \"how do we structure the cla controller package?\"",
      "    id-unnamed",
    ].join("\n");
    assert.equal(message, expected);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("/tags reports zero tagged sessions when the tree has none", async () => {
  const { commands } = await loadExtension();
  const root = await mkdtemp(join(tmpdir(), "pi-session-tags-"));
  try {
    await writeSession(root, { timestamp: "2026-01-01T10:00:00.000Z", userMessages: ["untagged"] });
    let message;
    const ui = { input: async () => "", notify: (m) => { message = m; } };
    await commands.get("tags").handler("", {
      sessionManager: { getSessionDir: () => root, usesDefaultSessionDir: () => false },
      ui,
    });
    assert.equal(message, "Tags across 1 session (0 tagged):");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});