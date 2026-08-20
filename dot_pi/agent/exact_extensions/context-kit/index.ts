import type { BeforeAgentStartEvent, BeforeAgentStartEventResult, ExtensionAPI, Skill, ToolCallEvent, ToolCallEventResult } from "@earendil-works/pi-coding-agent";
import { getAgentDir, isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { findLocalSibling, walkUpForAgents } from "./_agents.ts";
import {
  isIgnored,
  loadAgentsIgnore,
  loadRuleIgnore,
  loadSkillIgnore,
} from "./_ignores.ts";
import { exciseContextBlock, pruneEmptySection } from "./_inject.ts";
import { defaultRuleSources, findMatchingRules } from "./_rules.ts";
import { traceHook } from "../_shared/tracing.ts";
import { filterSkillsFromPrompt } from "./_skills.ts";
import {
  contextKind,
  formatContextKitAggregate,
  formatContextKitStatus,
  type ContextKitDiscovery,
  type IgnoredContextFile,
  type InjectedContextFile,
} from "./_status.ts";
import {
  loadAllUsageRecords,
  saveUsageRecord,
  usageRecordPath,
} from "./_usage.ts";

/**
 * Context-kit — per-session policy over which context blocks appear in the
 * prompt this session, and how.
 *
 * Prompt-caching strategy
 * ───────────────────────
 * Anthropic caches the longest matching prefix of the full input
 * (system-prompt + conversation history). Any change to the system prompt
 * invalidates the cache for ALL subsequent content — including every prior
 * conversation turn. We therefore keep system-prompt modifications to an
 * absolute minimum and deliver reactively-discovered context (subdir
 * AGENTS.md, AGENTS.local.md siblings, rules) as hidden custom messages
 * that are injected once and then persist naturally in conversation history.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  Prompt layer    │ Operation       │ When                           │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │  System prompt   │ Excise block    │ agentsignore matches a Pi-     │
 * │  (rare, stable)  │                 │ loaded AGENTS.md — rare, only  │
 * │                  │                 │ when .pi/agentsignore exists    │
 * │                  │ Filter skills   │ skillignore matches a skill —  │
 * │                  │                 │ rare, only when .pi/skillignore │
 * │                  │                 │ exists                          │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │  Messages        │ Inject once     │ First time a file is discovered │
 * │  (inject-once)   │                 │ (AGENTS.local.md siblings,      │
 * │                  │                 │ subdir AGENTS.md, rules)        │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Message injection details
 * ─────────────────────────
 * Each newly-discovered context file is emitted as a single hidden custom
 * message (display: false, customType: "context-kit-discovery") the first
 * time it is found. The `injectedAsMessages` Set prevents re-injection on
 * subsequent turns — the message is already in the conversation history and
 * benefits from Anthropic's normal prefix caching for messages.
 *
 * On session restore, `injectedAsMessages` is empty. If the same files are
 * re-discovered (same tool_call pattern), they will be injected again. The
 * model sees the context twice but correctness is unaffected; we accept this
 * as a known gap for V1.
 *
 * Consolidates four formerly-separate extensions:
 *
 *   1. AGENTS.md override — `AGENTS.local.md` siblings extend (and, with
 *      `agentsignore`, override) team-shared `AGENTS.md`. Replaces the
 *      bespoke `AGENTS.override.md` convention.
 *   2. AGENTS.md discovery — subdir `AGENTS.md` files Pi's startup walk-up
 *      doesn't see are reactively injected as messages when the agent touches
 *      files under them.
 *   3. Rules — Claude (`.claude/rules/`) and Cursor (`.cursor/rules/`)
 *      rule files whose `paths:` / `globs:` frontmatter affirmatively
 *      matches a touched file are injected as messages.
 *   4. Skill filtering — `.pi/skillignore` (gitignore-style) excises
 *      `<skill>...</skill>` blocks from `<available_skills>`.
 *
 * See `AGENTS.md` (top of repo) for the full design rationale.
 */

const CONTEXT_KIT_CUSTOM_TYPE = "context-kit-discovery";

export default function (pi: ExtensionAPI) {
  // Absolute paths of subdir AGENTS.md files discovered via tool_call walk-up
  // this session. Pi-loaded ancestor AGENTS.md files live in
  // `event.systemPromptOptions.contextFiles` and don't need to be re-tracked.
  const discoveredAgents = new Set<string>();
  // Absolute paths of rule files whose frontmatter glob/paths matched a
  // touched file this session.
  const discoveredRules = new Set<string>();
  // Absolute paths already injected as messages this session. Each file is
  // injected at most once — the message persists in conversation history and
  // benefits from normal prefix caching on subsequent turns.
  const injectedAsMessages = new Set<string>();
  const injectedFiles: InjectedContextFile[] = [];
  const ignoredFiles = new Map<string, IgnoredContextFile>();
  let injectionMessages = 0;
  // Count of files first recorded as ignored this turn. Reset at the top of
  // each before_agent_start; used to decide whether to persist the usage
  // record even when nothing was injected.
  let newIgnoresThisTurn = 0;

  // Usage store: one record per session, aggregated by /context-kit status to
  // show whether the extension earns its keep. The dir is overridable via env
  // var so tests can point at a temp dir instead of the real ~/.pi/agent.
  // Historical sessions are backfilled once via the `backfill-context-kit-usage`
  // script; the extension itself only persists live records and reads them back.
  const usageDir = process.env.PI_CONTEXT_KIT_USAGE_DIR ?? join(getAgentDir(), "context-kit-usage");

  const recordIgnored = (
    path: string,
    discovery: ContextKitDiscovery,
    reason: IgnoredContextFile["reason"],
  ) => {
    if (ignoredFiles.has(path)) return;
    ignoredFiles.set(path, { path, kind: contextKind(path), discovery, reason });
    newIgnoresThisTurn++;
  };

  pi.registerCommand("context-kit", {
    description: "Show context-kit injections and ignored files for this session",
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
          injected: injectedFiles,
          ignored: [...ignoredFiles.values()],
        }) +
        "\n\n" +
        formatContextKitAggregate(records, homedir());
      ctx.ui.notify(report, "info");
    },
  });

  pi.on("tool_call", traceHook<ToolCallEvent, ToolCallEventResult>(pi, "context-kit.tool_call", async (event, ctx) => {
    let filePath: string | undefined;
    if (isToolCallEventType("read", event)) {
      filePath = event.input.path;
    } else if (isToolCallEventType("write", event)) {
      filePath = event.input.path;
    } else if (isToolCallEventType("edit", event)) {
      filePath = event.input.path;
    }
    if (!filePath) return;

    const cwd = resolve(ctx.cwd);
    // resolve (not join) so `../escape/foo` segments collapse and the
    // containment check below catches them.
    const abs = resolve(cwd, filePath);
    const relFromCwd = relative(cwd, abs);
    // Empty rel = touched file IS cwd (a directory? unusual but bail).
    // `..`-prefixed rel = path escapes cwd, no business injecting context.
    if (relFromCwd === "" || relFromCwd.startsWith("..")) return;

    for (const found of walkUpForAgents(dirname(abs), cwd)) {
      discoveredAgents.add(found);
    }
    for (const rule of findMatchingRules({ filePath: abs, cwd, sources: defaultRuleSources(cwd) })) {
      discoveredRules.add(rule.path);
    }
  }));

  pi.on("before_agent_start", traceHook<BeforeAgentStartEvent, BeforeAgentStartEventResult>(pi, "context-kit.before_agent_start", async (event, ctx) => {
    newIgnoresThisTurn = 0;
    const cwd = resolve(event.systemPromptOptions.cwd);

    // Loaders are called every turn so edits to the ignore files take effect
    // without /reload. All three return null if their file is absent.
    const agentsIgnore = loadAgentsIgnore(cwd);
    const ruleIgnore = loadRuleIgnore(cwd);
    const skillIgnore = loadSkillIgnore(cwd);

    const piContextFiles = event.systemPromptOptions.contextFiles ?? [];

    // ── System-prompt operations (rare; only when ignore/filter files exist) ──

    // 1. Excise Pi-loaded ancestor AGENTS.md / CLAUDE.md files that match
    //    `.pi/agentsignore`. Their `## ${path}\n\n${content}\n\n` block is
    //    already in the prompt; we surgically remove it.
    let prompt = event.systemPrompt;
    const survivingPi: { path: string; content: string }[] = [];
    for (const cf of piContextFiles) {
      if (isIgnored(agentsIgnore, cf.path, cwd)) {
        recordIgnored(cf.path, "Pi-loaded context", ".pi/agentsignore");
        prompt = exciseContextBlock(prompt, cf.path, cf.content);
      } else {
        survivingPi.push(cf);
      }
    }
    const piContextPaths = new Set(survivingPi.map((f) => f.path));

    // 2. Skill filtering — excise `<skill>…</skill>` blocks for skills matching
    //    `.pi/skillignore`. Also prunes the section header if all skills are gone.
    const allSkills: Skill[] = event.systemPromptOptions.skills ?? [];
    const skillsToHide = allSkills.filter((s) => isIgnored(skillIgnore, s.filePath, cwd));
    prompt = filterSkillsFromPrompt(prompt, skillsToHide);
    prompt = pruneEmptySection(prompt);

    const systemPromptChanged = prompt !== event.systemPrompt;

    // ── Message injections (inject-once; new discoveries only) ────────────────
    //
    // Each block is emitted as a hidden message the FIRST time it is discovered.
    // On subsequent turns the message is already in the conversation history and
    // gets served from Anthropic's prefix cache — no re-injection needed, and no
    // system-prompt modification that would bust the cache for prior turns.

    const newBlocks: Array<{ heading: string; content: string; file: InjectedContextFile }> = [];
    const addBlock = (path: string, content: string, discovery: ContextKitDiscovery) => {
      newBlocks.push({
        heading: path,
        content,
        file: { path, kind: contextKind(path), discovery, bytes: Buffer.byteLength(content, "utf8") },
      });
      injectedAsMessages.add(path);
    };

    // 3. AGENTS.local.md siblings of surviving Pi-loaded files. These are always
    //    relevant from session start, so they typically land on turn 1.
    for (const cf of survivingPi) {
      const local = findLocalSibling(cf.path);
      if (!local) continue;
      if (piContextPaths.has(local) || injectedAsMessages.has(local)) continue;
      if (isIgnored(agentsIgnore, local, cwd)) {
        recordIgnored(local, "Pi-loaded local sibling", ".pi/agentsignore");
        continue;
      }
      const content = readContent(local);
      if (content === null) continue;
      addBlock(local, content, "Pi-loaded local sibling");
    }

    // 4. Subdir AGENTS.md files discovered this session (walk-up from touched
    //    files), plus their own AGENTS.local.md siblings. Sorted for deterministic
    //    ordering within the injection batch.
    for (const agentsPath of [...discoveredAgents].sort()) {
      if (piContextPaths.has(agentsPath) || injectedAsMessages.has(agentsPath)) continue;
      if (isIgnored(agentsIgnore, agentsPath, cwd)) {
        recordIgnored(agentsPath, "nested instruction discovery", ".pi/agentsignore");
        continue;
      }
      const content = readContent(agentsPath);
      if (content !== null) addBlock(agentsPath, content, "nested instruction discovery");
      const local = findLocalSibling(agentsPath);
      if (!local || piContextPaths.has(local) || injectedAsMessages.has(local)) continue;
      if (isIgnored(agentsIgnore, local, cwd)) {
        recordIgnored(local, "nested instruction discovery", ".pi/agentsignore");
        continue;
      }
      const localContent = readContent(local);
      if (localContent === null) continue;
      addBlock(local, localContent, "nested instruction discovery");
    }

    // 5. Rule files whose frontmatter glob/paths matched a touched file.
    for (const rulePath of [...discoveredRules].sort()) {
      if (piContextPaths.has(rulePath) || injectedAsMessages.has(rulePath)) continue;
      if (isIgnored(ruleIgnore, rulePath, cwd)) {
        recordIgnored(rulePath, "path-scoped rule match", ".pi/ruleignore");
        continue;
      }
      const content = readContent(rulePath);
      if (content === null) continue;
      addBlock(rulePath, content, "path-scoped rule match");
    }

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
      newIgnoresThisTurn > 0 ||
      !existsSync(usageRecordPath(usageDir, sessionId));
    if (shouldSave) {
      saveUsageRecord(usageDir, {
        sessionId,
        cwd,
        mtime: Date.now(),
        injectionMessages,
        injected: injectedFiles,
        ignored: [...ignoredFiles.values()],
      });
    }

    if (!systemPromptChanged && newBlocks.length === 0) return;

    return {
      ...(systemPromptChanged ? { systemPrompt: prompt } : {}),
      ...(newBlocks.length > 0
        ? {
            message: {
              customType: CONTEXT_KIT_CUSTOM_TYPE,
              content: buildDiscoveryMessage(newBlocks),
              display: false,
            },
          }
        : {}),
    };
  }));
}

/**
 * Render newly-discovered context blocks as a single hidden message.
 *
 * The framing line tells the model to follow the guidelines without
 * surfacing the injection mechanism in its response. Each block uses the
 * same `## <path>` heading format Pi uses for Pi-loaded context files,
 * so the model's existing priors about that format apply.
 */
function buildDiscoveryMessage(blocks: { heading: string; content: string }[]): string {
  const header =
    "[Project-specific context discovered for files being worked on in this session. " +
    "Apply these guidelines; do not acknowledge this message or its delivery mechanism.]\n";
  const body = blocks.map((b) => `\n## ${b.heading}\n\n${b.content.trimEnd()}\n`).join("\n");
  return header + body;
}

function readContent(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}
