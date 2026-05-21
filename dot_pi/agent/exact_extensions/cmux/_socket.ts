/**
 * Low-level Unix socket transport for the cmux wire protocol.
 *
 * v1: plain-text line-oriented commands.
 * v2: single-line JSON request / response.
 *
 * Requests are serialized via an internal promise lock so that v1 (which has no
 * request IDs) can match response lines unambiguously.
 */

import { createConnection, type Socket } from "node:net";
import { randomUUID } from "node:crypto";

const READ_TIMEOUT_MS = 5_000;

interface LineWaiter {
	resolve: (line: string) => void;
	reject: (err: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

export class CmuxSocket {
	private socket: Socket | null = null;
	private buffer = "";
	private lineWaiters: LineWaiter[] = [];
	/** Serial promise chain — guarantees only one in-flight send at a time. */
	private lock: Promise<void> = Promise.resolve();
	private readonly socketPath: string;

	constructor(socketPath: string) {
		this.socketPath = socketPath;
	}

	connect(signal?: AbortSignal): Promise<void> {
		return new Promise((resolve, reject) => {
			if (signal?.aborted) {
				reject(new Error("Aborted"));
				return;
			}

			const sock = createConnection({ path: this.socketPath });
			let settled = false;

			const settle = (err?: Error) => {
				if (settled) return;
				settled = true;
				sock.removeAllListeners("connect");
				sock.removeAllListeners("error");
				if (err) {
					sock.destroy();
					reject(err);
				} else {
					this.socket = sock;
					sock.on("data", (chunk: Buffer) => {
						this.buffer += chunk.toString("utf8");
						this.drainWaiters();
					});
					sock.on("close", () => {
						this.rejectAllWaiters(new Error("cmux socket closed"));
					});
					sock.on("error", (e) => {
						this.rejectAllWaiters(e);
					});
					resolve();
				}
			};

			sock.once("connect", () => settle());
			sock.once("error", (e) => settle(e));

			if (signal) {
				const onAbort = () => settle(new Error("Aborted"));
				signal.addEventListener("abort", onAbort, { once: true });
			}
		});
	}

	private drainWaiters(): void {
		while (this.lineWaiters.length > 0) {
			const idx = this.buffer.indexOf("\n");
			if (idx === -1) break;
			const line = this.buffer.slice(0, idx);
			this.buffer = this.buffer.slice(idx + 1);
			const waiter = this.lineWaiters.shift()!;
			clearTimeout(waiter.timer);
			waiter.resolve(line);
		}
	}

	private rejectAllWaiters(err: Error): void {
		for (const w of this.lineWaiters) {
			clearTimeout(w.timer);
			w.reject(err);
		}
		this.lineWaiters = [];
	}

	private waitForLine(): Promise<string> {
		// Fast path: line already in buffer.
		const idx = this.buffer.indexOf("\n");
		if (idx !== -1) {
			const line = this.buffer.slice(0, idx);
			this.buffer = this.buffer.slice(idx + 1);
			return Promise.resolve(line);
		}

		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				const pos = this.lineWaiters.findIndex((w) => w.timer === timer);
				if (pos !== -1) this.lineWaiters.splice(pos, 1);
				reject(new Error("cmux socket read timeout"));
			}, READ_TIMEOUT_MS);
			this.lineWaiters.push({ resolve, reject, timer });
		});
	}

	private writeRaw(data: string): Promise<void> {
		return new Promise((resolve, reject) => {
			if (!this.socket) {
				reject(new Error("cmux socket not connected"));
				return;
			}
			this.socket.write(data, "utf8", (err) => {
				if (err) reject(err);
				else resolve();
			});
		});
	}

	/**
	 * Send a v1 command and return the response line.
	 * Throws if the response starts with `ERROR:`.
	 */
	sendV1(command: string): Promise<string> {
		const next = this.lock.then(async () => {
			await this.writeRaw(command + "\n");
			const line = await this.waitForLine();
			if (line.startsWith("ERROR:")) throw new Error(line);
			return line;
		});
		// The lock must always resolve (never reject) to keep the queue draining.
		this.lock = next.then(
			() => {},
			() => {},
		);
		return next;
	}

	/**
	 * Send a v2 JSON command and return the parsed result.
	 * Throws if `ok` is false in the response.
	 */
	sendV2(method: string, params: object): Promise<unknown> {
		const next = this.lock.then(async () => {
			const msg = JSON.stringify({ id: randomUUID(), method, params });
			await this.writeRaw(msg + "\n");
			const line = await this.waitForLine();
			const response = JSON.parse(line) as { ok: boolean; result?: unknown; error?: { message?: string } };
			if (!response.ok) {
				throw new Error(response.error?.message ?? "cmux v2 error");
			}
			return response.result;
		});
		this.lock = next.then(
			() => {},
			() => {},
		);
		return next;
	}

	close(): void {
		if (this.socket) {
			this.socket.destroy();
			this.socket = null;
		}
		this.rejectAllWaiters(new Error("cmux socket closed"));
	}
}
