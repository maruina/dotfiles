#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const deprecatedPattern = /@mariozechner\/(?:pi-ai|pi-coding-agent|pi-tui|pi-agent-core)/;
const roots = ["package.json", "package-lock.json", "exact_extensions", "extensions"];
const extensions = new Set([".ts", ".tmpl", ".json"]);

function walk(target, files = []) {
  let stats;
  try {
    stats = statSync(target);
  } catch {
    return files;
  }

  if (stats.isDirectory()) {
    for (const name of readdirSync(target)) {
      walk(path.join(target, name), files);
    }
  } else if (extensions.has(path.extname(target))) {
    files.push(target);
  }
  return files;
}

const errors = [];
for (const file of roots.flatMap((root) => walk(root))) {
  const text = readFileSync(file, "utf8");
  if (deprecatedPattern.test(text)) {
    errors.push(`${file}: contains deprecated @mariozechner/pi-* reference`);
  }
}

if (errors.length > 0) {
  console.error("Deprecated Pi dependency validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Deprecated Pi dependency validation passed.");
