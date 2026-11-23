import { randomUUID } from "node:crypto";
import { existsSync, renameSync, unlinkSync, writeFileSync } from "node:fs";

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
