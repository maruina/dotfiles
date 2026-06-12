import type { Skill } from "@earendil-works/pi-coding-agent";

/**
 * Surgically excise `<skill>...</skill>` blocks from the assembled system
 * prompt for any skill in `skillsToHide`. If all skills are filtered out,
 * also strips the surrounding `<available_skills>` section and its
 * preamble paragraph so the prompt doesn't end up with a dangling header.
 *
 * Anchors mirror the literal strings emitted by Pi's `formatSkillsForPrompt`
 * (node_modules/@earendil-works/pi-coding-agent/dist/core/skills.js). If Pi's
 * format drifts, the anchors return -1 and this function leaves the prompt
 * unchanged — same silent-passthrough posture used elsewhere in this
 * extension.
 */

const SKILLS_PREAMBLE = "\n\nThe following skills provide specialized instructions for specific tasks.";
const AVAILABLE_SKILLS_OPEN = "<available_skills>";
const AVAILABLE_SKILLS_CLOSE = "</available_skills>";
const SKILL_BLOCK_OPEN = "  <skill>\n";
const SKILL_BLOCK_CLOSE = "  </skill>\n";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function filterSkillsFromPrompt(prompt: string, skillsToHide: Skill[]): string {
  if (skillsToHide.length === 0) return prompt;
  let result = prompt;

  for (const skill of skillsToHide) {
    // <location> uniquely identifies a skill (it's the absolute filePath,
    // XML-escaped). Find the location tag, then carve the enclosing block.
    const locTag = `    <location>${escapeXml(skill.filePath)}</location>`;
    const locIdx = result.indexOf(locTag);
    if (locIdx === -1) continue;

    const blockStart = result.lastIndexOf(SKILL_BLOCK_OPEN, locIdx);
    if (blockStart === -1) continue;
    const blockEndIdx = result.indexOf(SKILL_BLOCK_CLOSE, locIdx);
    if (blockEndIdx === -1) continue;

    result = result.slice(0, blockStart) + result.slice(blockEndIdx + SKILL_BLOCK_CLOSE.length);
  }

  // If filtering emptied <available_skills>, strip the whole section —
  // preamble paragraph + opening/closing tags + everything between — so we
  // don't leave the model staring at a "the following skills..." preamble
  // with no skills under it.
  const openIdx = result.indexOf(AVAILABLE_SKILLS_OPEN);
  if (openIdx !== -1) {
    const closeIdx = result.indexOf(AVAILABLE_SKILLS_CLOSE, openIdx);
    if (closeIdx !== -1) {
      const inner = result.slice(openIdx + AVAILABLE_SKILLS_OPEN.length, closeIdx).trim();
      if (inner === "") {
        const preambleIdx = result.lastIndexOf(SKILLS_PREAMBLE, openIdx);
        const sectionStart = preambleIdx === -1 ? openIdx : preambleIdx;
        const sectionEnd = closeIdx + AVAILABLE_SKILLS_CLOSE.length;
        result = result.slice(0, sectionStart) + result.slice(sectionEnd);
      }
    }
  }

  return result;
}
