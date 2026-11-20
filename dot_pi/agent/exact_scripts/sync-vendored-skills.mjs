#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const roots = ["exact_skills", "exact_skills_work", "exact_skills_personal"];
const maxBuffer = 32 * 1024 * 1024;
const skills = [];
const completed = [];
let current = null;
let totalBytes = 0;
let totalFiles = 0;

class CliError extends Error {
  constructor(code, message, exitCode = 1) { super(message); this.code = code; this.exitCode = exitCode; }
}

function command(program, args, options = {}) {
  try {
    return execFileSync(program, args, { ...options, timeout: 120000, maxBuffer, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_TERMINAL_PROMPT: "0", SSH_ASKPASS_REQUIRE: "never", GCM_INTERACTIVE: "never" } });
  } catch {
    throw new CliError("command_failed", `${program} failed: ${args[0] === "-C" ? args[2] : args[0]}`);
  }
}

function relativePath(value, allowRoot = false) {
  if (allowRoot && value === ".") return "";
  if (!value || value.startsWith("/") || value.includes("\\") || value.split("/").some(part => !part || part === "." || part === ".." || part === ".git")) {
    throw new CliError("invalid_path", `Invalid relative path: ${value}`);
  }
  return value;
}

function parseManifest(file) {
  if (!lstatSync(file).isFile()) throw new CliError("unsafe_destination", `Manifest must be a regular file: ${file}`);
  const text = readFileSync(file, "utf8");
  const field = (name) => text.match(new RegExp(`^- ${name}: (.+)$`, "m"))?.[1]?.trim();
  const upstream = field("Upstream");
  const match = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(upstream ?? "");
  const quoted = (value) => /^`([^`]+)`$/.exec(value ?? "")?.[1];
  const subpath = quoted(field("Path"));
  const pin = quoted(field("Pinned commit"));
  const list = field("Files");
  if (!match || [match[1], match[2]].some(value => value === "." || value === ".." || value.startsWith("-")) || subpath === undefined || !/^[0-9a-f]{40}$/.test(pin ?? "")) throw new CliError("invalid_manifest", `Invalid manifest: ${file}`);
  let files = null;
  if (list !== undefined) {
    const parts = list.split(",").map(value => quoted(value.trim()));
    if (!parts.length || parts.some(value => !value)) throw new CliError("invalid_manifest", `Invalid Files list: ${file}`);
    files = parts.map(value => relativePath(value));
  }
  return { file, text, upstream, org: match[1], repo: match[2], subpath: relativePath(subpath, true), pin, files };
}

function directoryExists(dir) {
  let stat;
  try { stat = lstatSync(dir); } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
  if (!stat.isDirectory()) throw new CliError("unsafe_destination", `Expected a non-symlink directory: ${dir}`);
  return true;
}

function discover(source) {
  const skills = [];
  for (const root of roots) {
    const dir = path.join(source, "dot_pi", "agent", root);
    if (!directoryExists(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillDir = path.join(dir, entry.name);
      const manifest = path.join(skillDir, "VENDOR.md");
      if (existsSync(manifest)) {
        if (!entry.name.startsWith("exact_")) throw new CliError("unsafe_destination", `Vendored skill directory must be exact: ${skillDir}`);
        skills.push({ name: entry.name.slice("exact_".length), dir: skillDir, manifest });
      }
    }
  }
  return skills.sort((a, b) => a.dir.localeCompare(b.dir));
}

function ensureSafeTree(dir) {
  if (lstatSync(dir).isSymbolicLink()) throw new CliError("unsafe_destination", `Symlink in destination: ${dir}`);
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new CliError("unsafe_destination", `Symlink in destination: ${child}`);
    if (entry.isDirectory()) ensureSafeTree(child);
    else if (!entry.isFile()) throw new CliError("unsafe_destination", `Unsupported destination: ${child}`);
  }
}

function replaceFile(target, content, mode) {
  const dir = mkdtempSync(path.join(path.dirname(target), ".vendor-sync-"));
  const temp = path.join(dir, "file");
  try {
    writeFileSync(temp, content, { mode });
    chmodSync(temp, mode);
    // Rename replaces the destination without changing other links to the old file.
    renameSync(temp, target);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function sourcePath(rel, executable = false) {
  const parts = rel.split("/");
  const encode = (name) => {
    if (/^(after|before|create|dot|empty|encrypted|exact|executable|external|modify|once|onchange|private|readonly|remove|run|symlink)_/.test(name) || name.endsWith(".tmpl")) {
      throw new CliError("unsupported_path", `Upstream path conflicts with chezmoi attributes: ${rel}`);
    }
    return name.startsWith(".") ? `dot_${name.slice(1)}` : name;
  };
  return parts.map((part, index) => index < parts.length - 1 ? `exact_${encode(part)}` : `${executable ? "executable_" : ""}${encode(part)}`).join("/");
}

function targetPath(rel) {
  return rel.split("/").map((part, index, parts) => {
    if (index < parts.length - 1) part = part.slice("exact_".length);
    else if (part.startsWith("executable_")) part = part.slice("executable_".length);
    return part.startsWith("dot_") ? `.${part.slice("dot_".length)}` : part;
  }).join("/");
}

function localFiles(dir, prefix = "") {
  const result = [];
  for (const entry of readdirSync(path.join(dir, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!entry.name.startsWith("exact_")) throw new CliError("unsafe_destination", `Nested skill directory must be exact: ${rel}`);
      result.push(...localFiles(dir, rel));
    } else if (rel !== "VENDOR.md") result.push(rel);
  }
  return result;
}

function fetchRepo(manifest, base) {
  const clone = path.join(base, manifest.org, manifest.repo);
  if (!existsSync(clone)) {
    mkdirSync(path.dirname(clone), { recursive: true });
    command("git", ["clone", "--", manifest.upstream, clone]);
  }
  const origins = command("git", ["-C", clone, "config", "--get-all", "remote.origin.url"], { encoding: "utf8" }).trim().split("\n");
  const remote = /^(?:https:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i.exec(origins[0]);
  if (origins.length !== 1 || !remote || remote[1].toLowerCase() !== manifest.org.toLowerCase() || remote[2].toLowerCase() !== manifest.repo.toLowerCase()) {
    throw new CliError("origin_mismatch", `Clone origin does not match ${manifest.org}/${manifest.repo}`);
  }
  command("git", ["-C", clone, "fetch", "--", "origin"]);
  const commit = command("git", ["-C", clone, "rev-parse", "--verify", "--end-of-options", "refs/remotes/origin/HEAD^{commit}"], { encoding: "utf8" }).trim();
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new CliError("invalid_commit", "Unable to resolve origin/HEAD to a commit");
  return { clone, commit };
}

function resolveContent(skill, repo) {
  const { subpath, files } = skill;
  const selections = files ?? [""];
  const result = new Map();
  for (const selection of selections) {
    const query = [subpath, selection].filter(Boolean).join("/");
    const args = ["-C", repo.clone, "ls-tree", "-r", "-z", "--full-tree", repo.commit];
    if (query) args.push("--", `:(literal)${query}`);
    const entries = command("git", args).toString("utf8").split("\0").filter(Boolean);
    if (!entries.length) throw new CliError("missing_upstream", `Missing upstream path: ${query || "."}`);
    for (const entry of entries) {
      const match = /^(\d+) (\w+) ([0-9a-f]{40})\t([\s\S]+)$/.exec(entry);
      if (!match || !["100644", "100755"].includes(match[1]) || match[2] !== "blob") throw new CliError("unsupported_upstream", `Unsupported upstream entry in ${query}`);
      const upstreamPath = match[4];
      const rel = subpath ? upstreamPath.slice(subpath.length + 1) : upstreamPath;
      relativePath(rel);
      if (rel === "VENDOR.md" || rel.startsWith("VENDOR.md/")) throw new CliError("unsafe_destination", "Upstream content conflicts with VENDOR.md");
      const content = command("git", ["-C", repo.clone, "cat-file", "blob", match[3]]);
      totalFiles++;
      totalBytes += content.length;
      if (totalFiles > 10000 || totalBytes > 128 * 1024 * 1024) throw new CliError("content_limit", "Selected content exceeds the file or byte limit");
      const executable = match[1] === "100755";
      const sourceRel = sourcePath(rel, executable);
      result.set(sourceRel, { content, mode: executable ? 0o755 : 0o644 });
    }
  }
  return result;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) { console.log("Usage: sync-vendored-skills.mjs [--source DIR] [--dry-run] [--json] [SKILL ...]\nFetch and preview or synchronize vendored skills."); return; }
  let source;
  let dryRun = false;
  const filters = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--source" && args[i + 1]) source = args[++i];
    else if (args[i] === "--dry-run") dryRun = true;
    else if (args[i] === "--json") continue;
    else if (args[i].startsWith("-")) throw new CliError("invalid_arguments", `Invalid argument: ${args[i]}`, 2);
    else filters.push(args[i]);
  }
  source = path.resolve(source ?? command("chezmoi", ["source-path"], { encoding: "utf8" }).trim());
  if (!directoryExists(path.join(source, "dot_pi")) || !directoryExists(path.join(source, "dot_pi", "agent"))) throw new CliError("invalid_source", `Invalid chezmoi source: ${source}`, 2);
  const found = discover(source);
  for (const name of filters) if (!found.some(skill => skill.name === name)) throw new CliError("invalid_skill", `Unknown or non-vendored skill: ${name}`, 2);
  const selected = found.filter(skill => !filters.length || filters.includes(skill.name)).map(skill => ({ ...skill, ...parseManifest(skill.manifest) }));
  const repos = new Map();
  const base = process.env.GO_REPOS_ROOT || path.join(os.homedir(), "go/src/github.com");
  const work = [];
  for (const skill of selected) {
    const key = `${skill.org}/${skill.repo}`;
    if (!repos.has(key)) repos.set(key, fetchRepo(skill, base));
    const repo = repos.get(key);
    ensureSafeTree(skill.dir);
    const content = resolveContent(skill, repo);
    const existing = localFiles(skill.dir);
    const existingSet = new Set(existing);
    const newTargets = new Set([...content.keys()].map(targetPath));
    const replaced = existing.filter(file => newTargets.has(targetPath(file)) && !content.has(file));
    const differs = skill.pin !== repo.commit || replaced.length > 0 || (!skill.files && existing.some(file => !content.has(file))) || [...content].some(([file, data]) => {
      if (!existingSet.has(file)) return true;
      const target = path.join(skill.dir, file);
      return (lstatSync(target).mode & 0o111) !== (data.mode & 0o111) || !readFileSync(target).equals(data.content);
    });
    const item = { name: skill.name, directory: skill.dir, oldCommit: skill.pin, newCommit: repo.commit, status: differs ? dryRun ? "would_update" : "updated" : "up_to_date", files: [] };
    if (differs) {
      item.files = [...new Set([...content.keys(), ...(skill.files ? replaced : existing)].map(targetPath))].sort();
      work.push({ skill, content, replaced, item });
    }
    skills.push(item);
  }
  if (!dryRun) {
    for (const { skill, content, replaced, item } of work) {
      current = skill.name;
      if (!skill.files) {
        for (const entry of readdirSync(skill.dir)) if (entry !== "VENDOR.md") rmSync(path.join(skill.dir, entry), { recursive: true });
      } else {
        for (const file of replaced) rmSync(path.join(skill.dir, file));
      }
      for (const [file, data] of content) {
        const target = path.join(skill.dir, file);
        mkdirSync(path.dirname(target), { recursive: true });
        replaceFile(target, data.content, data.mode);
      }
      if (skill.pin !== item.newCommit) {
        const manifest = skill.text.replace(`- Pinned commit: \`${skill.pin}\``, `- Pinned commit: \`${item.newCommit}\``);
        replaceFile(skill.manifest, manifest, lstatSync(skill.manifest).mode & 0o777);
      }
      completed.push(skill.name);
      current = null;
    }
  }
  console.log(JSON.stringify({ schemaVersion: 1, dryRun, source, skills }));
}

try { main(); } catch (error) {
  const issue = error instanceof CliError ? error : new CliError("operation_failed", error instanceof Error ? error.message : "Sync failed");
  const report = { schemaVersion: 1, error: { code: issue.code, message: issue.message, retryable: issue.exitCode !== 2, suggestions: ["Inspect the source and retry after correcting the error."] }, completed, partialSkill: current };
  console.log(JSON.stringify(report));
  console.error(JSON.stringify(report));
  process.exitCode = issue.exitCode;
}
