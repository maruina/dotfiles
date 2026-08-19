/**
 * System-prompt filtering helpers.
 *
 * Context-kit injects newly discovered instructions and rules as hidden
 * messages. These helpers only remove ignored Pi-loaded context blocks and
 * prune an empty Project Context section afterward.
 */

const SECTION_MARKER = "# Project Context\n\nProject-specific instructions and guidelines:\n\n";
const DATE_MARKER = "\nCurrent date: ";

/**
 * Excise the exact `## ${filePath}\n\n${fileContent}\n\n` block from
 * `prompt` (matching the verbatim substring Pi's `buildSystemPrompt` emits).
 * Used by the agentsignore path to remove Pi-loaded ancestor AGENTS.md blocks.
 * Returns the prompt unchanged when the anchor isn't found.
 */
export function exciseContextBlock(prompt: string, filePath: string, fileContent: string): string {
  const exact = `## ${filePath}\n\n${fileContent}\n\n`;
  const idx = prompt.indexOf(exact);
  if (idx === -1) return prompt;
  return prompt.slice(0, idx) + prompt.slice(idx + exact.length);
}

/**
 * If the `# Project Context` section exists but has no `## ` blocks under
 * its preamble, strip the section entirely so the prompt does not retain a
 * dangling "Project-specific instructions and guidelines:" heading.
 */
export function pruneEmptySection(prompt: string): string {
  const sectionStartMarker = `\n\n${SECTION_MARKER}`;
  const sectionIdx = prompt.indexOf(sectionStartMarker);
  if (sectionIdx === -1) return prompt;

  const afterPreamble = sectionIdx + sectionStartMarker.length;
  const skillsIdx = prompt.indexOf("\n\nThe following skills", afterPreamble);
  const dateIdx = prompt.indexOf(DATE_MARKER, afterPreamble);
  const ends = [skillsIdx, dateIdx].filter((i) => i !== -1);
  const sectionEnd = ends.length === 0 ? prompt.length : Math.min(...ends);

  const nextBlockIdx = prompt.indexOf("## ", afterPreamble);
  if (nextBlockIdx !== -1 && nextBlockIdx < sectionEnd) return prompt;

  return prompt.slice(0, sectionIdx) + prompt.slice(sectionEnd);
}
