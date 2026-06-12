import type { ExtensionAPI, ExtensionContext, ExtensionHandler } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

export const TRACE_EVENT_CHANNEL = "mat-brown-pi:trace";

export type TraceAttributeValue = string | number | boolean | null;
export type TraceAttributes = Record<string, TraceAttributeValue>;

export type TraceBusEvent = {
  kind: "span_start" | "span_end" | "error";
  sessionId: string;
  monotonicMs: number;
  name: string;
  spanId: string;
  durationMs?: number;
  attrs?: TraceAttributes;
};

type TraceEmitter = Pick<ExtensionAPI, "events">;

export function traceHook<E, R = undefined>(
  pi: TraceEmitter,
  name: string,
  handler: ExtensionHandler<E, R>,
): ExtensionHandler<E, R> {
  return async (event: E, context: ExtensionContext) => {
    const spanId = randomUUID();
    const startedAt = performance.now();
    emitTrace(pi, {
      kind: "span_start",
      sessionId: context.sessionManager.getSessionId(),
      monotonicMs: startedAt,
      name,
      spanId,
      attrs: eventAttrs(event),
    });

    try {
      const result = await handler(event, context);
      emitTrace(pi, {
        kind: "span_end",
        sessionId: context.sessionManager.getSessionId(),
        monotonicMs: performance.now(),
        name,
        spanId,
        durationMs: performance.now() - startedAt,
        attrs: { ok: true },
      });
      return result;
    } catch (error) {
      emitTrace(pi, {
        kind: "error",
        sessionId: context.sessionManager.getSessionId(),
        monotonicMs: performance.now(),
        name,
        spanId,
        durationMs: performance.now() - startedAt,
        attrs: {
          ok: false,
          errorName: error instanceof Error ? error.name : typeof error,
        },
      });
      throw error;
    }
  };
}

export function emitTrace(pi: TraceEmitter, event: TraceBusEvent): void {
  try {
    pi.events.emit(TRACE_EVENT_CHANNEL, event);
  } catch {
    // Tracing must not affect extension behavior.
  }
}

function eventAttrs(event: unknown): TraceAttributes | undefined {
  if (!event || typeof event !== "object") return undefined;
  const type = (event as { type?: unknown }).type;
  return typeof type === "string" ? { event: type } : undefined;
}
