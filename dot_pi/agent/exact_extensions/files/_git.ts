export type ParsedGitStatusEntry = {
  status: string;
  path: string;
};

const splitNullSeparated = (value: string): string[] =>
  value.split("\0").filter(Boolean);

/**
 * Parse `git status --porcelain=1 -z` output.
 *
 * For rename/copy entries, porcelain v1 emits the current path in the status
 * entry and the source path as the next NUL-delimited field. The UI should act
 * on the current path.
 */
export function parseGitStatusPorcelainZ(raw: string): ParsedGitStatusEntry[] {
  const results: ParsedGitStatusEntry[] = [];
  const entries = splitNullSeparated(raw);

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (!entry || entry.length < 4) continue;

    const status = entry.slice(0, 2);
    const statusLabel = status.replace(/\s/g, "") || status.trim();
    const filePath = entry.slice(3);

    if ((status.startsWith("R") || status.startsWith("C")) && entries[i + 1]) {
      i += 1;
    }

    if (!filePath) continue;
    results.push({ status: statusLabel, path: filePath });
  }

  return results;
}
