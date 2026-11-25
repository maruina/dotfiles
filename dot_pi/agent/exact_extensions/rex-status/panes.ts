import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execRexJson, isRexId } from "../_shared/rex.ts";

const TERMINAL_CREATOR = "com.superlogical.terminal";
const INSPECT_CONCURRENCY = 6;

export type RexExecJson = <T = unknown>(args: string[]) => Promise<T>;

export interface RexPane {
  sessionId: string;
  sessionLabel: string;
  windowId: string;
  windowLabel: string;
  tabIndex: number;
  blockId: string;
  blockLabel: string;
  position: string;
  isCurrentSession: boolean;
  isCurrentPane: boolean;
  isActiveTab: boolean;
  isFocusedPane: boolean;
}

interface RexWhoami {
  session_id?: unknown;
  block_id?: unknown;
}

interface RexSessionSummary {
  session_id?: unknown;
  label?: unknown;
}

interface RexSessionList {
  sessions?: RexSessionSummary[];
}

interface RexLayoutSplit {
  direction?: unknown;
  before?: RexLayoutNode;
  after?: RexLayoutNode;
}

interface RexLayoutNode {
  block_id?: unknown;
  split?: RexLayoutSplit;
}

interface RexBlock {
  block_id?: unknown;
  label?: unknown;
  creator_name?: unknown;
}

interface RexLayer {
  kind?: unknown;
  layout?: RexLayoutNode;
  blocks?: RexBlock[];
}

interface RexWindow {
  window_id?: unknown;
  label?: unknown;
  focused_block_id?: unknown;
  layers?: RexLayer[];
}

interface RexSessionInspect {
  session_id?: unknown;
  label?: unknown;
  active_window_id?: unknown;
  windows?: RexWindow[];
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function formatSplitPosition(steps: string[]): string {
  if (steps.length === 0) return "";
  if (steps.length === 1) return steps[0];
  if (steps.length === 2) {
    const [first, second] = steps;
    const firstVertical = first === "top" || first === "bottom";
    const secondVertical = second === "top" || second === "bottom";
    if (firstVertical !== secondVertical) {
      const vertical = firstVertical ? first : second;
      const horizontal = firstVertical ? second : first;
      return `${vertical}-${horizontal}`;
    }
  }
  return steps.join(" / ");
}

export function collectLayoutPositions(
  node: RexLayoutNode | undefined,
  steps: string[] = [],
  out: Map<string, string> = new Map(),
): Map<string, string> {
  if (!node || typeof node !== "object") return out;
  if (isRexId("block", node.block_id)) {
    out.set(node.block_id, formatSplitPosition(steps));
    return out;
  }
  const split = node.split;
  if (!split || typeof split !== "object") return out;
  const beforeDir = split.direction === "vertical" ? "top" : "left";
  const afterDir = split.direction === "vertical" ? "bottom" : "right";
  collectLayoutPositions(split.before, [...steps, beforeDir], out);
  collectLayoutPositions(split.after, [...steps, afterDir], out);
  return out;
}

export function extractSessionPanes(
  session: RexSessionInspect,
  current: { sessionId?: string; blockId?: string } = {},
): RexPane[] {
  if (!isRexId("session", session.session_id)) return [];
  const sessionId = session.session_id;
  const sessionLabel = nonEmptyString(session.label) ?? sessionId;
  const activeWindowId = isRexId("window", session.active_window_id) ? session.active_window_id : undefined;
  const windows = Array.isArray(session.windows) ? session.windows : [];
  const panes: RexPane[] = [];

  for (let i = 0; i < windows.length; i++) {
    const win = windows[i];
    if (!win || !isRexId("window", win.window_id)) continue;
    const tabIndex = i + 1;
    const windowId = win.window_id;
    const windowLabel = nonEmptyString(win.label) ?? `tab ${tabIndex}`;
    const focusedBlockId = isRexId("block", win.focused_block_id) ? win.focused_block_id : undefined;
    const layers = Array.isArray(win.layers) ? win.layers : [];

    for (const layer of layers) {
      if (!layer || typeof layer !== "object") continue;
      const isFloating = layer.kind === "floating";
      const positions = isFloating ? new Map<string, string>() : collectLayoutPositions(layer.layout);
      const blocks = Array.isArray(layer.blocks) ? layer.blocks : [];

      for (const block of blocks) {
        if (!block || !isRexId("block", block.block_id)) continue;
        if (typeof block.creator_name === "string" && block.creator_name !== TERMINAL_CREATOR) continue;
        const blockId = block.block_id;
        panes.push({
          sessionId,
          sessionLabel,
          windowId,
          windowLabel,
          tabIndex,
          blockId,
          blockLabel: nonEmptyString(block.label) ?? "terminal",
          position: isFloating ? "floating" : (positions.get(blockId) ?? ""),
          isCurrentSession: sessionId === current.sessionId,
          isCurrentPane: blockId === current.blockId,
          isActiveTab: windowId === activeWindowId,
          isFocusedPane: blockId === focusedBlockId,
        });
      }
    }
  }

  return panes;
}

export function sortRexPanes(panes: RexPane[]): RexPane[] {
  const rank = (pane: RexPane): number => {
    if (!pane.isCurrentSession) return 3;
    if (pane.isCurrentPane) return 2;
    if (pane.isActiveTab) return 0;
    return 1;
  };
  return panes
    .map((pane, index) => ({ pane, index }))
    .sort((a, b) => rank(a.pane) - rank(b.pane) || a.index - b.index)
    .map((entry) => entry.pane);
}

async function mapBounded<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

export function createRexExecJson(
  pi: Pick<ExtensionAPI, "exec">,
  endpoint: string | undefined = process.env.REX_SERVER,
): RexExecJson {
  return <T = unknown>(args: string[]) =>
    execRexJson<T>(pi, args, {
      endpoint: endpoint || undefined,
      timeoutSec: 5,
      execTimeoutMs: 7000,
    });
}

export async function listRexPanes(execJson: RexExecJson): Promise<RexPane[]> {
  const [whoamiResult, listResult] = await Promise.allSettled([
    execJson<RexWhoami>(["whoami", "--json"]),
    execJson<RexSessionList>(["ls", "--json"]),
  ]);

  if (listResult.status === "rejected") {
    throw listResult.reason instanceof Error
      ? listResult.reason
      : new Error("Could not list Rex sessions.");
  }

  const whoami = whoamiResult.status === "fulfilled" ? whoamiResult.value : undefined;
  const current = {
    sessionId: isRexId("session", whoami?.session_id) ? whoami.session_id : undefined,
    blockId: isRexId("block", whoami?.block_id) ? whoami.block_id : undefined,
  };

  const sessionIds = (listResult.value?.sessions ?? [])
    .map((session) => session?.session_id)
    .filter((id): id is string => isRexId("session", id));

  const inspected = await mapBounded(sessionIds, INSPECT_CONCURRENCY, async (sessionId) => {
    try {
      return await execJson<RexSessionInspect>(["session", "inspect", sessionId, "--json"]);
    } catch {
      return undefined;
    }
  });

  const panes: RexPane[] = [];
  for (const session of inspected) {
    if (session) panes.push(...extractSessionPanes(session, current));
  }
  return sortRexPanes(panes);
}

export function formatRexPaneLocation(pane: RexPane): string {
  const defaultTabLabel = `tab ${pane.tabIndex}`;
  const tab = pane.windowLabel && pane.windowLabel !== defaultTabLabel
    ? `${defaultTabLabel} (${pane.windowLabel})`
    : defaultTabLabel;
  const paneDesc = pane.position ? `${pane.blockLabel} (${pane.position})` : pane.blockLabel;
  return `${pane.sessionLabel} / ${tab} / ${paneDesc}`;
}

export function formatRexPaneReference(pane: RexPane): string {
  return `Rex pane: ${formatRexPaneLocation(pane)} (\`-s ${pane.sessionId} -b ${pane.blockId}\`)`;
}
