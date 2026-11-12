import type { ModelIdentity } from "./_models.ts";

export type RecoveryTurnResult = { status: "settled" | "cancelled"; model: ModelIdentity | undefined };

export type SessionRecovery = {
  /** True while the session model runs a recovery turn; the coordinator allows session input only then. */
  readonly recovering: boolean;
  /** Call from the `agent_settled` handler. */
  onSettled(): void;
  run(prompt: string, signal: AbortSignal | undefined): Promise<RecoveryTurnResult>;
};

const DEFAULT_ABORT_GRACE_MS = 10_000;

// Runs one session-model turn for a user-chosen recovery. The turn ends at `agent_settled`, not `ctx.waitForIdle()`,
// because waitForIdle can return before a turn queued with sendUserMessage starts.
export function createSessionRecovery(options: {
  send(prompt: string): void;
  abort(): void;
  model(): ModelIdentity | undefined;
  graceMs?: number;
}): SessionRecovery {
  let recovering = false;
  const waiters: Array<() => void> = [];

  return {
    get recovering() {
      return recovering;
    },
    onSettled() {
      for (const resolve of waiters.splice(0)) resolve();
    },
    async run(prompt, signal) {
      const settled = new Promise<void>((resolve) => waiters.push(resolve));
      recovering = true;
      try {
        options.send(prompt);
        const outcome = await new Promise<"settled" | "cancelled">((resolve) => {
          if (signal?.aborted) return resolve("cancelled");
          const onAbort = () => resolve("cancelled");
          signal?.addEventListener("abort", onAbort, { once: true });
          void settled.then(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve("settled");
          });
        });
        if (outcome === "cancelled") {
          options.abort();
          // deliberate: wait a bounded time for the aborted turn to settle; a turn that never settles must not hold the run open.
          let timer: ReturnType<typeof setTimeout> | undefined;
          await Promise.race([settled, new Promise<void>((resolve) => {
            timer = setTimeout(resolve, options.graceMs ?? DEFAULT_ABORT_GRACE_MS);
          })]);
          clearTimeout(timer);
        }
        return { status: outcome, model: options.model() };
      } finally {
        recovering = false;
      }
    },
  };
}
