#!/usr/bin/env node
// Collects deterministic weekly work evidence (date range, existing Obsidian note,
// GitHub PRs via gh, Jira keys, and Pi session summaries) as JSON for /weekly-summary.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const JIRA_KEY_RE = /\b[A-Z][A-Z0-9]+-[0-9]+\b/g;
const PR_URL_RE = /https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/\d+/g;
const MAX_SESSIONS = 300;
const MAX_PROMPTS_PER_SESSION = 10;
const MAX_PROMPT_CHARS = 200;
const GITHUB_QUERY_LIMIT = 100;
const PR_FIELDS = "repository,number,title,body,url,state,closedAt,createdAt,updatedAt";

const GITHUB_QUERIES = [
  { org: "DataDog", login: "maruina", author: "maruina" },
  { org: "ddoghq", login: "matteo-ruina_ddog", author: "matteo-ruina_ddog" },
];

export function formatIsoDate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseIsoDate(value) {
  if (!ISO_DATE_RE.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || formatIsoDate(date) !== value) return null;
  return date;
}

export function previousMondayToSunday(todayIso) {
  const today = todayIso ? parseIsoDate(todayIso) : new Date(Date.UTC(
    new Date().getFullYear(),
    new Date().getMonth(),
    new Date().getDate(),
  ));
  if (!today) throw new Error(`Invalid --today date: ${todayIso}`);
  const dayOfWeek = today.getUTCDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const thisMonday = new Date(today.getTime() - daysSinceMonday * 86_400_000);
  const prevMonday = new Date(thisMonday.getTime() - 7 * 86_400_000);
  const prevSunday = new Date(prevMonday.getTime() + 6 * 86_400_000);
  return { from: formatIsoDate(prevMonday), to: formatIsoDate(prevSunday), monday: formatIsoDate(prevMonday) };
}

export function mondayOfDate(isoDate) {
  const date = parseIsoDate(isoDate);
  if (!date) throw new Error(`Invalid date: ${isoDate}`);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return formatIsoDate(new Date(date.getTime() - daysSinceMonday * 86_400_000));
}

export function extractJiraKeys(text) {
  if (!text) return [];
  return [...new Set(text.match(JIRA_KEY_RE) ?? [])].sort();
}

function entryTimestampMs(entry) {
  for (const candidate of [entry?.timestamp, entry?.message?.timestamp]) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
    if (typeof candidate === "string") {
      const parsed = Date.parse(candidate);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

export function scanPiSessions(sessionsDir, fromIso, toIso) {
  if (!existsSync(sessionsDir)) return { sessions: [], truncated: false };
  const fromMs = parseIsoDate(fromIso).getTime();
  const toMs = parseIsoDate(toIso).getTime() + 86_400_000;
  const matches = [];

  for (const dirEntry of readdirSync(sessionsDir, { withFileTypes: true })) {
    if (!dirEntry.isDirectory()) continue;
    const subDir = path.join(sessionsDir, dirEntry.name);
    let files;
    try {
      files = readdirSync(subDir);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith(".jsonl")) continue;
      const fullPath = path.join(subDir, file);
      let st;
      try {
        st = statSync(fullPath);
      } catch {
        continue;
      }
      // A file last modified before fromMs cannot contain entries in [fromMs, toMs).
      // Files modified after toMs may still contain entries from [fromMs, toMs).
      if (st.mtimeMs < fromMs) continue;
      const summary = summarizeSessionFile(fullPath, st.mtimeMs, fromMs, toMs);
      if (summary) matches.push(summary);
    }
  }

  matches.sort((a, b) => b.activityMs - a.activityMs);
  const truncated = matches.length > MAX_SESSIONS;
  return {
    sessions: matches.slice(0, MAX_SESSIONS).map(({ activityMs: _ignored, ...rest }) => rest),
    truncated,
  };
}

function summarizeSessionFile(filePath, mtimeMs, fromMs, toMs) {
  let raw;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  let sessionId = path.basename(filePath, ".jsonl");
  let cwd = null;
  let hasAnyTimestamp = false;
  let inRangeActivityMs = null;
  const prompts = [];
  const seenPrompts = new Set();
  let promptsTruncated = false;
  const jiraKeys = new Set();
  const prUrls = new Set();
  const mtimeInRange = mtimeMs >= fromMs && mtimeMs < toMs;

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const ts = entryTimestampMs(entry);
    if (ts !== null) {
      hasAnyTimestamp = true;
      if (ts >= fromMs && ts < toMs) {
        inRangeActivityMs = inRangeActivityMs === null ? ts : Math.max(inRangeActivityMs, ts);
      }
    }
    if (entry.type === "session") {
      if (typeof entry.id === "string") sessionId = entry.id;
      if (typeof entry.cwd === "string") cwd = entry.cwd;
      continue;
    }
    if (entry.type === "message" && entry.message?.role === "user") {
      const msgInRange = ts !== null ? (ts >= fromMs && ts < toMs) : mtimeInRange;
      if (!msgInRange) continue;
      const content = extractMessageText(entry.message.content);
      const normalized = content.replace(/\s+/g, " ").trim().slice(0, MAX_PROMPT_CHARS);
      if (normalized && !seenPrompts.has(normalized)) {
        if (prompts.length < MAX_PROMPTS_PER_SESSION) {
          seenPrompts.add(normalized);
          prompts.push(normalized);
        } else {
          promptsTruncated = true;
        }
      }
      for (const key of content.match(JIRA_KEY_RE) ?? []) jiraKeys.add(key);
      for (const url of content.match(PR_URL_RE) ?? []) prUrls.add(url);
    }
  }

  if (hasAnyTimestamp ? inRangeActivityMs === null : !mtimeInRange) return null;
  const activityMs = inRangeActivityMs ?? mtimeMs;

  return {
    sessionId,
    cwd,
    updatedAt: new Date(activityMs).toISOString(),
    mtimeMs,
    activityMs,
    firstPrompt: prompts[0] ?? null,
    prompts,
    promptsTruncated,
    jiraKeys: [...jiraKeys].sort(),
    prUrls: [...prUrls].sort(),
  };
}

function extractMessageText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block && block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
}

function defaultRunGh(args, { token } = {}) {
  const env = { ...process.env, GH_PROMPT_DISABLED: "1", GH_HOST: "github.com" };
  delete env.GH_TOKEN;
  delete env.GITHUB_TOKEN;
  if (token) env.GH_TOKEN = token;
  const res = spawnSync("gh", args, { encoding: "utf8", env, timeout: 30_000 });
  if (res.error) {
    return { ok: false, stdout: "", error: `spawn_${res.error.code || "UNKNOWN"}` };
  }
  if (res.status !== 0) {
    return { ok: false, stdout: res.stdout || "", error: `gh_exit_${res.status ?? "unknown"}` };
  }
  return { ok: true, stdout: res.stdout || "", error: null };
}

export function collectGitHubPrs(fromIso, toIso, { runGh = defaultRunGh } = {}) {
  const byUrl = new Map();
  const errors = [];
  let truncated = false;
  const range = `${fromIso}..${toIso}`;

  for (const target of GITHUB_QUERIES) {
    const auth = runGh(["auth", "token", "--hostname", "github.com", "--user", target.login]);
    const token = auth.ok ? auth.stdout.trim() : "";
    if (!token || /\s/.test(token)) {
      errors.push({ org: target.org, query: "auth", message: auth.error || "auth_unavailable" });
      continue;
    }

    const queries = [
      { kind: "merged", args: ["search", "prs", "--owner", target.org, "--author", target.author, "--merged", "--merged-at", range, "--limit", String(GITHUB_QUERY_LIMIT), "--json", PR_FIELDS] },
      { kind: "updated", args: ["search", "prs", "--owner", target.org, "--author", target.author, "--updated", range, "--limit", String(GITHUB_QUERY_LIMIT), "--json", PR_FIELDS] },
    ];
    for (const q of queries) {
      const res = runGh(q.args, { token });
      if (!res.ok) {
        errors.push({ org: target.org, query: q.kind, message: res.error || "gh_failed" });
        continue;
      }
      let items;
      try {
        items = JSON.parse(res.stdout || "[]");
      } catch (err) {
        errors.push({ org: target.org, query: q.kind, message: `Invalid JSON: ${err.message}` });
        continue;
      }
      if (Array.isArray(items) && items.length >= GITHUB_QUERY_LIMIT) truncated = true;
      for (const pr of items) {
        if (!pr?.url) continue;
        // PRs merged during the selected week come from the merged query; skip older merged PRs
        // that only had post-merge comments/updates during this week.
        if (q.kind === "updated" && String(pr.state || "").toUpperCase() === "MERGED") continue;
        const existing = byUrl.get(pr.url);
        const bucket = q.kind === "merged" ? "merged" : (existing?.bucket ?? "updated");
        byUrl.set(pr.url, {
          org: target.org,
          repository: pr.repository?.nameWithOwner ?? pr.repository?.name ?? null,
          number: pr.number,
          title: pr.title,
          url: pr.url,
          state: pr.state,
          bucket,
          createdAt: pr.createdAt ?? null,
          updatedAt: pr.updatedAt ?? null,
          closedAt: pr.closedAt ?? null,
          jiraKeys: extractJiraKeys([pr.title, pr.body].filter(Boolean).join("\n")),
        });
      }
    }
  }

  return { prs: [...byUrl.values()], truncated, errors };
}

function parseArgs(argv) {
  const opts = {
    from: null,
    to: null,
    today: null,
    sessionsDir: path.join(process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi/agent"), "sessions"),
    obsidianVault: path.join(os.homedir(), "Documents/main"),
    skipGithub: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg === "--json") continue;
    else if (arg === "--skip-github") opts.skipGithub = true;
    else if (arg === "--from" && argv[i + 1]) opts.from = argv[++i];
    else if (arg === "--to" && argv[i + 1]) opts.to = argv[++i];
    else if (arg === "--today" && argv[i + 1]) opts.today = argv[++i];
    else if (arg === "--sessions-dir" && argv[i + 1]) opts.sessionsDir = argv[++i];
    else if (arg === "--obsidian-vault" && argv[i + 1]) opts.obsidianVault = argv[++i];
    else throw new Error(`Unknown or incomplete option: ${arg}`);
  }
  return opts;
}

function printHelp() {
  process.stdout.write(`Usage: node weekly-evidence.mjs [options]

Collect deterministic weekly evidence (Obsidian note, GitHub PRs via gh,
Jira keys, and Pi sessions) as JSON for /weekly-summary.

Options:
  --from <YYYY-MM-DD>      Start date (default: previous Monday)
  --to <YYYY-MM-DD>        End date (default: previous Sunday)
  --today <YYYY-MM-DD>     Reference date for default previous-week calculation
  --sessions-dir <path>    Pi sessions directory
  --obsidian-vault <path>  Obsidian vault root (default: ~/Documents/main)
  --skip-github            Skip gh PR queries (offline/test mode)
  --json                   Emit JSON (default)
  --help                   Show this help
`);
}

export function collectWeeklyEvidence(opts, { runGh } = {}) {
  let range;
  if (opts.from || opts.to) {
    if (!opts.from || !opts.to) throw new Error("Provide both --from and --to, or neither.");
    if (!parseIsoDate(opts.from) || !parseIsoDate(opts.to)) throw new Error("Dates must use YYYY-MM-DD format.");
    if (opts.from > opts.to) throw new Error("--from must be on or before --to.");
    range = { from: opts.from, to: opts.to, monday: mondayOfDate(opts.from) };
  } else {
    range = previousMondayToSunday(opts.today);
  }

  const notePath = path.join(opts.obsidianVault, "Datadog", "Snippets", `Week of ${range.monday}.md`);
  const noteExists = existsSync(notePath);
  const noteContent = noteExists ? readFileSync(notePath, "utf8") : null;

  const github = opts.skipGithub ? { prs: [], truncated: false, errors: [] } : collectGitHubPrs(range.from, range.to, { runGh });
  const piSessions = scanPiSessions(opts.sessionsDir, range.from, range.to);

  const jiraKeys = new Set(extractJiraKeys(noteContent ?? ""));
  for (const pr of github.prs) for (const k of pr.jiraKeys) jiraKeys.add(k);
  for (const s of piSessions.sessions) for (const k of s.jiraKeys) jiraKeys.add(k);

  return {
    schemaVersion: 1,
    range,
    obsidianNote: { path: notePath, exists: noteExists, content: noteContent },
    github,
    jiraKeys: [...jiraKeys].sort(),
    piSessions,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) {
      printHelp();
      process.exit(0);
    }
    const report = collectWeeklyEvidence(opts);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    const payload = {
      schemaVersion: 1,
      error: {
        code: "invalid_arguments",
        message: error instanceof Error ? error.message : String(error),
        retryable: false,
        suggestions: ["Run with --help to inspect supported flags."],
      },
    };
    process.stderr.write(`${JSON.stringify(payload)}\n`);
    process.exit(2);
  }
}
