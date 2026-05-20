import type { ExtensionAPI, Skill } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { findLocalSibling, walkUpForAgents } from "./_agents.ts";
import {
  isIgnored,
  loadAgentsIgnore,
  loadRuleIgnore,
  loadSkillIgnore,
} from "./_ignores.ts";
import {
  exciseContextBlock,
  injectContextBlocks,
  pruneEmptySection,
  type Block,
} from "./_inject.ts";
import { defaultRuleSources, findMatchingRules } from "./_rules.ts";
import { filterSkillsFromPrompt } from "./_skills.ts";

/**
 * Context-kit — per-session policy over which context blocks appear in the
 * system prompt. Consolidates four formerly-separate extensions:
 *
 *   1. AGENTS.md override — `AGENTS.local.md` siblings extend (and, with
 *      `agentsignore`, override) team-shared `AGENTS.md`. Replaces the
 *      bespoke `AGENTS.override.md` convention.
 *   2. AGENTS.md discovery — subdir `AGENTS.md` files Pi's startup walk-up
 *      doesn't see are reactively spliced in when the agent touches files
 *      under them. `CLAUDE.md` is supported too for compatibility with
 *      repositories maintained by Claude Code users.
 *   3. Rules — Claude (`.claude/rules/`) and Cursor (`.cursor/rules/`)
 *      rule files whose `paths:` / `globs:` frontmatter affirmatively
 *      matches a touched file are spliced in.
 *   4. Skill filtering — `.pi/skillignore` (gitignore-style) excises
 *      `<skill>...</skill>` blocks from `<available_skills>`.
 *
 * Two more filters are loaded but currently no-ops, slated for follow-up
 * commits:
 *
 *   - `.pi/agentsignore` — suppress specific AGENTS.md / AGENTS.local.md
 *     files. Filters both Pi-loaded ancestors (surgically excised from
 *     `event.systemPrompt`) and our subdir discoveries (filtered before
 *     injection).
 *   - `.pi/ruleignore` — suppress specific rule files. Filtered before
 *     injection. Discovery is unaffected (rules stay in `discoveredRules`
 *     for the session), so toggling the ignore file mid-session takes
 *     effect on the next user prompt without losing prior matches.
 *
 * See `AGENTS.md` (top of repo) for the full design rationale.
 */

export default function (pi: ExtensionAPI) {
  // Absolute paths of subdir AGENTS.md / CLAUDE.md files discovered via tool_call walk-up
  // this session. Pi-loaded ancestor context files live in
  // `event.systemPromptOptions.contextFiles` and don't need to be re-tracked.
  const discoveredAgents = new Set<string>();
  // Absolute paths of rule files whose frontmatter glob/paths matched a
  // touched file this session.
  const discoveredRules = new Set<string>();

  pi.on("tool_call", async (event, ctx) => {
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
  });

  pi.on("before_agent_start", async (event) => {
    const cwd = resolve(event.systemPromptOptions.cwd);

    // Loaders are called every turn so edits to the ignore files take effect
    // without /reload. All three return null if their file is absent.
    const agentsIgnore = loadAgentsIgnore(cwd);
    const ruleIgnore = loadRuleIgnore(cwd);
    const skillIgnore = loadSkillIgnore(cwd);

    let prompt = event.systemPrompt;
    const piContextFiles = event.systemPromptOptions.contextFiles ?? [];

    // 1. Excise Pi-loaded ancestor AGENTS.md / CLAUDE.md files that match
    //    `.pi/agentsignore`. Their `## ${path}\n\n${content}\n\n` block is
    //    already in `prompt`; we surgically remove it. Any siblings still
    //    get injected normally (they're independent context).
    const survivingPi: { path: string; content: string }[] = [];
    for (const cf of piContextFiles) {
      if (isIgnored(agentsIgnore, cf.path, cwd)) {
        prompt = exciseContextBlock(prompt, cf.path, cf.content);
      } else {
        survivingPi.push(cf);
      }
    }
    const piContextPaths = new Set(survivingPi.map((f) => f.path));

    const blocks: Block[] = [];

    // 2. For each surviving Pi-loaded ancestor, splice its sibling
    //    `.local.md` immediately after it. `insertAfter` anchors on Pi's
    //    verbatim emit so the local block lands right after its base.
    for (const cf of survivingPi) {
      const local = findLocalSibling(cf.path);
      if (!local) continue;
      if (piContextPaths.has(local)) continue;
      if (isIgnored(agentsIgnore, local, cwd)) continue;
      const content = readContent(local);
      if (content === null) continue;
      blocks.push({
        heading: local,
        content,
        insertAfter: { filePath: cf.path, fileContent: cf.content },
      });
    }

    // 3. For each subdir AGENTS.md / CLAUDE.md we've discovered, emit base + local
    //    sibling. agentsignore filters both. Walk-up stops at cwd so we
    //    shouldn't see piContextPaths collisions, but the check is cheap.
    for (const agentsPath of [...discoveredAgents].sort()) {
      if (piContextPaths.has(agentsPath)) continue;
      if (isIgnored(agentsIgnore, agentsPath, cwd)) continue;
      const baseContent = readContent(agentsPath);
      if (baseContent !== null) {
        blocks.push({ heading: agentsPath, content: baseContent });
      }
      const local = findLocalSibling(agentsPath);
      if (!local || piContextPaths.has(local)) continue;
      if (isIgnored(agentsIgnore, local, cwd)) continue;
      const localContent = readContent(local);
      if (localContent === null) continue;
      blocks.push({ heading: local, content: localContent });
    }

    // 4. Rules — filtered via ruleignore, injected at top of section.
    for (const rulePath of [...discoveredRules].sort()) {
      if (piContextPaths.has(rulePath)) continue;
      if (isIgnored(ruleIgnore, rulePath, cwd)) continue;
      const content = readContent(rulePath);
      if (content === null) continue;
      blocks.push({ heading: rulePath, content });
    }

    prompt = injectContextBlocks(prompt, blocks);

    // 5. If everything got excised and we injected nothing, strip the
    //    dangling `# Project Context` preamble so it doesn't read as a
    //    section heading over zero blocks.
    prompt = pruneEmptySection(prompt);

    // 6. Skill filtering — find skills whose paths match `.pi/skillignore`
    //    patterns, then excise their `<skill>...</skill>` blocks from
    //    `<available_skills>`.
    const allSkills: Skill[] = event.systemPromptOptions.skills ?? [];
    const skillsToHide = allSkills.filter((s) => isIgnored(skillIgnore, s.filePath, cwd));
    prompt = filterSkillsFromPrompt(prompt, skillsToHide);

    if (prompt === event.systemPrompt) return;
    return { systemPrompt: prompt };
  });
}

function readContent(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}
