/**
 * System-prompt injection helper.
 *
 * Mirrors the exact format Pi's `buildSystemPrompt` uses for context files:
 *
 *   # Project Context
 *
 *   Project-specific instructions and guidelines:
 *
 *   ## /abs/path/AGENTS.md
 *
 *   <content>
 *
 *   ## /abs/path/.../AGENTS.md
 *
 *   <content>
 *
 *   <available_skills>...</available_skills>     # optional
 *
 *   Current date: 2026-...
 *   Current working directory: /...
 *
 * Two splice modes per block:
 *
 *   - `insertAfter` set: splice immediately after a specific Pi-loaded
 *     context-file block. Used for `AGENTS.local.md` siblings so they
 *     follow their corresponding base `AGENTS.md` in the same directory.
 *   - `insertAfter` unset: splice at the top of the # Project Context
 *     section (right after Pi's preamble). Used for subdir-discovered
 *     AGENTS.md, AGENTS.local.md, and matching rule files.
 *
 * When the section doesn't exist yet (Pi loaded zero ancestor AGENTS.md),
 * it's synthesised and spliced before the `\nCurrent date:` footer.
 */

const SECTION_MARKER = "# Project Context\n\nProject-specific instructions and guidelines:\n\n";
const DATE_MARKER = "\nCurrent date: ";

/**
 * A block to inject. `insertAfter` references the exact path/content of a
 * pre-existing Pi-loaded context file; the helper builds the exact substring
 * Pi emits for that file (`## ${path}\n\n${content}\n\n`) and splices the new
 * block in immediately after it.
 */
export type Block = {
  heading: string;
  content: string;
  insertAfter?: { filePath: string; fileContent: string };
};

export function injectContextBlocks(prompt: string, blocks: Block[]): string {
  if (blocks.length === 0) return prompt;

  let result = prompt;
  const topBlocks: Block[] = [];

  // Phase 1: insertAfter splices. We do these first because each one anchors
  // on the exact substring of a Pi-loaded context block; doing the top-of-
  // section splice first would push those anchors further down the string,
  // which is fine for indexOf but confusing.
  for (const block of blocks) {
    if (!block.insertAfter) {
      topBlocks.push(block);
      continue;
    }
    const anchor = `## ${block.insertAfter.filePath}\n\n${block.insertAfter.fileContent}\n\n`;
    const idx = result.indexOf(anchor);
    if (idx === -1) {
      // Anchor not found (Pi's format drifted, or the contextFiles entry was
      // mutated by another extension between load and now). Fall back to
      // top-of-section so the block isn't silently lost.
      topBlocks.push(block);
      continue;
    }
    const insertAt = idx + anchor.length;
    const rendered = renderBlock(block);
    result = result.slice(0, insertAt) + rendered + result.slice(insertAt);
  }

  if (topBlocks.length === 0) return result;

  // Phase 2: top-of-section splice for the remainder.
  const renderedTop = topBlocks.map(renderBlock).join("");

  const sectionIdx = result.indexOf(SECTION_MARKER);
  if (sectionIdx !== -1) {
    const insertAt = sectionIdx + SECTION_MARKER.length;
    return result.slice(0, insertAt) + renderedTop + result.slice(insertAt);
  }

  const newSection = `\n\n# Project Context\n\nProject-specific instructions and guidelines:\n\n${renderedTop}`;

  const dateIdx = result.indexOf(DATE_MARKER);
  if (dateIdx !== -1) {
    return result.slice(0, dateIdx) + newSection + result.slice(dateIdx);
  }

  return result + newSection;
}

function renderBlock(block: Block): string {
  return `## ${block.heading}\n\n${block.content.trimEnd()}\n\n`;
}

/**
 * Excise the exact `## ${filePath}\n\n${fileContent}\n\n` block from
 * `prompt` (matching the verbatim substring Pi's `buildSystemPrompt`
 * emits). Used by the agentsignore path to remove Pi-loaded ancestor
 * AGENTS.md blocks the user has filtered out. Returns the prompt
 * unchanged when the anchor isn't found.
 */
export function exciseContextBlock(prompt: string, filePath: string, fileContent: string): string {
  const exact = `## ${filePath}\n\n${fileContent}\n\n`;
  const idx = prompt.indexOf(exact);
  if (idx === -1) return prompt;
  return prompt.slice(0, idx) + prompt.slice(idx + exact.length);
}

/**
 * If the `# Project Context` section exists but has no `## ` blocks under
 * its preamble, strip the section entirely (header + preamble paragraph)
 * so the prompt doesn't end up with a dangling "Project-specific
 * instructions and guidelines:" with nothing beneath it. Mirrors the
 * skill-section-prune behaviour in `_skills.ts`.
 *
 * The section is bounded by the literal preamble on one side and either
 * the skills section (`\n\nThe following skills...`) or the date footer
 * (`\nCurrent date:`) on the other.
 */
export function pruneEmptySection(prompt: string): string {
  const sectionStartMarker = `\n\n${SECTION_MARKER}`;
  const sectionIdx = prompt.indexOf(sectionStartMarker);
  if (sectionIdx === -1) return prompt;

  const afterPreamble = sectionIdx + sectionStartMarker.length;
  // Section ends at skills section, date footer, or end-of-prompt — whichever comes first.
  const skillsIdx = prompt.indexOf("\n\nThe following skills", afterPreamble);
  const dateIdx = prompt.indexOf(DATE_MARKER, afterPreamble);
  const ends = [skillsIdx, dateIdx].filter((i) => i !== -1);
  const sectionEnd = ends.length === 0 ? prompt.length : Math.min(...ends);

  // If there's a `## ` block heading anywhere between the preamble and the
  // next section boundary, the section is non-empty — leave it alone.
  const nextBlockIdx = prompt.indexOf("## ", afterPreamble);
  if (nextBlockIdx !== -1 && nextBlockIdx < sectionEnd) return prompt;

  return prompt.slice(0, sectionIdx) + prompt.slice(sectionEnd);
}
