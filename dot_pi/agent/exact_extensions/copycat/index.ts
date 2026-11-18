import { randomUUID } from "node:crypto";
import { copyToClipboard, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { KeyId } from "@earendil-works/pi-tui";
import { CopyBar } from "./bar.js";
import { assistantText, BlockRegistry, extractBlocks, labelMarkdown, type NumberedBlock, runTexts } from "./blocks.js";
import { readConfig } from "./config.js";
import { pickBlock } from "./picker.js";

const ENTRY_TYPE = "copycat";

interface BarData {
	/** The barToken of the extension instance that wrote the entry. */
	token?: string;
	/** The last entry before the run began (null at the session root). The bar's blocks come after it. */
	start?: string | null;
}
/**
 * Added to the system prompt's rules so text meant for pasting lands in a copyable block.
 * Turned off with `"promptRule": false` in the config file.
 */
const PROMPT_GUIDELINE =
	"When writing a prompt, instructions, message, or other text the user will paste elsewhere, put all of it in one fenced block tagged `md`, with no commentary inside. If it contains code fences, use a `~~~md` fence or a longer backtick fence for the outer block so the inner fences don't close it.";

export default function copycat(pi: ExtensionAPI) {
	const config = readConfig();
	const registry = new BlockRegistry();
	let ui: ExtensionContext["ui"] | undefined;
	let sessionManager: ExtensionContext["sessionManager"] | undefined;
	/** Whether the current run has produced any block, so it gets a copy bar when it settles. */
	let runHasBlocks = false;
	/** The last session entry before the current run began, captured at its first agent_start. */
	let runStart: string | null | undefined;
	/**
	 * Tags bar entries written by this extension instance. Pi loads a fresh instance per session (startup,
	 * /reload, /resume, /new, fork), so bars only render for runs since the session was opened. Loaded
	 * history keeps its labels and /cp but gets no bars.
	 */
	const barToken = randomUUID().slice(0, 8);

	const copy = async (text: string, what: string): Promise<boolean> => {
		try {
			await copyToClipboard(text);
			ui?.notify(`Copied ${what}`, "info");
			return true;
		} catch (error) {
			ui?.notify(`Copy failed: ${error instanceof Error ? error.message : String(error)}`, "error");
			return false;
		}
	};

	const openPicker = async (ctx: ExtensionContext, query = "") => {
		if (registry.size === 0) {
			ctx.ui.notify("No code blocks in this session yet", "info");
			return;
		}
		const block = await pickBlock(ctx, registry.all(), query);
		if (block) await copy(block.text, `#${block.id}`);
	};

	pi.on("session_start", (event, ctx) => {
		ui = ctx.ui;
		sessionManager = ctx.sessionManager;
		if (event.reason === "startup" || event.reason === "reload") {
			for (const warning of config.warnings) ctx.ui.notify(warning, "warning");
		}
		registry.reset();
		runHasBlocks = false;
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type !== "message") continue;
			for (const text of assistantText(entry.message)) registry.addAll(text);
		}
	});

	// Only interactive sessions can copy, so headless runs (subagents, print mode) keep their prompt unchanged.
	pi.on("before_agent_start", (event, ctx) => {
		if (ctx.mode !== "tui" || !config.promptRule) return;
		const guidelines = event.systemPromptOptions.promptGuidelines;
		if (!guidelines.includes(PROMPT_GUIDELINE)) guidelines.push(PROMPT_GUIDELINE);
	});

	// Continuations and retries fire agent_start again within one run, so only the first one counts.
	pi.on("agent_start", (_event, ctx) => {
		if (runStart === undefined) runStart = ctx.sessionManager.getLeafId();
	});

	pi.on("message_end", (event) => {
		for (const text of assistantText(event.message)) {
			if (registry.addAll(text).length > 0) runHasBlocks = true;
		}
	});

	// agent_settled, not agent_end: retries and continuations start new low-level runs, and the bar should
	// cover everything since the user's prompt. It also fires for aborted runs.
	// The entry marks where the bar goes and stores only barToken: the renderer reads the run's blocks
	// from the messages before it, so session files don't hold a second copy of every block.
	pi.on("agent_settled", (_event, ctx) => {
		const hasBlocks = runHasBlocks;
		const start = runStart;
		runHasBlocks = false;
		runStart = undefined;
		if (ctx.mode === "tui" && hasBlocks) pi.appendEntry<BarData>(ENTRY_TYPE, { token: barToken, start });
	});

	// Label blocks with their number. Display only: stored messages and model context are unchanged.
	// Skipped while streaming: blocks are numbered at message_end, so a partial message has nothing to label yet.
	pi.registerMarkdownTransformer((markdown, context) => {
		if (context.messageType !== "assistant" || context.isStreaming) return markdown;
		return labelMarkdown(markdown, (block) => registry.add(block).id);
	});

	pi.registerEntryRenderer<BarData>(ENTRY_TYPE, (entry, _options, theme) => {
		if (!sessionManager || entry.data?.token !== barToken) return undefined;
		const messages = runTexts((id) => sessionManager?.getEntry(id), entry.parentId, ENTRY_TYPE, entry.data.start);
		const blocks: NumberedBlock[] = [];
		for (const block of messages.flat().flatMap(extractBlocks)) {
			const numbered = registry.add(block);
			if (!blocks.includes(numbered)) blocks.push(numbered);
		}
		if (blocks.length === 0) return undefined;
		const full = messages.at(-1)?.join("\n\n");
		return new CopyBar(CopyBar.chipsFor(blocks, full), theme, (chip) =>
			copy(chip.text, chip.id === undefined ? "response" : `#${chip.id}`),
		);
	});

	pi.registerCommand("cp", {
		description: "Copy a code block: /cp <n> copies block #n, /cp [search] opens the picker",
		handler: async (args, ctx) => {
			const arg = args.trim().replace(/^#/, "");
			if (/^\d+$/.test(arg)) {
				const block = registry.get(Number(arg));
				if (!block) {
					ctx.ui.notify(`No block #${arg} (this session has ${registry.size})`, "warning");
					return;
				}
				await copy(block.text, `#${block.id}`);
				return;
			}
			await openPicker(ctx, arg);
		},
	});

	if (config.shortcut) {
		pi.registerShortcut(config.shortcut as KeyId, {
			description: "Search and copy a code block from this session",
			handler: (ctx) => openPicker(ctx),
		});
	}
}
