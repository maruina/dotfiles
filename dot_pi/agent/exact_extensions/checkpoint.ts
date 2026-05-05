import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { complete, type Message } from "@mariozechner/pi-ai";
import type { ExtensionAPI, SessionEntry } from "@mariozechner/pi-coding-agent";
import { BorderedLoader, convertToLlm, serializeConversation } from "@mariozechner/pi-coding-agent";

const execFileAsync = promisify(execFile);

const SYSTEM_PROMPT = `You write precise handoff checkpoints for coding-agent sessions.

Given the conversation, repository state, and user note, write a compact checkpoint that lets a fresh agent resume without reading the old conversation.

Include:
- Goal
- Decisions and user preferences
- Repositories, branches, and pull requests
- Files read or changed
- Current working-tree state
- Commands run and validation results
- What remains next
- Hazards or things not to do

Prefer concrete paths, commands, error messages, and links. Omit filler. Do not invent facts.`;

function entryToMessage(entry: SessionEntry): AgentMessage | undefined {
	if (entry.type === "message") return entry.message;
	if (entry.type === "compaction") {
		return {
			role: "compactionSummary",
			summary: entry.summary,
			tokensBefore: entry.tokensBefore,
			timestamp: new Date(entry.timestamp).getTime(),
		};
	}
	return undefined;
}

function handoffMessages(branch: SessionEntry[]): AgentMessage[] {
	let compactionIndex = -1;
	for (let i = branch.length - 1; i >= 0; i--) {
		if (branch[i].type === "compaction") {
			compactionIndex = i;
			break;
		}
	}
	if (compactionIndex < 0) return branch.map(entryToMessage).filter((m) => m !== undefined);

	const compaction = branch[compactionIndex];
	const firstKeptIndex =
		compaction.type === "compaction" ? branch.findIndex((entry) => entry.id === compaction.firstKeptEntryId) : -1;
	return [
		compaction,
		...(firstKeptIndex >= 0 ? branch.slice(firstKeptIndex, compactionIndex) : []),
		...branch.slice(compactionIndex + 1),
	]
		.map(entryToMessage)
		.filter((m) => m !== undefined);
}

async function git(cwd: string, args: string[]): Promise<string> {
	try {
		const { stdout, stderr } = await execFileAsync("git", args, { cwd, maxBuffer: 20 * 1024 * 1024 });
		return `${stdout}${stderr}`.trim();
	} catch (err) {
		const e = err as { stdout?: string; stderr?: string; message?: string };
		return `${e.stdout ?? ""}${e.stderr ?? ""}${e.message ?? ""}`.trim();
	}
}

function fence(text: string): string {
	return text.replaceAll("```", "``\\`");
}

function slug(input: string): string {
	return input.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "checkpoint";
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("checkpoint", {
		description: "Create a checkpoint, start a fresh session, and reload the checkpoint",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("checkpoint requires interactive mode", "error");
				return;
			}
			if (!ctx.model) {
				ctx.ui.notify("No model selected", "error");
				return;
			}

			await ctx.waitForIdle();

			const cwd = ctx.cwd;
			const repoRoot = (await git(cwd, ["rev-parse", "--show-toplevel"])) || cwd;
			const repoName = basename(repoRoot);
			const branch = (await git(repoRoot, ["branch", "--show-current"])) || "detached";
			const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
			const dir = join(process.env.HOME ?? ".", ".pi", "checkpoints", repoName);
			await mkdir(dir, { recursive: true });

			const baseName = `${timestamp}-${slug(branch)}`;
			const notePath = join(dir, `${baseName}.md`);
			const patchPath = join(dir, `${baseName}.patch`);

			const [status, stat, diff, recentLog, remotes] = await Promise.all([
				git(repoRoot, ["status", "--short", "--branch"]),
				git(repoRoot, ["diff", "--stat"]),
				git(repoRoot, ["diff", "--binary"]),
				git(repoRoot, ["log", "--oneline", "-10"]),
				git(repoRoot, ["remote", "-v"]),
			]);

			if (diff.trim()) await writeFile(patchPath, diff);

			const messages = handoffMessages(ctx.sessionManager.getBranch());
			const conversationText = serializeConversation(convertToLlm(messages));
			const currentSessionFile = ctx.sessionManager.getSessionFile();

			const priorCheckpoints = ctx.sessionManager
				.getBranch()
				.filter(
					(entry): entry is Extract<SessionEntry, { type: "custom" }> =>
						entry.type === "custom" && entry.customType === "checkpoint",
				)
				.map((entry) => entry.data as { notePath?: string; patchPath?: string; timestamp?: string; note?: string })
				.filter((entry) => entry.notePath || entry.note)
				.slice(-10);

			const generated = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
				const loader = new BorderedLoader(tui, theme, "Writing checkpoint...");
				loader.onAbort = () => done(null);

				const run = async () => {
					const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model!);
					if (!auth.ok || !auth.apiKey) throw new Error(auth.ok ? `No API key for ${ctx.model!.provider}` : auth.error);

					const prompt = `## User note\n${args.trim() || "No user note provided."}\n\n## Repository state\n- cwd: ${cwd}\n- repo root: ${repoRoot}\n- branch: ${branch}\n- session: ${currentSessionFile ?? "in-memory"}\n- checkpoint note: ${notePath}\n- patch: ${diff.trim() ? patchPath : "none"}\n\n### git status\n\`\`\`text\n${fence(status)}\n\`\`\`\n\n### git diff --stat\n\`\`\`text\n${fence(stat || "no tracked diff")}\n\`\`\`\n\n### recent commits\n\`\`\`text\n${fence(recentLog)}\n\`\`\`\n\n### remotes\n\`\`\`text\n${fence(remotes)}\n\`\`\`\n\n## Prior checkpoints in this session\n${
						priorCheckpoints.length > 0
							? priorCheckpoints
								.map(
									(cp, i) =>
										`${i + 1}. ${cp.timestamp ?? "unknown time"}: ${cp.notePath ?? cp.note}${cp.patchPath ? ` (patch: ${cp.patchPath})` : ""}`,
								)
								.join("\n")
							: "none"
					}

## Conversation\n${conversationText}`;

					const userMessage: Message = {
						role: "user",
						content: [{ type: "text", text: prompt }],
						timestamp: Date.now(),
					};

					const response = await complete(
						ctx.model!,
						{ systemPrompt: SYSTEM_PROMPT, messages: [userMessage] },
						{ apiKey: auth.apiKey, headers: auth.headers, signal: loader.signal },
					);
					if (response.stopReason === "aborted") return null;
					return response.content
						.filter((c): c is { type: "text"; text: string } => c.type === "text")
						.map((c) => c.text)
						.join("\n");
				};

				run().then(done).catch((err) => {
					console.error("checkpoint generation failed:", err);
					done(null);
				});
				return loader;
			});

			if (generated === null) {
				ctx.ui.notify("Checkpoint cancelled", "info");
				return;
			}

			const note = `# Checkpoint: ${repoName} ${branch} ${timestamp}\n\n${generated}\n\n## Mechanical state\n\n- Repository: ${repoRoot}\n- Branch: ${branch}\n- Previous session: ${currentSessionFile ?? "in-memory"}\n- Patch file: ${diff.trim() ? patchPath : "none"}\n\n### git status\n\n\`\`\`text\n${fence(status)}\n\`\`\`\n\n### git diff --stat\n\n\`\`\`text\n${fence(stat || "no tracked diff")}\n\`\`\`\n`;
			await writeFile(notePath, note);

			const checkpointData = {
				timestamp,
				repoRoot,
				repoName,
				branch,
				notePath,
				patchPath: diff.trim() ? patchPath : undefined,
				previousSessionFile: currentSessionFile,
				userNote: args.trim() || undefined,
			};

			const kickoff = `Read this checkpoint and continue from it. Treat it as the source of truth for the previous session.\n\nCheckpoint: ${notePath}\n${diff.trim() ? `Patch file, if needed: ${patchPath}\n` : ""}\nStart by reading the checkpoint file, then inspect current git status before editing.`;

			const result = await ctx.newSession({
				parentSession: currentSessionFile,
				setup: async (sm) => {
					for (const checkpoint of priorCheckpoints) {
						sm.appendCustomEntry("checkpoint", checkpoint);
					}
					sm.appendCustomEntry("checkpoint", checkpointData);
					sm.appendMessage({
						role: "user",
						content: [{ type: "text", text: kickoff }],
						timestamp: Date.now(),
					});
				},
				withSession: async (replacementCtx) => {
					replacementCtx.ui.notify(`Checkpoint loaded: ${notePath}`, "success");
				},
			});

			if (result.cancelled) {
				ctx.ui.notify(`Checkpoint written but new session cancelled: ${notePath}`, "info");
			}
		},
	});
}
