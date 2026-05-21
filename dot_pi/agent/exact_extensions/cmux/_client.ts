/**
 * High-level cmux client.
 *
 * Wraps the socket transport with:
 * - Env-var gating (create() returns null when cmux isn't running).
 * - Circuit breaker: one failure → permanently unavailable (no retry spam).
 * - Idle connection timer: closes the socket 2s after the last send.
 * - Auth via $CMUX_SOCKET_PASSWORD or the cmux password file.
 */

import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { toErrorMessage } from "../_shared/errors.ts";
import { CmuxSocket } from "./_socket.js";

/**
 * Sidebar badge states. Single source of truth for icon and color used by
 * both the lifecycle hooks and the `cmux:set-status` event listener.
 */
export const BADGE_STATES = {
	idle: { icon: "pause.circle.fill", color: "#8E8E93" },
	working: { icon: "bolt.fill", color: "#4C8DFF" },
	"needs-input": { icon: "questionmark.circle.fill", color: "#FF9500" },
	"spec-mode": { icon: "pencil.and.list.clipboard", color: "#5AC8FA" },
	"plan-mode": { icon: "doc.text", color: "#BF5AF2" },
	"plan-review": { icon: "eye.fill", color: "#FF9500" },
	"agent-review": { icon: "person.2.fill", color: "#4C8DFF" },
	"user-review": { icon: "hand.wave.fill", color: "#30D158" },
	"failed": { icon: "exclamationmark.triangle.fill", color: "#FF453A" },
} as const;

/** How long to keep the socket open after the last send before releasing it. */
const IDLE_TIMEOUT_MS = 2_000;

/** Shell-quote a single token the way cmux's own CLI does (mirrors shellQuote in cmux.swift). */
function shellQuote(value: string): string {
	if (value === "" || !/[ \t\n'"\\$`]/.test(value)) return value;
	return "'" + value.replace(/'/g, "'\\''") + "'";
}

/**
 * Sanitize a string for use in a `notify_target` payload.
 * The server splits on `|` (title/subtitle/body separator) and `\n` (command
 * terminator), so we strip both. Raw concat — do NOT shell-quote.
 */
function sanitizeNotifyField(value: string): string {
	return value.replace(/[\r\n|]+/g, " ").trim();
}

export class CmuxClient {
	private unavailable = false;
	private socket: CmuxSocket | null = null;
	private idleTimer: ReturnType<typeof setTimeout> | null = null;
	/** Prevents concurrent connect-and-auth attempts. */
	private connectionPromise: Promise<CmuxSocket> | null = null;

	private readonly socketPath: string;
	private readonly workspaceId: string;
	private readonly surfaceId: string;

	private constructor(socketPath: string, workspaceId: string, surfaceId: string) {
		this.socketPath = socketPath;
		this.workspaceId = workspaceId;
		this.surfaceId = surfaceId;
	}

	/**
	 * Create a CmuxClient if the required env vars are set and the socket path
	 * is a valid Unix socket. Returns `null` if cmux isn't available.
	 */
	static create(): CmuxClient | null {
		const socketPath = process.env.CMUX_SOCKET_PATH ?? process.env.CMUX_SOCKET ?? "";
		const workspaceId = process.env.CMUX_WORKSPACE_ID ?? "";
		const surfaceId = process.env.CMUX_SURFACE_ID ?? "";

		if (!socketPath || !workspaceId || !surfaceId) return null;

		try {
			if (!statSync(socketPath).isSocket()) return null;
		} catch {
			return null;
		}

		return new CmuxClient(socketPath, workspaceId, surfaceId);
	}

	/** Flip the circuit breaker permanently. One debug log line, then silence. */
	private markUnavailable(reason: string): void {
		if (!this.unavailable) {
			this.unavailable = true;
			if (process.env.DEBUG?.includes("cmux")) {
				process.stderr.write(`[cmux] unavailable: ${reason}\n`);
			}
		}
	}

	private getPassword(): string | null {
		if (process.env.CMUX_SOCKET_PASSWORD) {
			return process.env.CMUX_SOCKET_PASSWORD;
		}
		try {
			const path = join(
				homedir(),
				"Library",
				"Application Support",
				"cmux",
				"socket-control-password",
			);
			return readFileSync(path, "utf8").trim();
		} catch {
			return null;
		}
	}

	private async authIfNeeded(sock: CmuxSocket): Promise<void> {
		const password = this.getPassword();
		if (password) {
			// Swallow the reply — any auth failure will surface as a command error.
			await sock.sendV1(`auth ${password}`);
		}
	}

	private stopIdleTimer(): void {
		if (this.idleTimer !== null) {
			clearTimeout(this.idleTimer);
			this.idleTimer = null;
		}
	}

	private resetIdleTimer(): void {
		this.stopIdleTimer();
		this.idleTimer = setTimeout(() => {
			this.socket?.close();
			this.socket = null;
			this.connectionPromise = null;
			this.idleTimer = null;
		}, IDLE_TIMEOUT_MS);
	}

	private getConnection(): Promise<CmuxSocket> {
		if (this.socket) {
			this.stopIdleTimer();
			return Promise.resolve(this.socket);
		}

		if (this.connectionPromise) return this.connectionPromise;

		this.connectionPromise = (async () => {
			const sock = new CmuxSocket(this.socketPath);
			await sock.connect();
			await this.authIfNeeded(sock);
			this.socket = sock;
			this.connectionPromise = null;
			return sock;
		})().catch((error: unknown) => {
			this.connectionPromise = null;
			this.markUnavailable(toErrorMessage(error));
			throw error;
		});

		return this.connectionPromise;
	}

	/**
	 * One-shot probe: connect, authenticate, ping, close.
	 * On failure flips the circuit breaker and re-throws so the extension
	 * can bail out before registering any hooks.
	 */
	async probe(): Promise<void> {
		const sock = new CmuxSocket(this.socketPath);
		try {
			await sock.connect();
			await this.authIfNeeded(sock);
			await sock.sendV1("ping");
		} catch (error) {
			this.markUnavailable(toErrorMessage(error));
			throw error;
		} finally {
			sock.close();
		}
	}

	/**
	 * Fire a cmux notification for this surface.
	 * Payload is raw-concatenated (not shell-quoted) per the `notify_target`
	 * server-side parser — pipes and newlines are sanitized instead.
	 */
	async notify(opts: { title: string; subtitle?: string; body?: string }): Promise<void> {
		if (this.unavailable) return;
		try {
			const title = sanitizeNotifyField(opts.title).slice(0, 300);
			const subtitle = sanitizeNotifyField(opts.subtitle ?? "");
			const body = sanitizeNotifyField(opts.body ?? "").slice(0, 300);
			const payload = `${title}|${subtitle}|${body}`;
			const sock = await this.getConnection();
			await sock.sendV1(
				`notify_target ${this.workspaceId} ${this.surfaceId} ${payload}`,
			);
			this.resetIdleTimer();
		} catch (error) {
			this.markUnavailable(toErrorMessage(error));
		}
	}

	/**
	 * Set the sidebar status badge for this tab.
	 * The value is shell-quoted because `set_status` is tokenized server-side.
	 */
	async setStatus(value: string, opts?: { icon?: string; color?: string }): Promise<void> {
		if (this.unavailable) return;
		try {
			const badge = BADGE_STATES[value as keyof typeof BADGE_STATES] as
				| { icon: string; color: string }
				| undefined;
			const icon = opts?.icon ?? badge?.icon;
			const color = opts?.color ?? badge?.color;

			let cmd = `set_status pi-agent ${shellQuote(value)}`;
			if (icon) cmd += ` --icon=${icon}`;
			if (color) cmd += ` --color=${color}`;
			cmd += ` --tab=${this.workspaceId}`;

			const sock = await this.getConnection();
			await sock.sendV1(cmd);
			this.resetIdleTimer();
		} catch (error) {
			this.markUnavailable(toErrorMessage(error));
		}
	}

	/** Remove the sidebar status badge for this tab. */
	async clearStatus(): Promise<void> {
		if (this.unavailable) return;
		try {
			const sock = await this.getConnection();
			await sock.sendV1(`clear_status pi-agent --tab=${this.workspaceId}`);
			this.resetIdleTimer();
		} catch (error) {
			this.markUnavailable(toErrorMessage(error));
		}
	}

	/**
	 * Check whether the current surface is focused.
	 * Returns `true` if focused, `undefined` if unknown (error or missing row).
	 * Errors are swallowed — a focus-check failure is non-fatal.
	 */
	async isSurfaceFocused(_signal?: AbortSignal): Promise<boolean | undefined> {
		if (this.unavailable) return undefined;
		try {
			const sock = await this.getConnection();
			const result = await sock.sendV2("surface.list", {
				workspace_id: this.workspaceId,
			});
			this.resetIdleTimer();

			const surfaces = (result as { surfaces?: unknown[] } | undefined)?.surfaces;
			if (!Array.isArray(surfaces)) return undefined;

			const surf = surfaces.find(
				(s: unknown) =>
					typeof s === "object" &&
					s !== null &&
					(
						(s as { id?: unknown }).id === this.surfaceId ||
						(s as { ref?: unknown }).ref === this.surfaceId
					),
			) as { focused?: unknown } | undefined;

			return surf?.focused === true ? true : undefined;
		} catch {
			return undefined;
		}
	}

	/** Close the socket and stop any pending timers. */
	dispose(): void {
		this.stopIdleTimer();
		this.socket?.close();
		this.socket = null;
		this.connectionPromise = null;
	}
}
