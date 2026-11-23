import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir, isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { Text } from "@earendil-works/pi-tui";
import { findLocalSibling, walkUpForAgents } from "./_agents.ts";
import { blockingPaths, clearPending, compactionReset, confirmDelivered, confirmDirectDelivery, createState, discover, queue, rebuildFromBranch, recordDirectPending, snapshotState, STATE_ENTRY_TYPE } from "./_delivery.ts";
import { defaultRuleSources, findMatchingRules } from "./_rules.ts";
import {
  contextKind,
  formatContextKitAggregate,
  formatContextKitStatus,
  type ContextKitDiscovery,
  type InjectedContextFile,
} from "./_status.ts";
import {
  loadAllUsageRecords,
  loadUsageRecord,
  saveUsageRecord,
  usageRecordPath,
} from "./_usage.ts";

/**
 * Context-kit — per-session policy over which context blocks are delivered in
 * this session, and how.
 *
 * Prompt-caching strategy
 * ───────────────────────
 * Anthropic caches the longest matching prefix of the full input
 * (system-prompt + conversation history). Any change to the system prompt
 * invalidates the cache for ALL subsequent content — including every prior
 * conversation turn. Context-kit never mutates the system prompt; it delivers
 * local siblings, nested instruction files, and path-scoped rules as custom
 * messages that persist naturally in conversation history. The TUI shows
 * compact paths, not contents.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  Layer           │ Operation       │ When                           │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │  Messages        │ Startup sibling │ Before first model call        │
 * │  (cached prefix) │ Steer delivery  │ First applicable tool access;  │
 * │                  │                 │ confirm before mutation retry  │
 * ├──────────────────┼─────────────────┼────────────────────────────────┤
 * │  Delivery state  │ Branch snapshot │ Restore/tree; reset loaded     │
 * │                  │                 │ paths after compaction         │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Message injection details
 * ─────────────────────────
 * Newly applicable files are sent as steer messages during the tool call that
 * discovers them. Startup siblings are sent before the first model call. The
 * delivery state prevents duplicate messages and blocks mutations until a
 * `context` event confirms that the model received the files. Delivery uses
 * conversation messages, so it does not change the cached system-prompt prefix.
 * The TUI renders a compact tree of paths and kinds, never file contents.
 *
 * Consolidates three context-delivery behaviors:
 *
 *   1. Local siblings — `AGENTS.local.md` and `CLAUDE.local.md` siblings
 *      extend team-shared `AGENTS.md` / `CLAUDE.md`.
 *   2. Nested instruction discovery — subdir `AGENTS.md` / `CLAUDE.md` files
 *      below cwd are reactively injected when the agent touches files under them.
 *   3. Path-scoped rules — Claude (`.claude/rules/`) and Cursor
 *      (`.cursor/rules/`) rule files whose `paths:` / `globs:` frontmatter
 *      matches a touched file are injected as messages.
 */

const CONTEXT_KIT_CUSTOM_TYPE = "context-kit-discovery";
const MAX_FILE_BYTES = 24 * 1024;
const MAX_BATCH_BYTES = 96 * 1024;
const TRUNCATION_MARKER = "[truncated: file exceeds the per-file size limit]";

export default function (pi: ExtensionAPI) {
  pi.registerMessageRenderer(CONTEXT_KIT_CUSTOM_TYPE, (message, _options, theme) => {
    const details = message.details as { paths?: unknown; cwd?: unknown } | undefined;
    const cwd = typeof details?.cwd === "string" ? details.cwd : "";
    const paths = Array.isArray(details?.paths) ? details.paths.filter((path): path is string => typeof path === "string") : [];
    const tree = paths.map((path, index) =>
      `  ${index === paths.length - 1 ? "└─" : "├─"} [${contextKind(path)}] ${displayDiscoveryPath(path, cwd)}`,
    );
    const text = ["context-kit loaded:", ...tree].join("\n");
    return new Text(`${theme.fg("success", "✓")} ${theme.fg("muted", text)}`, 0, 0);
  });

  let state = createState();
  let piContextPaths = new Set<string>();
  let piContextHashes = new Set<string>();
  const startupSiblingPaths = new Set<string>();
  let injectedFiles: InjectedContextFile[] = [];
  let injectionMessages = 0;
  let blockedMutations = 0;

  // Usage store: one record per session, aggregated by /context-kit status to
  // show whether the extension earns its keep. The dir is overridable via env
  // var so tests can point at a temp dir instead of the real ~/.pi/agent.
  const usageDir = process.env.PI_CONTEXT_KIT_USAGE_DIR ?? join(getAgentDir(), "context-kit-usage");

  const persistState = () => pi.appendEntry(STATE_ENTRY_TYPE, snapshotState(state));
  const rebuildState = (ctx: ExtensionContext) => {
    try {
      state = rebuildFromBranch(ctx.sessionManager.getBranch());
    } catch {
      state = createState();
    }
  };
  const restoreUsage = (ctx: ExtensionContext) => {
    const usage = loadUsageRecord(usageDir, ctx.sessionManager.getSessionId());
    injectedFiles = usage?.injected ?? [];
    injectionMessages = usage?.injectionMessages ?? 0;
    blockedMutations = 0;
  };

  pi.registerCommand("context-kit", {
    description: "Show context-kit injections for this session",
    handler: async (args, ctx) => {
      const action = (args || "status").trim().toLowerCase();
      if (action !== "status") {
        ctx.ui.notify("Usage: /context-kit [status]", "error");
        return;
      }
      const records = loadAllUsageRecords(usageDir);
      const report =
        formatContextKitStatus({
          cwd: ctx.cwd,
          injectionMessages,
          blockedMutations,
          injected: injectedFiles,
        }) +
        "\n\n" +
        formatContextKitAggregate(records, homedir());
      ctx.ui.notify(report, "info");
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    rebuildState(ctx);
    restoreUsage(ctx);
  });

  pi.on("session_tree", async (_event, ctx) => {
    rebuildState(ctx);
  });

  pi.on("session_compact", async (_event) => {
    const hadLoadedPaths = state.loaded.size > 0;
    const paths = compactionReset(state);
    if (hadLoadedPaths) persistState();
    if (paths.length === 0) return;
    pi.sendMessage({
      customType: "context-kit-compaction",
      content: `Context was compacted. These context-kit files were discovered earlier and their contents may no longer be in context. Read them again if they still apply:\n${paths.map((path) => `- ${path}`).join("\n")}`,
      display: true,
      details: { paths },
    });
  });

  pi.on("tool_call", async (event, ctx) => {
    let filePath: string | undefined;
    let isMutation = false;
    if (isToolCallEventType("read", event)) {
      filePath = event.input.path;
    } else if (isToolCallEventType("write", event)) {
      filePath = event.input.path;
      isMutation = true;
    } else if (isToolCallEventType("edit", event)) {
      filePath = event.input.path;
      isMutation = true;
    }
    if (!filePath) return;

    let cwd: string;
    let abs: string;
    const applicable: Array<{ path: string; content: string; file: InjectedContextFile }> = [];
    const discoveredPaths: string[] = [];
    const unreadablePaths: string[] = [];
    try {
      cwd = resolve(ctx.cwd);
      // resolve (not join) so `../escape/foo` segments collapse and the
      // containment check below catches them.
      abs = resolve(cwd, filePath);
      const relFromCwd = relative(cwd, abs);
      // Empty rel = touched file IS cwd (a directory? unusual but bail).
      // `..`-prefixed rel = path escapes cwd, no business injecting context.
      if (relFromCwd === "" || relFromCwd.startsWith("..")) return;

      const seen = new Set<string>();
      const addApplicable = (path: string, source: ContextKitDiscovery) => {
        if ((path === abs && isContextKitFile(path)) || piContextPaths.has(path) || seen.has(path)) return;
        seen.add(path);
        const content = readContent(path);
        if (content === null) {
          discoveredPaths.push(path);
          unreadablePaths.push(path);
          return;
        }
        if (piContextHashes.has(contentHash(content))) return;
        discoveredPaths.push(path);
        applicable.push({
          path,
          content,
          file: { path, kind: contextKind(path), discovery: source, bytes: Buffer.byteLength(content, "utf8") },
        });
      };

      for (const agentsPath of walkUpForAgents(dirname(abs), cwd)) {
        addApplicable(agentsPath, "nested instruction discovery");
        const local = findLocalSibling(agentsPath);
        if (local) addApplicable(local, "nested instruction discovery");
      }
      for (const local of startupSiblingPaths) addApplicable(local, "Pi-loaded local sibling");
      for (const rule of findMatchingRules({ filePath: abs, cwd, sources: defaultRuleSources(cwd) }).sort((a, b) => a.path.localeCompare(b.path))) {
        addApplicable(rule.path, "path-scoped rule match");
      }
    } catch (error) {
      warn(ctx, `context-kit: discovery skipped (${error instanceof Error ? error.message : String(error)})`);
      return;
    }

    if (unreadablePaths.length > 0) warn(ctx, `context-kit: could not read ${unreadablePaths.join(", ")}`);

    if (discover(state, discoveredPaths)) persistState();
    const blocking = blockingPaths(state, applicable.map((file) => file.path), piContextPaths);
    const directPendingPaths = new Set(state.directPending.values());
    const candidates = applicable
      .filter((file) => !state.loaded.has(file.path) && !state.pending.has(file.path) && !directPendingPaths.has(file.path))
      .map((file) => ({ ...file, heading: file.path }));
    const batch = prepareDiscoveryBatch(candidates);
    if (batch.blocks.length > 0) {
      const paths = batch.blocks.map((block) => block.file.path);
      try {
        pi.sendMessage(
          {
            customType: CONTEXT_KIT_CUSTOM_TYPE,
            content: batch.content,
            display: true,
            details: { paths, cwd },
          },
          { deliverAs: "steer" },
        );
      } catch (error) {
        warn(ctx, `context-kit: delivery failed (${error instanceof Error ? error.message : String(error)})`);
        return;
      }
      queue(state, paths);
      injectionMessages++;
      injectedFiles.push(...batch.blocks.map((block) => block.file));
    }

    if (batch.blocks.length > 0) {
      saveUsageRecord(usageDir, {
        sessionId: ctx.sessionManager.getSessionId(),
        cwd,
        mtime: Date.now(),
        injectionMessages,
        injected: injectedFiles,
      });
    }

    if (isMutation && blocking.length > 0) {
      blockedMutations++;
      return { block: true, reason: blockReason(abs, blocking) };
    }
  });

  pi.on("context", async (event) => {
    let stateChanged = false;
    const resultIds: string[] = [];
    for (const message of event.messages) {
      if (message.role === "toolResult" && !message.isError) resultIds.push(message.toolCallId);
    }
    stateChanged = confirmDirectDelivery(state, resultIds).length > 0;
    for (const message of event.messages) {
      if (message.role !== "custom" || message.customType !== CONTEXT_KIT_CUSTOM_TYPE) continue;
      const paths = (message.details as { paths?: unknown } | undefined)?.paths;
      if (Array.isArray(paths)) {
        stateChanged = confirmDelivered(state, paths.filter((path): path is string => typeof path === "string")) || stateChanged;
      }
    }
    if (stateChanged) persistState();
  });

  pi.on("tool_result", async (event, ctx) => {
    if (event.isError || (event.toolName !== "read" && event.toolName !== "edit" && event.toolName !== "write")) return;
    const filePath = event.input.path;
    if (typeof filePath !== "string") return;

    try {
      const cwd = resolve(ctx.cwd);
      const abs = resolve(cwd, filePath);
      const relFromCwd = relative(cwd, abs);
      if (relFromCwd === "" || relFromCwd.startsWith("..") || isAbsolute(relFromCwd)) return;
      if (!isContextKitFile(abs) || piContextPaths.has(abs)) return;
      const newlyDiscovered = !state.discovered.has(abs);
      recordDirectPending(state, event.toolCallId, abs);
      if (newlyDiscovered) persistState();
    } catch {
      // A failed direct-interaction record can only cause a later re-injection.
    }
  });

  pi.on("before_agent_start", async (event, ctx) => {
    clearPending(state);
    startupSiblingPaths.clear();
    const cwd = resolve(event.systemPromptOptions.cwd);

    const piContextFiles = event.systemPromptOptions.contextFiles ?? [];
    piContextPaths = new Set(piContextFiles.map((f) => f.path));
    piContextHashes = new Set<string>();
    for (const cf of piContextFiles) {
      const content = typeof cf.content === "string" ? cf.content : readContent(cf.path);
      if (content !== null) piContextHashes.add(contentHash(content));
    }

    // ── Message injections ────────────────────────────────────────────────────
    let startupStateChanged = false;
    const startupBlocks: Array<{ heading: string; content: string; file: InjectedContextFile }> = [];

    // Local siblings of Pi-loaded files apply from session start.
    for (const cf of piContextFiles) {
      const local = findLocalSibling(cf.path);
      if (!local || piContextPaths.has(local)) continue;
      startupSiblingPaths.add(local);
      if (discover(state, [local])) startupStateChanged = true;
      if (state.loaded.has(local)) continue;
      const content = readContent(local);
      if (content === null) {
        warn(ctx, `context-kit: could not read ${local}`);
        continue;
      }
      startupBlocks.push({
        heading: local,
        content,
        file: { path: local, kind: contextKind(local), discovery: "Pi-loaded local sibling", bytes: Buffer.byteLength(content, "utf8") },
      });
    }

    const batch = prepareDiscoveryBatch(startupBlocks);
    const newBlocks = batch.blocks;
    queue(state, newBlocks.map((block) => block.file.path));
    if (startupStateChanged) persistState();
    if (newBlocks.length > 0) {
      injectionMessages++;
      injectedFiles.push(...newBlocks.map((block) => block.file));
    }

    // Persist this session's usage so /context-kit status can aggregate across
    // sessions. Write when something changed this turn, or on the first turn
    // so sessions where context-kit injects nothing still count as recorded.
    const sessionId = ctx.sessionManager.getSessionId();
    const shouldSave =
      newBlocks.length > 0 ||
      !existsSync(usageRecordPath(usageDir, sessionId));
    if (shouldSave) {
      saveUsageRecord(usageDir, {
        sessionId,
        cwd,
        mtime: Date.now(),
        injectionMessages,
        injected: injectedFiles,
      });
    }

    if (newBlocks.length === 0) return;

    return {
      message: {
        customType: CONTEXT_KIT_CUSTOM_TYPE,
        content: batch.content,
        display: true,
        details: { paths: newBlocks.map((block) => block.file.path), cwd },
      },
    };
  });
}

/**
 * Render newly-discovered context blocks as a single hidden message.
 *
 * The framing line tells the model to follow the guidelines without
 * surfacing the injection mechanism in its response. Each block uses the
 * same `## <path>` heading format Pi uses for Pi-loaded context files,
 * so the model's existing priors about that format apply.
 */
function isContextKitFile(path: string): boolean {
  const name = basename(path);
  if (name === "AGENTS.md" || name === "CLAUDE.md" || name === "AGENTS.local.md" || name === "CLAUDE.local.md") return true;
  return path.includes(`${sep}.claude${sep}rules${sep}`) || path.includes(`${sep}.cursor${sep}rules${sep}`);
}

function warn(ctx: ExtensionContext, message: string): void {
  if (ctx.hasUI) ctx.ui.notify(message, "warning");
}

function displayDiscoveryPath(path: string, cwd: string): string {
  if (!cwd) return path;
  const rel = relative(cwd, path);
  return rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel : path;
}

function blockReason(targetPath: string, blocking: readonly string[]): string {
  return [
    `context-kit: context files apply to ${targetPath} but their contents have not been delivered to you yet:`,
    ...blocking.map((path) => `- ${path}`),
    "They are being delivered to you now. Retry the same call after you have received them.",
  ].join("\n");
}

type DiscoveryBlock = { heading: string; content: string; file: InjectedContextFile };

function prepareDiscoveryBatch(blocks: readonly DiscoveryBlock[]): { blocks: DiscoveryBlock[]; content: string } {
  const included: DiscoveryBlock[] = [];
  const omitted: string[] = [];
  let batchBytes = 0;
  for (const block of blocks) {
    const content = truncateContent(block.content);
    const bytes = Buffer.byteLength(content, "utf8");
    if (batchBytes + bytes > MAX_BATCH_BYTES) {
      omitted.push(block.file.path);
      continue;
    }
    batchBytes += bytes;
    included.push({ ...block, content, file: { ...block.file, bytes } });
  }
  return { blocks: included, content: buildDiscoveryMessage(included, omitted) };
}

function truncateContent(content: string): string {
  const contentBytes = Buffer.from(content, "utf8");
  if (contentBytes.byteLength <= MAX_FILE_BYTES) return content;

  const marker = `\n${TRUNCATION_MARKER}`;
  let end = MAX_FILE_BYTES - Buffer.byteLength(marker, "utf8");
  while (end > 0 && (contentBytes[end]! & 0xc0) === 0x80) end--;
  return contentBytes.toString("utf8", 0, end) + marker;
}

function buildDiscoveryMessage(blocks: readonly DiscoveryBlock[], omitted: readonly string[] = []): string {
  const header =
    "[Project-specific context discovered for files being worked on in this session. " +
    "Apply these guidelines; do not acknowledge this message or its delivery mechanism.]\n";
  const omittedText = omitted.length > 0
    ? `Not inlined because the batch size limit was reached; read these if they apply:\n${omitted.map((path) => `- ${path}`).join("\n")}\n\n`
    : "";
  const body = blocks.map((block) => `\n## ${block.heading}\n\n${block.content.trimEnd()}\n`).join("\n");
  return header + omittedText + body;
}

function contentHash(content: string): string {
  return createHash("sha256").update(content.trimEnd()).digest("hex");
}

function readContent(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}
