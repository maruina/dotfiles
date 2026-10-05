export interface DeliveryState {
  discovered: Set<string>;
  pending: Set<string>;
  loaded: Set<string>;
}

export function createState(): DeliveryState {
  return { discovered: new Set(), pending: new Set(), loaded: new Set() };
}

/** Queue paths for injection and return only paths not already loaded or pending. */
export function discover(state: DeliveryState, paths: readonly string[]): void {
  for (const path of paths) state.discovered.add(path);
}

export function queue(state: DeliveryState, paths: readonly string[]): string[] {
  const queued: string[] = [];
  discover(state, paths);
  for (const path of paths) {
    if (state.loaded.has(path) || state.pending.has(path)) continue;
    state.pending.add(path);
    queued.push(path);
  }
  return queued;
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
}
