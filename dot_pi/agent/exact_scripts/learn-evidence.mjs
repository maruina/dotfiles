#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseSessionEntries } from "@earendil-works/pi-coding-agent";

const SCHEMA_VERSION = 1;
const DEFAULT_SEARCH_LIMIT = 50;
const DEFAULT_ANCESTOR_LIMIT = 8;
const DEFAULT_DESCENDANT_LIMIT = 8;
const EXCERPT_LIMIT = 500;

function error(code, message, suggestions) {
  return { schemaVersion: SCHEMA_VERSION, error: { code, message, retryable: false, suggestions } };
}

function assertDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("invalid date");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("invalid date");
  return date;
}

function dateParts(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

function localMidnightIso(date, timezone) {
  const local = assertDate(date);
  const localMillis = local.getTime();
  const guess = new Date(localMillis);
  let parts;
  try {
    parts = dateParts(guess, timezone);
  } catch {
    throw new Error("invalid timezone");
  }
  const shownMillis = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return new Date(localMillis - (shownMillis - guess.getTime())).toISOString();
}

export function calculateDayWindow(date, timezone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  assertDate(date);
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const endDate = next.toISOString().slice(0, 10);
  const startIso = localMidnightIso(date, timezone);
  const endIso = localMidnightIso(endDate, timezone);
  return {
    localDate: date,
    timezone,
    startIso,
    endIso,
    searchStartDate: startIso.slice(0, 10),
    searchEndDate: endIso.slice(0, 10),
  };
}

function walkSessionFiles(directory, files = []) {
  for (const name of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, name.name);
    if (name.isDirectory()) walkSessionFiles(file, files);
    else if (name.isFile() && name.name.endsWith(".jsonl")) files.push(file);
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function malformedLineCount(content) {
  return content.split(/\r?\n/).filter((line) => line.trim()).filter((line) => {
    try {
      JSON.parse(line);
      return false;
    } catch {
      return true;
    }
  }).length;
}

function sessionFile(pathname) {
  const content = readFileSync(pathname, "utf8");
  const entries = parseSessionEntries(content);
  const header = entries.find((entry) => entry?.type === "session");
  if (!header || typeof header.id !== "string") throw new Error("missing session header");
  return { header, entries, malformedLines: malformedLineCount(content) };
}

function sessionFiles(sessionDir) {
  if (!sessionDir || !existsSync(sessionDir) || !statSync(sessionDir).isDirectory()) {
    throw new Error("invalid session directory");
  }
  const files = walkSessionFiles(sessionDir);
  const errors = [];
  const sessions = [];
  for (const pathname of files) {
    try {
      const parsed = sessionFile(pathname);
      if (parsed.malformedLines > 0) {
        errors.push({ code: "malformed_session_lines", path: pathname, message: `${parsed.malformedLines} malformed JSONL line(s) were skipped.` });
      }
      sessions.push({ path: pathname, ...parsed });
    } catch (cause) {
      errors.push({ code: "invalid_session_file", path: pathname, message: cause instanceof Error ? cause.message : "Unable to parse session file." });
    }
  }
  return { files, sessions, errors };
}

function textBlocks(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((block) => block && block.type === "text" && typeof block.text === "string").map((block) => block.text).join("\n");
}

function entryDetails(entry, pathname, cwd) {
  const role = entry.type === "message" ? entry.message?.role : undefined;
  return {
    path: pathname,
    cwd,
    id: entry.id,
    parentId: entry.parentId ?? null,
    timestamp: entry.timestamp,
    type: entry.type,
    ...(role ? { role } : {}),
    ...(entry.type === "message" ? { text: textBlocks(entry.message?.content).slice(0, EXCERPT_LIMIT) } : {}),
  };
}

function validEntry(entry) {
  return entry && entry.type !== "session" && typeof entry.id === "string" && typeof entry.timestamp === "string";
}

function entryTime(entry) {
  const time = new Date(entry.timestamp).getTime();
  return Number.isNaN(time) ? null : time;
}

function sortEntries(items) {
  return items.sort((left, right) => left.timestamp.localeCompare(right.timestamp) || left.path.localeCompare(right.path) || left.id.localeCompare(right.id));
}

function sourcesEnvelope(files, errors) {
  return { total: files.length, returned: files.length, truncated: false, errors };
}

export function collectSessionsWindow({ sessionDir, date, timezone }) {
  const window = calculateDayWindow(date, timezone);
  const { files, sessions, errors } = sessionFiles(sessionDir);
  const start = new Date(window.startIso).getTime();
  const end = new Date(window.endIso).getTime();
  const seen = new Set();
  const items = [];
  for (const session of sessions) {
    for (const entry of session.entries) {
      if (!validEntry(entry)) continue;
      const timestamp = entryTime(entry);
      if (timestamp === null || timestamp < start || timestamp >= end) continue;
      const key = `${session.path}\0${entry.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(entryDetails(entry, session.path, session.header.cwd));
    }
  }
  sortEntries(items);
  return {
    schemaVersion: SCHEMA_VERSION,
    window,
    sources: sourcesEnvelope(files, errors),
    entries: { total: items.length, returned: items.length, truncated: false, items },
    errors,
  };
}

function validateTerms(terms) {
  if (!Array.isArray(terms) || terms.length === 0 || terms.some((term) => typeof term !== "string" || !term.trim())) {
    throw new Error("invalid search terms");
  }
  return terms.map((term) => term.trim().toLocaleLowerCase());
}

export function searchSessions({ sessionDir, terms, limit = DEFAULT_SEARCH_LIMIT }) {
  const normalizedTerms = validateTerms(terms);
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("invalid result limit");
  const { files, sessions, errors } = sessionFiles(sessionDir);
  const matches = [];
  for (const session of sessions) {
    for (const entry of session.entries) {
      if (!validEntry(entry) || entry.type !== "message" || entry.message?.role === "custom") continue;
      const text = textBlocks(entry.message?.content);
      const haystack = text.toLocaleLowerCase();
      if (!text || !normalizedTerms.every((term) => haystack.includes(term))) continue;
      matches.push(entryDetails(entry, session.path, session.header.cwd));
    }
  }
  sortEntries(matches);
  return {
    schemaVersion: SCHEMA_VERSION,
    sources: sourcesEnvelope(files, errors),
    terms: normalizedTerms,
    matches: {
      total: matches.length,
      returned: Math.min(matches.length, limit),
      truncated: matches.length > limit,
      items: matches.slice(0, limit),
    },
    errors,
  };
}

export function sessionContext({ path: pathname, entryIds, ancestorLimit = DEFAULT_ANCESTOR_LIMIT, descendantLimit = DEFAULT_DESCENDANT_LIMIT }) {
  if (!pathname || !existsSync(pathname) || !statSync(pathname).isFile() || path.extname(pathname) !== ".jsonl") throw new Error("invalid session path");
  if (!Array.isArray(entryIds) || entryIds.length === 0 || entryIds.some((id) => typeof id !== "string" || !id)) throw new Error("invalid entry IDs");
  if (![ancestorLimit, descendantLimit].every((limit) => Number.isSafeInteger(limit) && limit >= 0)) throw new Error("invalid context limit");
  const session = sessionFile(pathname);
  const entries = session.entries.filter(validEntry);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const children = new Map();
  for (const entry of entries) {
    if (!entry.parentId) continue;
    const values = children.get(entry.parentId) ?? [];
    values.push(entry);
    children.set(entry.parentId, values);
  }
  const selected = new Set();
  for (const id of entryIds) {
    let current = byId.get(id);
    for (let depth = 0; current && depth <= ancestorLimit; depth += 1) {
      selected.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    const queue = [...(children.get(id) ?? [])];
    let descendants = 0;
    while (queue.length > 0 && descendants < descendantLimit) {
      const child = queue.shift();
      selected.add(child.id);
      descendants += 1;
      queue.push(...(children.get(child.id) ?? []));
    }
  }
  const all = sortEntries(entries.filter((entry) => selected.has(entry.id)).map((entry) => entryDetails(entry, pathname, session.header.cwd)));
  return {
    schemaVersion: SCHEMA_VERSION,
    source: { path: pathname, total: entries.length, errors: session.malformedLines ? [{ code: "malformed_session_lines", path: pathname }] : [] },
    context: { total: all.length, returned: all.length, truncated: false, items: all },
  };
}

function learningSections(markdown) {
  const matches = [...markdown.matchAll(/^##\s+(.+?)\s*$/gm)];
  return matches.map((match, index) => ({
    title: match[1].trim(),
    content: markdown.slice(match.index, matches[index + 1]?.index ?? markdown.length).trim(),
  }));
}

export function selectLearningSections(markdown, terms) {
  const normalizedTerms = validateTerms(terms);
  const sections = learningSections(markdown);
  const matched = sections.filter((section) => {
    const haystack = section.content.toLocaleLowerCase();
    return normalizedTerms.some((term) => haystack.includes(term));
  });
  return {
    schemaVersion: SCHEMA_VERSION,
    terms: normalizedTerms,
    sections: { total: sections.length, returned: matched.length, truncated: false, items: matched },
  };
}

function usage() {
  return `Usage: learn-evidence.mjs <command> [options]\n\nCommands:\n  sessions-window --session-dir <directory> --date <YYYY-MM-DD> [--timezone <IANA zone>]\n  sessions-search --session-dir <directory> --term <term> [--term <term>] [--limit <count>]\n  session-context --path <session.jsonl> --entry-id <id> [--entry-id <id>] [--ancestor-limit <count>] [--descendant-limit <count>]\n  learning-sections --term <term> [--term <term>] < markdown`; 
}

function parseArguments(args) {
  const command = args.shift();
  if (!command || command === "--help" || command === "-h") return { command: "help", values: new Map() };
  const values = new Map();
  while (args.length > 0) {
    const flag = args.shift();
    if (!flag?.startsWith("--")) throw new Error("invalid arguments");
    const value = args.shift();
    if (value === undefined || value.startsWith("--")) throw new Error("invalid arguments");
    const existing = values.get(flag) ?? [];
    existing.push(value);
    values.set(flag, existing);
  }
  return { command, values };
}

function one(values, flag) {
  const valuesForFlag = values.get(flag) ?? [];
  if (valuesForFlag.length !== 1) throw new Error("invalid arguments");
  return valuesForFlag[0];
}

function optionalOne(values, flag, fallback) {
  const valuesForFlag = values.get(flag) ?? [];
  if (valuesForFlag.length === 0) return fallback;
  if (valuesForFlag.length !== 1) throw new Error("invalid arguments");
  return valuesForFlag[0];
}

function numeric(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error("invalid arguments");
  return parsed;
}

function invalidArguments() {
  return error("invalid_arguments", "--session-dir must be an existing directory", ["Pass --session-dir <directory> and --date YYYY-MM-DD."]);
}

function main() {
  let parsed;
  try {
    parsed = parseArguments(process.argv.slice(2));
    if (parsed.command === "help") {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    let result;
    if (parsed.command === "sessions-window") {
      const sessionDir = one(parsed.values, "--session-dir");
      if (!existsSync(sessionDir) || !statSync(sessionDir).isDirectory()) throw new Error("invalid arguments");
      result = collectSessionsWindow({ sessionDir, date: one(parsed.values, "--date"), timezone: optionalOne(parsed.values, "--timezone", Intl.DateTimeFormat().resolvedOptions().timeZone) });
    } else if (parsed.command === "sessions-search") {
      result = searchSessions({ sessionDir: one(parsed.values, "--session-dir"), terms: parsed.values.get("--term") ?? [], limit: numeric(optionalOne(parsed.values, "--limit", String(DEFAULT_SEARCH_LIMIT))) });
    } else if (parsed.command === "session-context") {
      result = sessionContext({ path: one(parsed.values, "--path"), entryIds: parsed.values.get("--entry-id") ?? [], ancestorLimit: numeric(optionalOne(parsed.values, "--ancestor-limit", String(DEFAULT_ANCESTOR_LIMIT))), descendantLimit: numeric(optionalOne(parsed.values, "--descendant-limit", String(DEFAULT_DESCENDANT_LIMIT))) });
    } else if (parsed.command === "learning-sections") {
      result = selectLearningSections(readFileSync(0, "utf8"), parsed.values.get("--term") ?? []);
    } else {
      throw new Error("invalid arguments");
    }
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch {
    process.stderr.write(`${JSON.stringify(invalidArguments())}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
