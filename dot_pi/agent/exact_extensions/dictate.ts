/**
 * Dictation via sox + MacWhisper CLI.
 *
 * ctrl+shift+m — toggle: idle → start recording, recording → stop + transcribe + auto-submit.
 * esc       — abort while recording (drops the wav, no transcription).
 *
 * While recording, the input editor is replaced with a status display showing the elapsed
 * time. We swap a custom `CustomEditor` subclass via `setEditorComponent` rather than using
 * `setStatus`, because users running `extensions/ccstatusline` have their footer fully
 * occupied by the upstream renderer and never see status text.
 *
 * Requirements:
 *   - `sox` on PATH (`brew install sox`)
 *   - `mw` on PATH (MacWhisper → Settings → Advanced → Command-Line Tool → Install)
 *   - macOS Microphone permission for the host terminal app (granted on first use)
 *
 * Gated to the "work" chezmoi profile (see .chezmoiignore) — MacWhisper is a paid,
 * work-laptop-only tool. The personal profile may get a different transcription
 * backend later.
 */

import { CustomEditor, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const MW_TIMEOUT_MS = 120_000;
/** One-line preface attached to the transcript so the model knows to forgive
 *  transcription errors and verbal disfluencies. Recording is blocked if the editor
 *  has typed text in it, so there's no "typed + dictated" concat path to worry about. */
const DICTATION_PREFIX =
	"[Dictated via speech-to-text — transcription errors and verbal rambling are expected.]";
// WAV header alone is 44 bytes; anything close to that means sox captured silence/nothing.
// 1 KB at 16 kHz mono 16-bit ~ 30 ms of audio — a reasonable floor below which mw is
// guaranteed to fail or hallucinate.
const MIN_WAV_BYTES = 1024;
const TICK_INTERVAL_MS = 250; // smooth-ish elapsed timer without burning CPU

interface DictationSession {
	proc: ChildProcess;
	wavPath: string;
	unsubscribeEsc: () => void;
	stderrChunks: string[];
	display: DictationDisplay;
}

/** Minimal slice of the app Theme we need for `.fg(color, text)`. Avoids importing the
 *  internal `Theme` type from a private path. */
interface AppTheme {
	fg(color: string, text: string): string;
}

const cleanupTmp = (wavPath: string): void => {
	try {
		rmSync(dirname(wavPath), { recursive: true, force: true });
	} catch {
		// best-effort — /tmp gets reaped on reboot anyway
	}
};

const safeWavSize = (wavPath: string): number => {
	try {
		return statSync(wavPath).size;
	} catch {
		return 0;
	}
};

const formatElapsed = (totalSeconds: number): string => {
	const m = Math.floor(totalSeconds / 60);
	const s = totalSeconds % 60;
	return m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `${s}s`;
};

/**
 * Detect Whisper's silent-audio hallucinations.
 *
 * Two shapes covered:
 *   1. Bracketed marker tokens: `[BLANK_AUDIO]`, `[ Silence ]`, `[Music]`, etc.
 *   2. Pure-punctuation output: a single `[`, `]`, `.`, `,`, etc. — Whisper sometimes
 *      emits just one bracket / period / comma when fed silence. Anything containing
 *      no letters or digits at all has no plausible coding-agent meaning.
 *
 * Conservative on purpose: bare-string hallucinations like "Thanks for watching" or
 * "Subtitles by…" are *not* filtered — they're real English the user might legitimately
 * dictate. Add more entries here if you see specific ones recurring.
 */
const WHISPER_SILENCE_PATTERN =
	/^[\[\(\{]\s*(BLANK[_ ]AUDIO|silen(?:ce|t)|no\s*audio|inaudible|music|noise|sound)\s*[\]\)\}]\.?$/i;

/** Matches when the transcript contains at least one Unicode letter or digit. */
const HAS_ALPHANUMERIC = /[\p{L}\p{N}]/u;

const isWhisperSilenceHallucination = (transcript: string): boolean => {
	const trimmed = transcript.trim();
	if (!trimmed) return false; // empty handled by the `!transcript` check at the call site
	if (!HAS_ALPHANUMERIC.test(trimmed)) return true; // pure punctuation / brackets only
	return WHISPER_SILENCE_PATTERN.test(trimmed);
};

/**
 * Custom editor that replaces the normal input area with a recording / transcribing
 * indicator while a dictation session is active. Swallows printable input so the user
 * can't accidentally type into a buffer that'll never be sent. Forwards control sequences
 * (escape, ctrl+*, CSI \x1b…) so the registered `ctrl+shift+m` shortcut and our raw-input
 * `esc` handler still fire.
 */
class DictationDisplay extends CustomEditor {
	private phase: "recording" | "transcribing" = "recording";
	private readonly startedAt = Date.now();
	private timer: ReturnType<typeof setInterval> | null = null;
	/** Populated by the factory closure right after construction. The full app Theme has
	 *  `.fg(ThemeColor, string)`; the EditorTheme passed to our super constructor only
	 *  exposes `borderColor`. */
	appTheme!: AppTheme;

	start(): void {
		if (this.timer !== null) return;
		this.timer = setInterval(() => this.tui.requestRender(), TICK_INTERVAL_MS);
	}

	setTranscribing(): void {
		this.phase = "transcribing";
		this.clearTimer();
		this.tui.requestRender();
	}

	dispose(): void {
		this.clearTimer();
	}

	private clearTimer(): void {
		if (this.timer !== null) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	override handleInput(data: string): void {
		if (data.length === 0) {
			super.handleInput(data);
			return;
		}
		const code = data.charCodeAt(0);
		// Forward control sequences (escape \x1b, ctrl+* < 0x20, backspace 0x7f) to super so
		// app keybindings, the ctrl+shift+m shortcut, and the onTerminalInput esc-to-abort
		// handler all fire. Discard everything else (printable ASCII, UTF-8 multi-byte first
		// bytes, paste payloads) so the user can't type into a buffer that'll never be sent.
		if (code === 0x1b || code < 0x20 || code === 0x7f) {
			super.handleInput(data);
		}
	}

	override render(width: number): string[] {
		// Reuse the parent editor's render so the top + bottom border lines stay intact, then
		// replace the content row with our indicator. For an empty editor (which is what we
		// have — we discard input in handleInput) super.render returns roughly
		// `[topBorder, emptyContentRow, bottomBorder]`. We collapse any multi-line content into
		// our single indicator line; word-wrap doesn't apply because we never put text in the
		// underlying buffer.
		const frame = super.render(width);
		const content = truncateToWidth(`${" ".repeat(this.getPaddingX())}${this.indicatorLine()}`, width, "");
		if (frame.length >= 2) {
			return [frame[0]!, content, frame[frame.length - 1]!];
		}
		return frame.length === 1 ? [content] : [content];
	}

	private indicatorLine(): string {
		if (this.phase === "recording") {
			const elapsed = Math.floor((Date.now() - this.startedAt) / 1000);
			const indicator = this.appTheme.fg("error", "🎤 RECORDING");
			const timer = this.appTheme.fg("muted", `(${formatElapsed(elapsed)})`);
			const hints = this.appTheme.fg("muted", "space stop · esc abort");
			return `${indicator}  ${timer}  ${hints}`;
		}
		return this.appTheme.fg("warning", "📝 transcribing…");
	}
}

/** Tear down the custom editor and restore the default editor. No saved-text restoration
 *  needed — recording is blocked when the editor has typed text, so it's always empty
 *  when we return. */
const closeDisplay = (ctx: ExtensionContext, display: DictationDisplay): void => {
	display.dispose();
	ctx.ui.setEditorComponent(undefined);
};

export default function dictateExtension(pi: ExtensionAPI): void {
	let session: DictationSession | null = null;

	const abortRecording = (ctx: ExtensionContext): void => {
		if (!session) return;
		const { proc, unsubscribeEsc, wavPath, display } = session;
		session = null;
		unsubscribeEsc();
		proc.kill("SIGINT");
		cleanupTmp(wavPath);
		closeDisplay(ctx, display);
		ctx.ui.notify("Dictation aborted", "info");
	};

	const toggle = async (ctx: ExtensionContext): Promise<void> => {
			// ── Stop + transcribe + submit ─────────────────────────────────
			if (session) {
				const { proc, wavPath, unsubscribeEsc, stderrChunks, display } = session;
				session = null;
				unsubscribeEsc();
				display.setTranscribing();
				proc.kill("SIGINT");
				await new Promise<void>((resolve) => proc.once("exit", () => resolve()));

				// sox reaps SIGINT cleanly (exit 0); a non-zero exit means a real recording failure.
				if (proc.exitCode !== null && proc.exitCode !== 0) {
					closeDisplay(ctx, display);
					cleanupTmp(wavPath);
					const stderr = stderrChunks.join("").trim();
					ctx.ui.notify(`sox exit ${proc.exitCode}: ${stderr || "(no stderr)"}`, "error");
					return;
				}

				const wavSize = safeWavSize(wavPath);
				if (wavSize < MIN_WAV_BYTES) {
					closeDisplay(ctx, display);
					cleanupTmp(wavPath);
					const stderr = stderrChunks.join("").trim();
					const tail = stderr ? ` sox stderr: ${stderr}` : "";
					ctx.ui.notify(
						`Recording too short or empty (${wavSize} bytes). Mic permission denied?${tail}`,
						"error",
					);
					return;
				}

				let result: Awaited<ReturnType<typeof pi.exec>>;
				try {
					result = await pi.exec("mw", ["transcribe", wavPath], { timeout: MW_TIMEOUT_MS });
				} catch (error) {
					closeDisplay(ctx, display);
					cleanupTmp(wavPath);
					const message = error instanceof Error ? error.message : String(error);
					ctx.ui.notify(`mw failed to launch: ${message}. Is the MacWhisper CLI installed?`, "error");
					return;
				}

				if (result.code !== 0) {
					// pi.exec returns code === 1 with empty stdout+stderr when the binary itself isn't
					// on PATH (no ENOENT reject). Detect that case and give a useful message.
					const stderr = result.stderr.trim();
					const stdout = result.stdout.trim();
					if (result.code === 1 && !stderr && !stdout) {
						closeDisplay(ctx, display);
						ctx.ui.notify(
							`mw exit 1 with no output. Most likely \`mw\` isn't on PATH — install via MacWhisper → Settings → Advanced → Command-Line Tool → Install. Recording preserved at ${wavPath}.`,
							"error",
						);
						return; // intentionally NOT cleaning up tmp — user can `mw transcribe` it once installed
					}
					closeDisplay(ctx, display);
					cleanupTmp(wavPath);
					const detail = stderr || stdout || "(no output)";
					ctx.ui.notify(`mw exit ${result.code}: ${detail}`, "error");
					return;
				}

				cleanupTmp(wavPath);
				const transcript = result.stdout.trim();
				if (!transcript || isWhisperSilenceHallucination(transcript)) {
					// Silent no-op — nothing was said (or only Whisper's silence hallucination came
					// back). Tear down and bail without bothering the user with a notify;
					// accidentally toggling ctrl+shift+m twice with nothing in between is common enough
					// that surfacing it as a warning would be noisy.
					closeDisplay(ctx, display);
					return;
				}

				// Auto-submit. Restore the default editor first so the user sees a normal prompt
				// afterwards. If the agent is currently streaming, queue the message as steering
				// so it lands between turns; otherwise send it as a fresh user turn.
				// (sendUserMessage throws when called mid-stream without `deliverAs`.)
				closeDisplay(ctx, display);
				const message = `${DICTATION_PREFIX}\n\n${transcript}`;
				if (ctx.isIdle()) {
					pi.sendUserMessage(message);
				} else {
					pi.sendUserMessage(message, { deliverAs: "steer" });
				}
				return;
			}

			// ── Start recording ────────────────────────────────────────────
			// Dictation takes over the editor, so it only makes sense to start with an empty
			// one. A non-empty editor would be hidden by the recording display and dropped on
			// return — surface the conflict instead of silently swallowing the typed text.
			if (ctx.ui.getEditorText().trim()) {
				ctx.ui.notify(
					"Editor has typed text — submit or clear it before dictating.",
					"warning",
				);
				return;
			}

			const dir = mkdtempSync(join(tmpdir(), "pi-dictate-"));
			const wavPath = join(dir, "rec.wav");
			// 16 kHz mono 16-bit PCM — Whisper's native rate; smaller files, no quality loss for speech.
			const proc = spawn("sox", ["-d", "-r", "16000", "-c", "1", "-b", "16", wavPath], {
				stdio: ["ignore", "ignore", "pipe"],
			});

			const stderrChunks: string[] = [];
			proc.stderr?.setEncoding("utf8");
			proc.stderr?.on("data", (chunk: string) => stderrChunks.push(chunk));

			const unsubscribeEsc = ctx.ui.onTerminalInput((data) => {
				// matchesKey covers both legacy bare-escape (`\x1b`) and the Kitty keyboard
				// protocol form (`\x1b[27u`) that Pi negotiates with cmux/Ghostty.
				if (matchesKey(data, "escape")) {
					abortRecording(ctx);
					return { consume: true };
				}
				// Bare spacebar also stops + transcribes — same as ctrl+shift+m. The custom
				// editor's handleInput discards printable chars, but onTerminalInput fires
				// first, so we catch " " here and route through the same toggle path. Errors
				// surface via ctx.ui.notify inside toggle().
				if (data === " ") {
					void toggle(ctx);
					return { consume: true };
				}
				return undefined;
			});

			let display!: DictationDisplay;
			ctx.ui.setEditorComponent((tui, theme, keybindings) => {
				display = new DictationDisplay(tui, theme, keybindings);
				display.appTheme = ctx.ui.theme;
				display.start();
				return display;
			});

			session = { proc, wavPath, unsubscribeEsc, stderrChunks, display };

			proc.once("error", (error) => {
				// sox not installed, ENOENT, mic permission denied, …
				if (session?.proc === proc) {
					session.unsubscribeEsc();
					closeDisplay(ctx, session.display);
					session = null;
				}
				cleanupTmp(wavPath);
				ctx.ui.notify(`sox failed: ${error.message}. Is sox installed (brew install sox)?`, "error");
			});
	};

	pi.registerShortcut("ctrl+shift+m", {
		description: "Toggle dictation (sox + MacWhisper). Space or ctrl+shift+m stops; esc aborts.",
		handler: toggle,
	});
}
