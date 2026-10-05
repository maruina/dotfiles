export interface DeliveryState {
  discovered: Set<string>;
  pending: Set<string>;
  directPending: Map<string, string>;
  loaded: Set<string>;
}

export function createState(): DeliveryState {
  return { discovered: new Set(), pending: new Set(), directPending: new Map(), loaded: new Set() };
}

/** Queue paths for injection and return only paths not already loaded or pending. */
export function discover(state: DeliveryState, paths: readonly string[]): void {
  for (const path of paths) state.discovered.add(path);
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
    state.loaded.add(path);
    delivered.push(path);
  }
  return delivered;
}

export function confirmDelivered(state: DeliveryState, paths: readonly string[]): void {
  for (const path of paths) {
    state.discovered.add(path);
    state.pending.delete(path);
    state.loaded.add(path);
  }
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
