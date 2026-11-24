import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parseTags, resolveScanRoot, scanSessions, tagsFromBranch } from "./session-tags.ts";

process.env.TZ = "UTC";

const tagEntry = (id, tags) => ({
  type: "custom",
  id,
  parentId: null,
  timestamp: "2026-01-01T00:00:00.000Z",
  customType: "pi.session-tags",
  data: { tags },
});

async function writeSession(dir, { timestamp, cwd = "/repo", name, tags = [], userMessages = [], corruptLine, header, sessionId = "session-id" } = {}) {
  const fileId = `${timestamp}-${tags.length}-${userMessages.length}-${Math.random().toString(36).slice(2, 6)}`.replace(/[^\w-]/g, "_");
  const file = join(dir, `${fileId}.jsonl`);
  const lines = [header ?? JSON.stringify({ type: "session", version: 3, id: sessionId, timestamp, cwd })];
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
  register({
    registerTool: (tool) => tools.set(tool.name, tool),
    registerCommand: (name, options) => commands.set(name, options),
    on: (event, handler) => handlers.set(event, handler),
    appendEntry: (customType, data) => entries.push({ customType, data }),
  });
  return { tools, commands, handlers, entries };
}

async function startSession(ext, root, tags = []) {
  await ext.handlers.get("session_start")(
    { type: "session_start", reason: "resume" },
    {
      sessionManager: {
        getEntries: () => (tags.length === 0 ? [] : [tagEntry("current", tags)]),
        getSessionDir: () => root,
        usesDefaultSessionDir: () => false,
      },
    },
  );
}

test("parseTags, tagsFromBranch, and resolveScanRoot enforce tag and layout contracts", () => {
  assert.deepEqual(parseTags(" Cla ,  controllers, cla "), { tags: ["cla", "controllers"], invalid: [] });
  assert.deepEqual(parseTags("cla, con&trollers, 9x, -leading, cla"), { tags: ["cla", "9x"], invalid: ["con&trollers", "-leading"] });
  assert.deepEqual(parseTags(" , , "), { tags: [], invalid: [] });

  assert.deepEqual(tagsFromBranch([tagEntry("a", ["cla"]), tagEntry("b", ["cla", "controllers"])]), ["cla", "controllers"]);
  assert.deepEqual(tagsFromBranch([tagEntry("a", ["cla"]), tagEntry("b", [])]), []);
  assert.deepEqual(tagsFromBranch([]), []);

  assert.equal(resolveScanRoot("/home/u/.pi/agent/sessions/my-slug", true), "/home/u/.pi/agent/sessions");
  assert.equal(resolveScanRoot("/custom/flat-sessions", false), "/custom/flat-sessions");
});

test("scanSessions keeps last tag entry, orders newest first, handles names/truncation, and skips corrupt or untagged files", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-session-tags-"));
  try {
    await mkdir(join(root, "slug-a"), { recursive: true });
    const newest = await writeSession(join(root, "slug-a"), {
      timestamp: "2026-01-03T10:00:00.000Z",
      name: "Renovate follow-up",
      tags: [["cla"], ["cla", "controllers"]],
    });
    const longMsg = "how do we structure the cla controller ".repeat(4);
    const older = await writeSession(join(root, "slug-a"), {
      timestamp: "2026-01-02T10:00:00.000Z",
      userMessages: [longMsg],
      tags: [["controllers"]],
    });
    await writeSession(join(root, "slug-a"), { timestamp: "2026-01-01T10:00:00.000Z", tags: [["cla"], []] });
    await writeSession(join(root, "slug-a"), { timestamp: "2026-01-01T09:00:00.000Z", userMessages: ["untagged"] });
    await writeSession(join(root, "slug-a"), { timestamp: "2026-01-04T10:00:00.000Z", tags: [["a"]], corruptLine: "{not json" });

    const { sessions, skipped, total } = await scanSessions(root);
    assert.equal(total, 5);
    assert.equal(skipped, 1);
    assert.deepEqual(sessions.map((s) => s.file), [newest, older]);
    assert.equal(sessions[0].name, "Renovate follow-up");
    assert.ok(sessions[1].name.startsWith('(no name) "') && sessions[1].name.endsWith('…"') && sessions[1].name.length <= 112);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("search_sessions_by_tags filters by all tags, caps at 50, and rejects empty input", async () => {
  const { tools } = await loadExtension();
  const tool = tools.get("search_sessions_by_tags");
  assert.equal(tool.exposure, "deferred");
  await assert.rejects(
    tool.execute("c0", { tags: [] }, undefined, undefined, { sessionManager: { getSessionDir: () => "/none", usesDefaultSessionDir: () => false } }),
  );

  const root = await mkdtemp(join(tmpdir(), "pi-session-tags-tool-"));
  try {
    await mkdir(join(root, "slug-a"), { recursive: true });
    for (let i = 0; i < 55; i++) {
      await writeSession(join(root, "slug-a"), {
        timestamp: new Date(Date.UTC(2026, 0, i + 1, 10, 0, 0)).toISOString(),
        tags: [i === 0 ? ["shared"] : ["shared", "extra"]],
        userMessages: [`session ${i}`],
      });
    }
    const res = await tool.execute("c1", { tags: ["shared", "extra"] }, undefined, undefined, {
      sessionManager: { getSessionDir: () => join(root, "slug-a"), usesDefaultSessionDir: () => true },
    });
    assert.equal(res.structuredContent.sessions.length, 50);
    assert.equal(res.structuredContent.truncated, true);
    assert.equal(res.details.matched, 54);
    assert.match(res.content[0].text, /\(truncated: showing 50 of 54 sessions\)/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("session-tags does not inject per-turn before_agent_start messages", async () => {
  const { handlers } = await loadExtension();
  assert.equal(handlers.has("before_agent_start"), false);
});

test("/tag vocabulary scan is lazy and does not read session files during session_start", async () => {
  const ext = await loadExtension();
  const root = await mkdtemp(join(tmpdir(), "pi-session-tags-lazy-"));
  try {
    await startSession(ext, root);
    // Write a tagged session AFTER session_start; a lazy scan will discover it on first completion.
    await writeSession(root, { timestamp: "2026-01-05T10:00:00.000Z", tags: [["lazy-tag"]] });
    const items = await ext.commands.get("tag").getArgumentCompletions("lazy");
    assert.deepEqual(items.map((i) => i.label), ["lazy-tag"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("/tag validates, prefills, clears, skips unchanged resubmissions, and /tags formats groups", async () => {
  const ext = await loadExtension();
  await startSession(ext, "/dev/null", ["cla", "controllers"]);

  let prefill;
  const notifications = [];
  const ui = {
    editor: async (_t, v) => { prefill = v; return "cla, controllers"; },
    notify: (message, type) => notifications.push({ message, type }),
  };
  await ext.commands.get("tag").handler("", { ui });
  assert.equal(prefill, "cla, controllers");
  assert.deepEqual(ext.entries, []);

  await ext.commands.get("tag").handler("cla, bad&tag", { ui });
  assert.deepEqual(ext.entries, []);
  assert.equal(notifications.at(-1).type, "error");

  await ext.commands.get("tag").handler("Cla, newtag", { ui });
  assert.deepEqual(ext.entries, [{ customType: "pi.session-tags", data: { tags: ["cla", "newtag"] } }]);

  await ext.commands.get("tag").handler("", { ui: { editor: async () => "", notify: () => {} } });
  assert.deepEqual(ext.entries.at(-1), { customType: "pi.session-tags", data: { tags: [] } });

  const root = await mkdtemp(join(tmpdir(), "pi-session-tags-list-"));
  try {
    await writeSession(root, { timestamp: "2026-01-02T10:00:00.000Z", name: "Named", tags: [["cla"]], sessionId: "id-1" });
    await writeSession(root, { timestamp: "2026-01-01T10:00:00.000Z", userMessages: ["untagged"] });
    let output;
    await ext.commands.get("tags").handler("", {
      ui: { notify: (m) => { output = m; } },
      sessionManager: { getSessionDir: () => root, usesDefaultSessionDir: () => false },
    });
    assert.match(output, /Tags across 2 sessions \(1 tagged\):/);
    assert.match(output, /cla \(1\)\n  2026-01-02 10:00  Named\n    id-1/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("/tag completions rank by count, preserve comma prefixes, cap at 20, and update live", async () => {
  const ext = await loadExtension();
  assert.equal(await ext.commands.get("tag").getArgumentCompletions("cla"), null);

  const root = await mkdtemp(join(tmpdir(), "pi-session-tags-comp-"));
  try {
    await writeSession(root, { timestamp: "2026-01-01T10:00:00.000Z", tags: [["controllers"]] });
    await writeSession(root, { timestamp: "2026-01-02T10:00:00.000Z", tags: [["controllers"]] });
    await writeSession(root, { timestamp: "2026-01-03T10:00:00.000Z", tags: [["cla"]] });
    await writeSession(root, { timestamp: "2026-01-04T10:00:00.000Z", tags: [["cost"]] });
    await startSession(ext, root);

    assert.deepEqual(
      (await ext.commands.get("tag").getArgumentCompletions("co")).map((i) => ({ label: i.label, description: i.description })),
      [{ label: "controllers", description: "2 sessions" }, { label: "cost", description: "1 session" }],
    );
    const multi = await ext.commands.get("tag").getArgumentCompletions("cla, co");
    assert.deepEqual(multi.map((i) => i.value), ["cla, controllers", "cla, cost"]);
    assert.equal(await ext.commands.get("tag").getArgumentCompletions("zzz"), null);

    await ext.commands.get("tag").handler("newtag", { ui: { notify: () => {} } });
    assert.deepEqual((await ext.commands.get("tag").getArgumentCompletions("new")).map((i) => i.label), ["newtag"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
