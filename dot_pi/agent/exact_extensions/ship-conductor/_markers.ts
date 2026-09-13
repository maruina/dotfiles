/**
 * Terminal markers emitted by the execute and verify stages. The conductor
 * parses these from the final assistant message of each subprocess; absent or
 * inconsistent markers are hard stops, never guesses.
 */

export type ExecuteMarker = {
  name: string;
  id: string;
};

// Greedy name and a paren-free id: model names contain parentheses
// (e.g. `GLM-5.3 (Baseten) (baseten/zai-org/GLM-5.3)`), so a lazy name group
// would swallow part of the id.
const EXECUTE_MARKER_RE = /^Implementation model: `(.+) \(([^()`]+)\)`$/;

export function parseExecuteMarker(text: string): ExecuteMarker | undefined {
  let marker: ExecuteMarker | undefined;
  for (const line of text.split("\n")) {
    const match = line.match(EXECUTE_MARKER_RE);
    if (match) marker = { name: match[1], id: match[2] };
  }
  return marker;
}

// The verify prompt mandates the verdict as the last line of the report, so
// only the final non-blank line counts. A `VERIFIED`/`BLOCKED` line embedded
// earlier in the message is a false positive, not a verdict.
export function parseVerifyVerdict(text: string): "VERIFIED" | "BLOCKED" | undefined {
  const lines = text.trimEnd().split("\n");
  const last = lines[lines.length - 1]?.trim();
  if (last === "VERIFIED" || last === "BLOCKED") return last;
  return undefined;
}
