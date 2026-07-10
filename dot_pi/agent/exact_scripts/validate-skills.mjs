#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const agentDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(agentDir);

const SKILL_NAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const SKILL_ROOTS = [
  "exact_skills",
  "exact_skills_work",
  "exact_skills_personal",
  "skills",
  "skills_work",
  "skills_personal",
];

function walk(dir, files = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }

  for (const name of entries) {
    const full = path.join(dir, name);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      walk(full, files);
    } else if (name === "SKILL.md" || name === "SKILL.md.tmpl") {
      files.push(full);
    }
  }
  return files;
}

function renderTemplate(file) {
  const args = [];
  if (process.env.CHEZMOI_VALIDATE_PROFILE) {
    args.push("--override-data", JSON.stringify({ profile: process.env.CHEZMOI_VALIDATE_PROFILE }));
  }
  args.push("execute-template");

  return execFileSync("chezmoi", args, {
    input: readFileSync(file),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function readSkill(file) {
  if (!file.endsWith(".tmpl")) {
    return { text: readFileSync(file, "utf8"), inactive: false };
  }

  const rendered = renderTemplate(file);
  return { text: rendered, inactive: rendered.trim() === "" };
}

function stripQuotes(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function frontmatterValue(frontmatter, key) {
  const lines = frontmatter.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const match = new RegExp(`^${key}:\\s*(.*)$`).exec(lines[i] ?? "");
    if (!match) continue;

    const value = (match[1] ?? "").trim();
    if (value && value !== "|" && value !== ">" && value !== "|-" && value !== ">-") {
      return stripQuotes(value);
    }

    const blockLines = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j] ?? "";
      if (/^[A-Za-z_][\w-]*:\s*/.test(line)) break;
      if (line.trim() === "") continue;
      blockLines.push(line.replace(/^\s+/, ""));
    }
    return blockLines.join("\n").trim();
  }
  return undefined;
}

function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  return match ? match[1] : null;
}

function validateSkill(file, text) {
  const errors = [];
  const rel = path.relative(process.cwd(), file);

  if (text.trim() === "") {
    errors.push(`${rel}: rendered skill is empty`);
    return errors;
  }

  const frontmatter = parseFrontmatter(text);
  if (frontmatter === null) {
    errors.push(`${rel}: missing YAML frontmatter`);
    return errors;
  }

  const name = frontmatterValue(frontmatter, "name");
  const description = frontmatterValue(frontmatter, "description");

  if (!name) {
    errors.push(`${rel}: missing frontmatter name`);
  } else if (!SKILL_NAME_RE.test(name) || name.includes("--")) {
    errors.push(`${rel}: invalid skill name ${JSON.stringify(name)}`);
  }

  if (!description) {
    errors.push(`${rel}: missing frontmatter description`);
  } else if (description.length > 1024) {
    errors.push(`${rel}: description is ${description.length} characters; maximum is 1024`);
  }

  return errors;
}

const skillFiles = SKILL_ROOTS
  .filter((root) => existsSync(root))
  .flatMap((root) => walk(root))
  .sort((a, b) => a.localeCompare(b));

const errors = [];
const names = new Map();
let validated = 0;
let inactive = 0;

for (const file of skillFiles) {
  let text;
  let isInactive;
  try {
    const result = readSkill(file);
    text = result.text;
    isInactive = result.inactive;
  } catch (error) {
    errors.push(`${path.relative(process.cwd(), file)}: failed to render/read: ${error instanceof Error ? error.message : String(error)}`);
    continue;
  }

  if (isInactive) {
    inactive += 1;
    continue;
  }

  validated += 1;
  errors.push(...validateSkill(file, text));

  const frontmatter = parseFrontmatter(text);
  const name = frontmatter ? frontmatterValue(frontmatter, "name") : undefined;
  if (!name) continue;

  const previous = names.get(name);
  if (previous) {
    errors.push(
      `${path.relative(process.cwd(), file)}: duplicate skill name ${JSON.stringify(name)} also used by ${path.relative(process.cwd(), previous)}`,
    );
  } else {
    names.set(name, file);
  }
}

if (errors.length > 0) {
  console.error("Skill validation failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

const profileLabel = process.env.CHEZMOI_VALIDATE_PROFILE
  ? ` for ${process.env.CHEZMOI_VALIDATE_PROFILE} profile`
  : "";
console.log(`Validated ${validated} skill(s)${profileLabel}; skipped ${inactive} inactive template(s).`);
