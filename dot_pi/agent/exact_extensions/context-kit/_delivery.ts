export interface DeliveryState {
  discovered: Set<string>;
  pending: Set<string>;
  directPending: Map<string, string>;
  loaded: Set<string>;
}

export interface DeliveryStateSnapshot {
  version: 1;
  discovered: string[];
  loaded: string[];
}

export interface BranchEntryLike {
  type: string;
  customType?: string;
  data?: unknown;
}

export const STATE_ENTRY_TYPE = "context-kit-state";

export function createState(): DeliveryState {
  return { discovered: new Set(), pending: new Set(), directPending: new Map(), loaded: new Set() };
}

/** Queue paths for injection and return only paths not already loaded or pending. */
export function discover(state: DeliveryState, paths: readonly string[]): boolean {
  let changed = false;
  for (const path of paths) {
    if (!state.discovered.has(path)) {
      state.discovered.add(path);
      changed = true;
    }
  }
  return changed;
}

export function queue(state: DeliveryState, paths: readonly string[]): string[] {
  const queued: string[] = [];
  const directPending = new Set(state.directPending.values());
  discover(state, paths);
  for (const path of paths) {
    if (state.loaded.has(path) || state.pending.has(path) || directPending.has(path)) continue;
    state.pending.add(path);
    queued.push(path);
  }
  return queued;
}

export function recordDirectPending(state: DeliveryState, toolCallId: string, path: string): void {
  state.discovered.add(path);
  state.pending.delete(path);
  state.directPending.set(toolCallId, path);
}

export function confirmDirectDelivery(state: DeliveryState, toolCallIds: readonly string[]): string[] {
  const delivered: string[] = [];
  for (const toolCallId of toolCallIds) {
    const path = state.directPending.get(toolCallId);
    if (path === undefined) continue;
    state.directPending.delete(toolCallId);
    state.pending.delete(path);
    state.discovered.add(path);
    if (state.loaded.has(path)) continue;
    state.loaded.add(path);
    delivered.push(path);
  }
  return delivered;
}

export function confirmDelivered(state: DeliveryState, paths: readonly string[]): boolean {
  let changed = false;
  for (const path of paths) {
    if (!state.discovered.has(path)) {
      state.discovered.add(path);
      changed = true;
    }
    state.pending.delete(path);
    if (!state.loaded.has(path)) {
      state.loaded.add(path);
      changed = true;
    }
  }
  return changed;
}

export function blockingPaths(
  state: DeliveryState,
  applicable: readonly string[],
  inPrompt: ReadonlySet<string>,
): string[] {
  return applicable.filter((path) => !inPrompt.has(path) && !state.loaded.has(path));
}

export function clearPending(state: DeliveryState): void {
  state.pending.clear();
  state.directPending.clear();
}

export function snapshotState(state: DeliveryState): DeliveryStateSnapshot {
  return { version: 1, discovered: [...state.discovered], loaded: [...state.loaded] };
}

export function rebuildFromBranch(entries: readonly BranchEntryLike[]): DeliveryState {
  let snapshot: DeliveryStateSnapshot | null = null;
  for (const entry of entries) {
    if (entry.type !== "custom" || entry.customType !== STATE_ENTRY_TYPE) continue;
    snapshot = parseSnapshot(entry.data);
  }
  if (!snapshot) return createState();
  const state = createState();
  state.discovered = new Set(snapshot.discovered);
  state.loaded = new Set(snapshot.loaded);
  return state;
}

export function compactionReset(state: DeliveryState): string[] {
  state.loaded.clear();
  clearPending(state);
  return [...state.discovered];
}

function parseSnapshot(value: unknown): DeliveryStateSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Partial<DeliveryStateSnapshot>;
  if (
    snapshot.version !== 1 ||
    !Array.isArray(snapshot.discovered) ||
    !Array.isArray(snapshot.loaded) ||
    !snapshot.discovered.every((path) => typeof path === "string") ||
    !snapshot.loaded.every((path) => typeof path === "string")
  ) return null;
  return snapshot as DeliveryStateSnapshot;
}
