import { randomUUID } from "node:crypto";
import { existsSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

export function isPathInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (!rel.startsWith("..") && rel !== ".." && !isAbsolute(rel));
}

export function writeAtomicJson(
  filePath: string,
  value: unknown,
  options?: { mode?: number; trailingNewline?: boolean },
): void {
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  const payload = JSON.stringify(value) + (options?.trailingNewline ? "\n" : "");
  try {
    writeFileSync(temporary, payload, { flag: "wx", mode: options?.mode ?? 0o600 });
    renameSync(temporary, filePath);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}
