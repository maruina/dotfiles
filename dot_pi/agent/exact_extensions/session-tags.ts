// Session tags: human-assigned tags stored as pi.session-tags custom entries.
//
// Entry contract: /tag appends { type: "custom", customType: "pi.session-tags",
// data: { tags: string[] } } via pi.appendEntry. The session_start handler
// reconstructs the current set from all entries in file order (newest entry
// wins; an empty tags array clears the set). /tags and the search tool scan
// the whole sessions tree: parent of getSessionDir() under the default
// layout, else the custom sessionDir, recursively for *.jsonl, taking each
// file's last tag entry in file order.
//
// deliberate: the scan takes each file's last tag entry in file order, not the
// entry on the session's active branch. Rebuilding per-session active branches
// would require walking each stored tree from its leaf at ~1-2k files, which a
// personal on-demand tool does not justify; a tag set on an abandoned branch can
// surface in results as an unexpected file. Upgrade path: when scanning, resolve
// each file's active branch from its tree before reading tags.

import type { ExtensionAPI, SessionEntry, SessionManager, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Type, type Static, type TSchema } from "typebox";

// The runtime hands extensions the full SessionManager, but the exported
// ReadonlySessionManager type narrows it and omits usesDefaultSessionDir().
// Cast through the full type so callers can read the default-layout flag.
type ReadSessionManager = SessionManager;

// deliberate: the pinned pi devDependency (^0.80.6 in package.json) predates
// the deferred-tool surface; the pi runtime that loads this extension (1.0.0)
// declares exposure, outputSchema, and AgentToolResult.structuredContent. Keep
// the runtime-required fields and cast across the older declared type. Upgrade
// path: drop this intersection once Renovate bumps the devDependency past
// 0.80.6, then pass the plain ToolDefinition to registerTool.
type DeferredTool<TParams extends TSchema> = ToolDefinition<TParams> & {
  exposure: "deferred";
  outputSchema: TSchema;
};

const TAG_ENTRY_TYPE = "pi.session-tags";
const MAX_TOOL_RESULTS = 50;
const FALLBACK_NAME_MAX_LENGTH = 100;
const TAG_RE = /^[a-z0-9][a-z0-9-]*$/;
const TAGS_GUIDANCE = `## Session Tags
Sessions can carry user-assigned tags, set with /tag cla,controllers. To answer
questions about sessions by tag, load the deferred tool \`search_sessions_by_tags\`
through \`tool_search\`, then search the returned session files with rg/read.`;

export interface ParsedTags {
  tags: string[];
  invalid: string[];
}

export interface ScannedSession {
  file: string;
  id: string;
  name: string;
  date: string;
  cwd: string;
  tags: string[];
}

export interface ScanResult {
  sessions: ScannedSession[];
  skipped: number;
  total: number;
}

export function parseTags(input: string): ParsedTags {
  const tags: string[] = [];
  const invalid: string[] = [];
  const seenTags = new Set<string>();
  const seenInvalid = new Set<string>();
  for (const raw of input.split(",")) {
    const tag = raw.trim().toLowerCase();
    if (!tag) continue;
    if (TAG_RE.test(tag)) {
      if (!seenTags.has(tag)) {
        seenTags.add(tag);
        tags.push(tag);
      }
    } else if (!seenInvalid.has(tag)) {
      seenInvalid.add(tag);
      invalid.push(tag);
    }
  }
  return { tags, invalid };
}

function tagsFromCustomEntry(entry: SessionEntry): string[] | undefined {
  if (entry.type !== "custom" || entry.customType !== TAG_ENTRY_TYPE) return undefined;
  const tags = (entry.data as { tags?: unknown } | undefined)?.tags;
  if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === "string")) return undefined;
  return tags;
}

export function tagsFromBranch(branch: SessionEntry[]): string[] {
  let tags: string[] | undefined;
  for (const entry of branch) {
    const candidate = tagsFromCustomEntry(entry);
    if (candidate !== undefined) tags = candidate; // newest entry on the branch wins
  }
  return tags ?? [];
}

export function resolveScanRoot(sessionDir: string, usesDefault: boolean): string {
  return usesDefault ? dirname(sessionDir) : sessionDir;
}

function oneLine(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= FALLBACK_NAME_MAX_LENGTH) return collapsed;
  return `${collapsed.slice(0, FALLBACK_NAME_MAX_LENGTH - 1)}…`;
}

function formatDate(ms: number): string {
  const date = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((part): part is { text?: unknown } => typeof part === "object" && part !== null && "text" in part)
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .join(" ")
      .trim();
  }
  return "";
}

async function parseSessionFile(file: string): Promise<{ session: ScannedSession; time: number } | undefined> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch {
    return undefined;
  }
  const lines = text.split("\n");
  if (lines.length === 0) return undefined;

  let header: unknown;
  try {
    header = JSON.parse(lines[0]);
  } catch {
    return undefined;
  }
  const h = header as { type?: unknown; timestamp?: unknown; cwd?: unknown; id?: unknown };
  if (h.type !== "session") return undefined;
  const time = typeof h.timestamp === "string" ? Date.parse(h.timestamp) : NaN;
  if (Number.isNaN(time)) return undefined;

  let tags: string[] = [];
  let name: string | undefined;
  let firstUserMessage: string | undefined;
  for (let index = 1; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line) continue;
    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch {
      return undefined; // any unparseable line skips the whole file
    }
    if (typeof entry !== "object" || entry === null) return undefined;
    const e = entry as { type?: unknown; customType?: unknown; data?: unknown; name?: unknown; message?: unknown };
    if (e.type === "custom" && e.customType === TAG_ENTRY_TYPE) {
      const tagsValue = (e.data as { tags?: unknown } | undefined)?.tags;
      if (Array.isArray(tagsValue) && tagsValue.every((tag) => typeof tag === "string")) tags = tagsValue;
    } else if (e.type === "session_info" && typeof e.name === "string" && e.name.length > 0) {
      name = e.name;
    } else if (e.type === "message" && firstUserMessage === undefined) {
      const message = e.message as { role?: unknown; content?: unknown } | undefined;
      if (message?.role === "user") firstUserMessage = messageText(message.content);
    }
  }

  const sessionName = name ?? (firstUserMessage !== undefined ? `(no name) "${oneLine(firstUserMessage)}"` : "(no name)");
  return {
    session: {
      file,
      id: typeof h.id === "string" ? h.id : "",
      name: sessionName,
      date: formatDate(time),
      cwd: typeof h.cwd === "string" ? h.cwd : "",
      tags,
    },
    time,
  };
}

export async function scanSessions(root: string): Promise<ScanResult> {
  const files: string[] = [];
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(join(entry.parentPath, entry.name));
  }
  const parsed: Array<{ session: ScannedSession; time: number }> = [];
  let skipped = 0;
  for (const file of files) {
    const result = await parseSessionFile(file);
    if (!result) {
      skipped++;
      continue;
    }
    if (result.session.tags.length > 0) parsed.push(result);
  }
  parsed.sort((a, b) => b.time - a.time);
  return {
    sessions: parsed.map((entry) => entry.session),
    skipped,
    total: files.length,
  };
}

function sessionMatches(session: ScannedSession, requested: string[]): boolean {
  return requested.every((tag) => session.tags.includes(tag));
}

function sessionsWord(count: number): string {
  return count === 1 ? "session" : "sessions";
}

export function formatToolTable(sessions: ScannedSession[], matchedCount: number, truncated: boolean): string {
  const rows = sessions.map((session) => `${session.date}  ${session.name}  [${session.tags.join(", ")}]\n  ${session.file}  (cwd: ${session.cwd})`);
  const text = rows.join("\n");
  return truncated ? `${text}\n(truncated: showing ${sessions.length} of ${matchedCount} sessions)` : text;
}

export function formatTagsListing(scan: ScanResult): string {
  const header = `Tags across ${scan.total} ${sessionsWord(scan.total)} (${scan.sessions.length} tagged):`;
  if (scan.sessions.length === 0) return header;
  const byTag = new Map<string, ScannedSession[]>();
  for (const session of scan.sessions) {
    for (const tag of session.tags) {
      const list = byTag.get(tag) ?? [];
      list.push(session);
      byTag.set(tag, list);
    }
  }
  const groups = [...byTag.keys()].sort().map((tag) => {
    // Show the session id (pasteable into /resume search) instead of the file
    // path; the path is long and the picker does not search it.
    const rows = byTag
      .get(tag)!
      .map((session) => `  ${session.date}  ${session.name}\n    ${session.id}`)
      .join("\n");
    return `${tag} (${byTag.get(tag)!.length})\n${rows}`;
  });
  return `${header}\n\n${groups.join("\n\n")}`;
}

function sameTags(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((tag, index) => tag === b[index]);
}

export default function (pi: ExtensionAPI): void {
  let currentTags: string[] = [];

  // Pi anchors appendEntry custom entries to the session tree, but the next
  // user message forks from the message chain, so tag entries can fall off the
  // active branch once the conversation continues. Reconstruct from all entries
  // in file order (getBranch() would miss them), matching the scan's rule.
  pi.on("session_start", (_event, ctx) => {
    currentTags = tagsFromBranch(ctx.sessionManager.getEntries());
  });

  // The deferred tool is invisible to the model, so the agent must be told the
  // tag concept exists and how to reach the tool (user-context.ts pattern:
  // before_agent_start returns a context message that hides from the TUI).
  pi.on("before_agent_start", () => ({
    message: {
      customType: "session-tags",
      content: TAGS_GUIDANCE,
      display: false,
    },
  }));

  pi.registerCommand("tag", {
    description: "Set or edit this session's tags. Usage: /tag cla,controllers, or /tag with no arguments to edit in a dialog.",
    handler: async (args, ctx) => {
      // deliberate: in pi 1.0.0 the input dialog cannot be prefilled — the TUI
      // ignores the placeholder and its runner drops any opts value. The
      // prefill-capable dialog is ctx.ui.editor(title, prefill), which resolves
      // to the edited text or undefined on cancel, like input. Upgrade path:
      // use ctx.ui.input once it supports a prefill argument.
      const input = args.trim() === "" ? await ctx.ui.editor("Session tags", currentTags.join(", ")) : args;
      if (input === undefined) return; // dialog cancelled
      const parsed = parseTags(input);
      if (parsed.invalid.length > 0) {
        ctx.ui.notify(`Invalid tags: ${parsed.invalid.join(", ")}`, "error");
        return;
      }
      if (sameTags(parsed.tags, currentTags)) return; // unchanged resubmission
      currentTags = parsed.tags;
      pi.appendEntry(TAG_ENTRY_TYPE, { tags: parsed.tags });
      ctx.ui.notify(parsed.tags.length > 0 ? `Tags: ${parsed.tags.join(", ")}` : "Tags cleared");
    },
  });

  pi.registerCommand("tags", {
    description: "List tags across all sessions.",
    handler: async (_args, ctx) => {
      try {
        const manager = ctx.sessionManager as ReadSessionManager;
        const root = resolveScanRoot(manager.getSessionDir(), manager.usesDefaultSessionDir());
        const scan = await scanSessions(root);
        ctx.ui.notify(formatTagsListing(scan));
      } catch (error) {
        ctx.ui.notify(`Could not scan sessions: ${error instanceof Error ? error.message : String(error)}`, "error");
      }
    },
  });

  const searchTagsParams = Type.Object({
    tags: Type.Array(Type.String(), { minItems: 1, description: "Tags a session must carry. A session matches when it carries all given tags." }),
  });
  const searchTagsOutput = Type.Object({
    sessions: Type.Array(
      Type.Object({
        file: Type.String(),
        name: Type.String(),
        date: Type.String(),
        cwd: Type.String(),
        tags: Type.Array(Type.String()),
      }),
    ),
    truncated: Type.Boolean(),
  });
  type SearchTagsParams = Static<typeof searchTagsParams>;
  const searchTool = {
    name: "search_sessions_by_tags",
    label: "Search sessions by tags",
    description:
      "Find session files that carry all of the given tags. Returns file paths, names, dates, cwd, and tags, newest first, truncated at 50 sessions. The agent then reads the returned files (rg, read) to answer content questions; this tool only pre-filters which sessions match the tags.",
    exposure: "deferred" as const,
    parameters: searchTagsParams,
    outputSchema: searchTagsOutput,
    execute: async (
      _toolCallId: string,
      params: SearchTagsParams,
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: { sessionManager: SessionManager },
    ) => {
      if (params.tags.length === 0) throw new Error("search_sessions_by_tags requires at least one tag");
      const root = resolveScanRoot(ctx.sessionManager.getSessionDir(), ctx.sessionManager.usesDefaultSessionDir());
      const scan = await scanSessions(root);
      const matched = scan.sessions.filter((session) => sessionMatches(session, params.tags));
      const truncated = matched.length > MAX_TOOL_RESULTS;
      const sessions = truncated ? matched.slice(0, MAX_TOOL_RESULTS) : matched;
      return {
        content: [{ type: "text", text: formatToolTable(sessions, matched.length, truncated) }],
        structuredContent: { sessions, truncated },
        details: { total: scan.total, matched: matched.length, skipped: scan.skipped, truncated },
      };
    },
  };
  pi.registerTool(searchTool as unknown as DeferredTool<ReturnType<typeof Type.Object>>);
}