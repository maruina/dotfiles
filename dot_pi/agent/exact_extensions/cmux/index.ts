/**
 * cmux extension for @mat-brown/pi.
 *
 * Wires Pi lifecycle hooks to cmux sidebar status badges and native macOS
 * notifications via the cmux Unix socket. Silent no-op when cmux isn't running
 * or the required env vars are absent.
 *
 * Required env vars (set automatically by cmux):
 *   CMUX_SOCKET_PATH (or CMUX_SOCKET)   — path to the cmux control socket
 *   CMUX_WORKSPACE_ID                   — current workspace UUID
 *   CMUX_SURFACE_ID                     — current surface/pane UUID
 *
 * Optional:
 *   CMUX_SOCKET_PASSWORD                — auth password (or use the password file)
 *   DEBUG=cmux                          — enable debug logging
 *
 * Other extensions emit cmux:notify, cmux:set-status, cmux:lock-status, and
 * cmux:unlock-status on pi.events; this extension listens and forwards them —
 * zero coupling the other way. Nothing in-tree currently emits these events
 * (the feature/pair/foreground workflow extensions that used to drive the
 * badge were removed), so the listeners sit idle until an external extension
 * opts in.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { BADGE_STATES, CmuxClient } from "./_client.js";

interface CmuxNotifyPayload {
	title: string;
	subtitle?: string;
	body?: string;
}

interface CmuxSetStatusPayload {
	value: string;
	icon?: string;
	color?: string;
}

/** Payload for cmux:lock-status — sets badge AND records a locked value. */
interface CmuxLockStatusPayload {
	value: string;
	icon?: string;
	color?: string;
}

function isNotifyPayload(data: unknown): data is CmuxNotifyPayload {
	return (
		typeof data === "object" &&
		data !== null &&
		typeof (data as { title?: unknown }).title === "string"
	);
}

function isSetStatusPayload(data: unknown): data is CmuxSetStatusPayload {
	return (
		typeof data === "object" &&
		data !== null &&
		typeof (data as { value?: unknown }).value === "string"
	);
}

function isLockStatusPayload(data: unknown): data is CmuxLockStatusPayload {
	return (
		typeof data === "object" &&
		data !== null &&
		typeof (data as { value?: unknown }).value === "string"
	);
}

/**
 * Walk messages from the end and return the text of the last assistant turn,
 * truncated to 200 chars. Falls back to a generic string if none found.
 */
function extractLastAssistantText(messages: unknown[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i] as Record<string, unknown>;
		if (msg.role === "assistant" && Array.isArray(msg.content)) {
			const textBlock = (msg.content as Array<Record<string, unknown>>).find(
				(c) => c.type === "text",
			);
			if (textBlock && typeof textBlock.text === "string") {
				return textBlock.text.slice(0, 200);
			}
		}
	}
	return "(turn complete)";
}

export default async function cmuxExtension(pi: ExtensionAPI): Promise<void> {
	const client = CmuxClient.create();
	if (!client) {
		if (process.env.DEBUG?.includes("cmux")) {
			process.stderr.write(
				"[cmux] unavailable: CMUX_SOCKET_PATH / CMUX_WORKSPACE_ID / CMUX_SURFACE_ID not set or socket not found\n",
			);
		}
		return;
	}

	try {
		await client.probe();
	} catch {
		// probe() already flipped the circuit breaker and emitted one debug line.
		return;
	}

	let pendingInputNotification = false;
	/**
	 * How many question/questionnaire calls are currently in-flight during
	 * the current turn. tool_execution_end gates on toolName so unrelated
	 * parallel tool calls (e.g. bash/grep) never touch this counter.
	 */
	let bumpedCount = 0;
	/**
	 * When set, lifecycle hooks skip their normal badge updates so long-lived
	 * states (e.g. plannotator-review user-review) aren't clobbered between agent turns.
	 */
	let lockedStatus: CmuxLockStatusPayload | null = null;

	pi.on("session_start", (_event, _context) => {
		void client.setStatus("idle");
	});

	pi.on("agent_start", (_event, _context) => {
		pendingInputNotification = false;
		bumpedCount = 0;
		// Don't clobber a long-lived locked badge (e.g. plannotator-review user-review).
		if (lockedStatus !== null) return;
		void client.setStatus("working");
	});

	pi.on("tool_execution_start", (event, _context) => {
		if (event.toolName !== "question" && event.toolName !== "questionnaire") return;

		let prompt = "";
		if (event.toolName === "question") {
			prompt =
				typeof (event.args as { question?: unknown }).question === "string"
					? (event.args as { question: string }).question
					: "";
		} else {
			const questions = (event.args as { questions?: unknown }).questions;
			if (
				Array.isArray(questions) &&
				questions.length > 0 &&
				typeof (questions[0] as { prompt?: unknown }).prompt === "string"
			) {
				prompt = (questions[0] as { prompt: string }).prompt;
			}
		}

		pendingInputNotification = true;
		bumpedCount++;
		void client.setStatus("needs-input");
		void client.notify({ title: "Pi needs input", body: prompt });
	});

	pi.on("tool_execution_end", (event, _context) => {
		// Only act on tool calls that pushed the badge.
		if (event.toolName !== "question" && event.toolName !== "questionnaire") return;

		// Guard against mismatched events (no corresponding tool_execution_start).
		if (bumpedCount === 0) return;
		bumpedCount--;

		// Another bumping call is still in-flight; let it own the eventual reset.
		if (bumpedCount > 0) return;

		if (lockedStatus !== null) {
			// Restore the locked badge rather than switching to working.
			const defaults = BADGE_STATES[lockedStatus.value as keyof typeof BADGE_STATES] as
				| { icon: string; color: string }
				| undefined;
			void client.setStatus(lockedStatus.value, {
				icon: lockedStatus.icon ?? defaults?.icon,
				color: lockedStatus.color ?? defaults?.color,
			});
			return;
		}

		// The agent is resuming work — flip badge back to working and clear the
		// now-stale question prompt from the sidebar's last-message line.
		void client.setStatus("working");
		void client.notify({ title: "" }); // empty notify_target payload clears the sidebar last-message line
	});

	pi.on("agent_end", async (event, context) => {
		if (lockedStatus !== null) {
			// Restore the locked badge rather than switching to idle.
			const defaults = BADGE_STATES[lockedStatus.value as keyof typeof BADGE_STATES] as
				| { icon: string; color: string }
				| undefined;
			void client.setStatus(lockedStatus.value, {
				icon: lockedStatus.icon ?? defaults?.icon,
				color: lockedStatus.color ?? defaults?.color,
			});
		} else {
			void client.setStatus("idle");
		}

		// Don't double-notify if we already pinged for a question/questionnaire
		// tool call this cycle.
		if (pendingInputNotification) return;

		// Don't notify if a follow-up turn is already queued (transient idle).
		if (context.hasPendingMessages()) return;

		// Don't notify if the user is already looking at this pane.
		const focused = await client.isSurfaceFocused(context.signal ?? undefined);
		if (focused === true) return;

		const snippet = extractLastAssistantText(event.messages as unknown[]);
		void client.notify({ title: "Pi is waiting", body: snippet });
	});

	pi.on("session_shutdown", async (_event, _context) => {
		// Await clearStatus so the badge is gone before the socket closes.
		await client.clearStatus();
		client.dispose();
	});

	// Other extensions may fire these; this extension listens. No direct import
	// between the two — zero coupling.

	pi.events.on("cmux:notify", (data) => {
		if (!isNotifyPayload(data)) return;
		void client.notify({ title: data.title, subtitle: data.subtitle, body: data.body });
	});

	pi.events.on("cmux:set-status", (data) => {
		if (!isSetStatusPayload(data)) return;
		const defaults = BADGE_STATES[data.value as keyof typeof BADGE_STATES] as
			| { icon: string; color: string }
			| undefined;
		void client.setStatus(data.value, {
			icon: data.icon ?? defaults?.icon,
			color: data.color ?? defaults?.color,
		});
	});

	/**
	 * Lock the badge to a specific value. While locked, badge lifecycle
	 * updates are suppressed (agent_end restores the locked value instead).
	 * Intended for long-lived states like plannotator-review user-review.
	 */
	pi.events.on("cmux:lock-status", (data) => {
		if (!isLockStatusPayload(data)) return;
		lockedStatus = data;
		const defaults = BADGE_STATES[data.value as keyof typeof BADGE_STATES] as
			| { icon: string; color: string }
			| undefined;
		void client.setStatus(data.value, {
			icon: data.icon ?? defaults?.icon,
			color: data.color ?? defaults?.color,
		});
	});

	/** Clear the badge lock. The next lifecycle event resumes normal badge behaviour. */
	pi.events.on("cmux:unlock-status", (_data) => {
		lockedStatus = null;
	});
}
