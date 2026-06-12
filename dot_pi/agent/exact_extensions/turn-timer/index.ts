/**
 * turn-timer — print the wall-clock duration of every turn.
 *
 * A stopwatch starts when the user submits a prompt (`before_agent_start`, which
 * fires right after submit and before the agent loop spins up) and stops when the
 * agent loop finishes and control returns to the prompt (`agent_end`). The elapsed
 * span is emitted as a tertiary-styled message at the tail of the transcript.
 *
 * Steering messages delivered mid-stream do NOT fire `before_agent_start`, so they
 * never reset the stopwatch — there is exactly one timing message per user-initiated
 * turn. A follow-up message that triggers a fresh agent loop gets its own pair.
 *
 * The timing message is a pure UI ornament: it's stripped from LLM context in the
 * `context` handler so the model never sees it.
 */
import type {
	AgentEndEvent,
	BeforeAgentStartEvent,
	BeforeAgentStartEventResult,
	ContextEvent,
	ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";

import { traceHook } from "../_shared/tracing.ts";
import { formatDuration } from "./_format.ts";

const CUSTOM_TYPE = "turn-timer";

// ANSI "faint" (reduced-intensity) attribute and its reset. theme.fg("dim", …)
// alone resolves too close to body text in light themes, so we layer faint on top
// to push the line further into the background. theme.fg only resets the foreground
// (\x1b[39m), so SGR 2 set before it survives through the color and is cleared by
// SGR 22 here at the end.
const FAINT = "\x1b[2m";
const FAINT_RESET = "\x1b[22m";

type ContextTraceResult = { messages?: ContextEvent["messages"] };

function isTimerMessage(message: unknown): boolean {
	return (
		!!message &&
		typeof message === "object" &&
		(message as { customType?: string }).customType === CUSTOM_TYPE
	);
}

export default function (pi: ExtensionAPI) {
	// Wall-clock start of the current turn, or null when no turn is in flight.
	let turnStartMs: number | null = null;

	// Render timing messages in the most subdued ("tertiary") treatment.
	pi.registerMessageRenderer<{ ms: number }>(CUSTOM_TYPE, (message, _options, theme) => {
		const text = typeof message.content === "string" ? message.content : "";
		const styled = `${FAINT}${theme.fg("dim", text)}${FAINT_RESET}`;
		// Right-align with a one-column right margin. Width is only known at render
		// time, so we pad left here; visibleWidth ignores ANSI so the faint/color
		// codes don't inflate the measurement.
		return {
			render(width: number): string[] {
				const pad = width - visibleWidth(styled) - 1;
				return [pad > 0 ? " ".repeat(pad) + styled : styled];
			},
			invalidate() {},
		};
	});

	// Keep timing messages out of LLM context. The context event hands us raw
	// AgentMessages (role "custom") before they're converted to LLM user messages.
	pi.on(
		"context",
		traceHook<ContextEvent, ContextTraceResult>(pi, "turn-timer.context", (event) => {
			const filtered = event.messages.filter((m) => !isTimerMessage(m));
			if (filtered.length === event.messages.length) return;
			return { messages: filtered };
		}),
	);

	pi.on(
		"before_agent_start",
		traceHook<BeforeAgentStartEvent, BeforeAgentStartEventResult>(pi, "turn-timer.before_agent_start", () => {
			turnStartMs = Date.now();
		}),
	);

	pi.on(
		"agent_end",
		traceHook<AgentEndEvent>(pi, "turn-timer.agent_end", (_event, ctx) => {
			const startedAt = turnStartMs;
			turnStartMs = null;
			if (startedAt === null) return;
			if (!ctx.hasUI) return;

			const elapsedMs = Date.now() - startedAt;
			const content = `⏱ ${formatDuration(elapsedMs)}`;

			// agent_end fires while the agent is *still streaming* — the run loop drains
			// its queues only after emitting agent_end. Calling sendMessage now would be
			// treated as a steer (sendCustomMessage routes to agent.steer() while
			// streaming), triggering a spurious extra LLM round AND, once the context
			// filter strips the steered message, leaving the conversation ending on an
			// assistant message (a hard 400 from Anthropic). Defer until the loop has
			// fully unwound and the agent is idle, where sendMessage cleanly appends a
			// display-only entry with no turn. A setTimeout(0) macrotask runs after the
			// loop's promise continuations settle, so the first attempt is normally idle;
			// the bounded poll only matters if a follow-up continuation is still draining.
			const emitWhenIdle = (attemptsLeft: number): void => {
				if (ctx.isIdle()) {
					pi.sendMessage(
						{ customType: CUSTOM_TYPE, content, display: true, details: { ms: elapsedMs } },
						{ triggerTurn: false },
					);
					return;
				}
				if (attemptsLeft <= 0) return;
				setTimeout(() => emitWhenIdle(attemptsLeft - 1), 25);
			};
			setTimeout(() => emitWhenIdle(20), 0);
		}),
	);
}
