import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  calculateDayWindow,
  collectSessionsWindow,
  searchSessions,
  sessionContext,
  selectLearningSections,
} from "./learn-evidence.mjs";

const script = fileURLToPath(new URL("./learn-evidence.mjs", import.meta.url));

function entry({ id, parentId = null, timestamp, role, content, type = "message", ...extra }) {
  if (type !== "message") return { type, id, parentId, timestamp, ...extra };
  return {
    type,
    id,
    parentId,
    timestamp,
    message: { role, content },
    ...extra,
  };
}

async function fixtureDirectory(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "learn-evidence-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function writeSession(directory, name, entries) {
  const sessionDir = path.join(directory, "sessions", "project");
  await mkdir(sessionDir, { recursive: true });
  const file = path.join(sessionDir, name);
  await writeFile(file, `${entries.map((item) => JSON.stringify(item)).join("\n")}\n`);
  return file;
}

function sessionHeader(id, timestamp = "2026-03-07T23:00:00.000Z") {
  return { type: "session", version: 3, id, timestamp, cwd: "/work/project" };
}

function runCli(args, { input = "" } = {}) {
  return new Promise((resolve) => {
    execFile(process.execPath, [script, ...args], { input }, (error, stdout, stderr) => {
      resolve({ status: error?.code ?? 0, stdout, stderr });
    });
  });
}

test("calculateDayWindow uses an inclusive local start and exclusive next-local-day end", () => {
  const window = calculateDayWindow("2026-03-08", "America/Los_Angeles");

  assert.deepEqual(window, {
    localDate: "2026-03-08",
    timezone: "America/Los_Angeles",
    startIso: "2026-03-08T08:00:00.000Z",
    endIso: "2026-03-09T07:00:00.000Z",
    searchStartDate: "2026-03-08",
    searchEndDate: "2026-03-09",
  });
});

test("sessions-window returns every in-window branch entry from sessions started earlier", async (t) => {
  const directory = await fixtureDirectory(t);
  const file = await writeSession(directory, "branched.jsonl", [
    sessionHeader("session-1"),
    entry({ id: "root", timestamp: "2026-03-07T23:59:00.000Z", role: "user", content: "before" }),
    entry({ id: "left", parentId: "root", timestamp: "2026-03-08T08:00:00.000Z", role: "assistant", content: "left branch" }),
    entry({ id: "right", parentId: "root", timestamp: "2026-03-08T12:00:00.000Z", role: "assistant", content: "right branch" }),
    entry({ id: "after", parentId: "right", timestamp: "2026-03-09T08:00:00.000Z", role: "assistant", content: "after" }),
  ]);

  const result = collectSessionsWindow({ sessionDir: path.join(directory, "sessions"), date: "2026-03-08", timezone: "UTC" });

  assert.equal(result.schemaVersion, 1);
  assert.equal(result.sources.total, 1);
  assert.equal(result.entries.total, 2);
  assert.deepEqual(result.entries.items.map((item) => item.id), ["left", "right"]);
  assert.ok(result.entries.items.every((item) => item.path === file));
  assert.deepEqual(result.entries.items.map((item) => item.parentId), ["root", "root"]);
  assert.deepEqual(result.entries.items.map((item) => item.role), ["assistant", "assistant"]);
  assert.equal(result.window.startIso, "2026-03-08T00:00:00.000Z");
  assert.equal(result.window.endIso, "2026-03-09T00:00:00.000Z");
});

test("sessions-window reports malformed files and stable unique entry identifiers", async (t) => {
  const directory = await fixtureDirectory(t);
  const sessions = path.join(directory, "sessions");
  await writeSession(directory, "valid.jsonl", [
    sessionHeader("valid"),
    entry({ id: "unique", timestamp: "2026-03-08T10:00:00.000Z", role: "user", content: "valid" }),
    entry({ id: "unique", timestamp: "2026-03-08T11:00:00.000Z", role: "assistant", content: "duplicate id" }),
  ]);
  await mkdir(path.join(sessions, "project"), { recursive: true });
  await writeFile(path.join(sessions, "project", "malformed.jsonl"), "not json\n");

  const result = collectSessionsWindow({ sessionDir: sessions, date: "2026-03-08", timezone: "UTC" });

  assert.equal(result.entries.total, 1);
  assert.equal(result.entries.items[0].id, "unique");
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].code, "invalid_session_file");
  assert.match(result.errors[0].path, /malformed\.jsonl$/);
});

test("sessions-search excludes custom messages, thinking, tool-call arguments, and image data", async (t) => {
  const directory = await fixtureDirectory(t);
  const sessions = path.join(directory, "sessions");
  await writeSession(directory, "search.jsonl", [
    sessionHeader("search"),
    entry({ id: "user", timestamp: "2026-03-08T10:00:00.000Z", role: "user", content: "quoted profile error" }),
    entry({ id: "assistant-1", parentId: "user", timestamp: "2026-03-08T10:01:00.000Z", role: "assistant", content: [{ type: "text", text: "profile error: missing data" }] }),
    entry({ id: "assistant-2", parentId: "assistant-1", timestamp: "2026-03-08T10:02:00.000Z", role: "assistant", content: [{ type: "thinking", thinking: "profile error private reasoning" }, { type: "image", data: "profile error image" }] }),
    entry({ id: "tool-call", parentId: "assistant-2", timestamp: "2026-03-08T10:03:00.000Z", role: "assistant", content: [], toolCalls: [{ arguments: "profile error secret" }] }),
    entry({ id: "tool-result", parentId: "tool-call", timestamp: "2026-03-08T10:04:00.000Z", role: "toolResult", content: [{ type: "text", text: "profile error output" }] }),
    entry({ id: "custom", parentId: "tool-result", timestamp: "2026-03-08T10:05:00.000Z", type: "custom_message", content: "profile error injected", customType: "context", display: true }),
  ]);

  const result = searchSessions({ sessionDir: sessions, terms: ["profile", "error"], limit: 10 });

  assert.equal(result.matches.total, 3);
  assert.deepEqual(result.matches.items.map((item) => item.id), ["user", "assistant-1", "tool-result"]);
  assert.deepEqual(result.matches.items.map((item) => item.role), ["user", "assistant", "toolResult"]);
  assert.ok(result.matches.items.every((item) => !item.text.includes("secret")));
  assert.ok(result.matches.items.every((item) => !item.text.includes("thinking")));
  assert.ok(result.matches.items.every((item) => !item.text.includes("injected")));
});

test("sessions-search and session-context are bounded, deterministic candidate locators", async (t) => {
  const directory = await fixtureDirectory(t);
  const sessions = path.join(directory, "sessions");
  const file = await writeSession(directory, "context.jsonl", [
    sessionHeader("context"),
    entry({ id: "a", timestamp: "2026-03-08T10:00:00.000Z", role: "user", content: "first target" }),
    entry({ id: "b", parentId: "a", timestamp: "2026-03-08T10:01:00.000Z", role: "assistant", content: "second target" }),
    entry({ id: "c", parentId: "a", timestamp: "2026-03-08T10:02:00.000Z", role: "assistant", content: "branch target" }),
  ]);

  const result = searchSessions({ sessionDir: sessions, terms: ["target"], limit: 2 });
  assert.equal(result.matches.total, 3);
  assert.equal(result.matches.returned, 2);
  assert.equal(result.matches.truncated, true);
  assert.deepEqual(result.matches.items.map((item) => item.id), ["a", "b"]);
  assert.equal(result.matches.items[0].path, file);

  const context = sessionContext({ path: file, entryIds: ["b"], ancestorLimit: 2, descendantLimit: 1 });
  assert.equal(context.context.total, 2);
  assert.equal(context.context.returned, 2);
  assert.deepEqual(context.context.items.map((item) => item.id), ["a", "b"]);
  assert.equal(context.context.truncated, false);
});

test("learning-sections returns complete matching H2 sections without unrelated sections", () => {
  const markdown = `# Learnings\n\n## Use exact chezmoi template data\n\n\`2026-03-08\` · \`maruina/dotfiles\` · \`DataDog/k8s-release-mgmt-resources\` · #chezmoi #templates · [PR](https://example.test/pr/1)\n\n- **Use when:** executing a template needs profile data.\n- **Do:** pass the custom data map explicitly.\n- **Evidence:** [review](https://example.test/review/1).\n\n## Diagnose Kubernetes scheduling\n\n\`2026-03-07\` · \`DataDog/compute\` · #kubernetes\n\n- **Use when:** a pod is pending.\n- **Do:** inspect scheduling events.\n- **Evidence:** source.\n`;

  const result = selectLearningSections(markdown, ["chezmoi", "https://example.test/review/1"]);

  assert.equal(result.sections.total, 2);
  assert.equal(result.sections.returned, 1);
  assert.equal(result.sections.items[0].title, "Use exact chezmoi template data");
  assert.match(result.sections.items[0].content, /^## Use exact chezmoi template data/m);
  assert.match(result.sections.items[0].content, /DataDog\/k8s-release-mgmt-resources/);
  assert.doesNotMatch(result.sections.items[0].content, /Diagnose Kubernetes scheduling/);
  assert.equal(selectLearningSections("", ["chezmoi"]).sections.returned, 0);
});

test("CLI emits versioned JSON and structured errors without diagnostics on stdout", async (t) => {
  const directory = await fixtureDirectory(t);
  const sessions = path.join(directory, "sessions");
  await writeSession(directory, "cli.jsonl", [
    sessionHeader("cli"),
    entry({ id: "entry", timestamp: "2026-03-08T10:00:00.000Z", role: "user", content: "hello" }),
  ]);

  const success = await runCli(["sessions-window", "--session-dir", sessions, "--date", "2026-03-08", "--timezone", "UTC"]);
  assert.equal(success.status, 0);
  assert.equal(success.stderr, "");
  assert.equal(JSON.parse(success.stdout).schemaVersion, 1);

  const failure = await runCli(["sessions-window", "--date", "not-a-date"]);
  assert.equal(failure.status, 2);
  assert.equal(failure.stdout, "");
  assert.deepEqual(JSON.parse(failure.stderr), {
    schemaVersion: 1,
    error: {
      code: "invalid_arguments",
      message: "--session-dir must be an existing directory",
      retryable: false,
      suggestions: ["Pass --session-dir <directory> and --date YYYY-MM-DD."],
    },
  });
});
