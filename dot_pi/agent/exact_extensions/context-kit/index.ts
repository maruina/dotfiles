import type { BeforeAgentStartEvent, BeforeAgentStartEventResult, ExtensionAPI, Skill, ToolCallEvent, ToolCallEventResult } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
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

  pi.on("before_agent_start", traceHook<BeforeAgentStartEvent, BeforeAgentStartEventResult>(pi, "context-kit.before_agent_start", async (event) => {
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

    const newBlocks: { heading: string; content: string }[] = [];

    // 3. AGENTS.local.md siblings of surviving Pi-loaded files. These are always
    //    relevant from session start, so they typically land on turn 1.
    for (const cf of survivingPi) {
      const local = findLocalSibling(cf.path);
      if (!local) continue;
      if (piContextPaths.has(local) || injectedAsMessages.has(local)) continue;
      if (isIgnored(agentsIgnore, local, cwd)) continue;
      const content = readContent(local);
      if (content === null) continue;
      newBlocks.push({ heading: local, content });
      injectedAsMessages.add(local);
    }

    // 4. Subdir AGENTS.md files discovered this session (walk-up from touched
    //    files), plus their own AGENTS.local.md siblings. Sorted for deterministic
    //    ordering within the injection batch.
    for (const agentsPath of [...discoveredAgents].sort()) {
      if (piContextPaths.has(agentsPath) || injectedAsMessages.has(agentsPath)) continue;
      if (isIgnored(agentsIgnore, agentsPath, cwd)) continue;
      const content = readContent(agentsPath);
      if (content !== null) {
        newBlocks.push({ heading: agentsPath, content });
        injectedAsMessages.add(agentsPath);
      }
      const local = findLocalSibling(agentsPath);
      if (!local || piContextPaths.has(local) || injectedAsMessages.has(local)) continue;
      if (isIgnored(agentsIgnore, local, cwd)) continue;
      const localContent = readContent(local);
      if (localContent === null) continue;
      newBlocks.push({ heading: local, content: localContent });
      injectedAsMessages.add(local);
    }

    // 5. Rule files whose frontmatter glob/paths matched a touched file.
    for (const rulePath of [...discoveredRules].sort()) {
      if (piContextPaths.has(rulePath) || injectedAsMessages.has(rulePath)) continue;
      if (isIgnored(ruleIgnore, rulePath, cwd)) continue;
      const content = readContent(rulePath);
      if (content === null) continue;
      newBlocks.push({ heading: rulePath, content });
      injectedAsMessages.add(rulePath);
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
