import { Marked, type Token } from "@earendil-works/pi-tui";

/** A fenced code block or blockquote extracted from assistant markdown. Quotes use lang `quote`. */
export interface CodeBlock {
	lang: string;
	text: string;
}

/** A code block with its session-wide number. */
export interface NumberedBlock extends CodeBlock {
	id: number;
}

const lexer = new Marked();

/** Language label used for blockquotes. */
export const QUOTE_LANG = "quote";

function walk(tokens: readonly Token[], visit: (token: Token, inQuote: boolean) => void, inQuote = false): void {
	for (const token of tokens) {
		visit(token, inQuote);
		const nested = token as { tokens?: Token[]; items?: Token[] };
		const childInQuote = inQuote || token.type === "blockquote";
		if (nested.items) walk(nested.items, visit, childInQuote);
		if (nested.tokens) walk(nested.tokens, visit, childInQuote);
	}
}

function isFencedCode(token: Token): token is Token & { type: "code"; text: string; lang?: string } {
	return token.type === "code" && (token as { codeBlockStyle?: string }).codeBlockStyle !== "indented";
}

/**
 * Returns the copyable block for a token, if it is one: a non-empty fenced code block, or an outermost
 * blockquote. Quotes copy their inner markdown with the `>` markers stripped; quotes nested in quotes
 * are part of their parent and not numbered separately.
 */
function blockFor(token: Token, inQuote: boolean): CodeBlock | undefined {
	if (isFencedCode(token)) {
		if (token.text.trim() === "") return undefined;
		return { lang: (token.lang ?? "").trim().split(/\s+/)[0] ?? "", text: token.text };
	}
	if (token.type === "blockquote" && !inQuote) {
		const text = (token as { text?: string }).text?.trim() ?? "";
		return text === "" ? undefined : { lang: QUOTE_LANG, text };
	}
	return undefined;
}

/**
 * Extracts fenced code blocks and blockquotes, including ones nested in lists and blockquotes,
 * in document order.
 */
export function extractBlocks(markdown: string): CodeBlock[] {
	const blocks: CodeBlock[] = [];
	walk(lexer.lexer(markdown), (token, inQuote) => {
		const block = blockFor(token, inQuote);
		if (block) blocks.push(block);
	});
	return blocks;
}

/** What may precede a nested block's first line in the source: indentation, `>` markers and list markers. */
const CONTAINER_PREFIX = /^(?:[ \t>]|[-*+](?=[ \t])|\d{1,9}[.)](?=[ \t]))*$/;

/** The prefix to use on continuation lines: list markers become spaces, quote markers stay. */
function continuationOf(prefix: string): string {
	return prefix.replace(/[-*+]|\d{1,9}[.)]/g, (marker) => " ".repeat(marker.length));
}

/**
 * Inserts a `#N` label line above each fenced block or blockquote that has a number, including ones
 * nested in lists and quotes. Nested labels reuse the block's indentation and `>` markers so the
 * surrounding list or quote stays intact.
 */
export function labelMarkdown(markdown: string, idFor: (block: CodeBlock) => number | undefined): string {
	const lines = markdown.split("\n");
	// Line index -> labels to insert above it, outermost first, with the source prefix (indentation,
	// markers) of that line. A quote that opens with a fence shares its first line with the code block.
	const labels = new Map<number, { id: number; prefix: string }[]>();
	let cursor = 0;
	// Every block is resolved in document order, so numbering matches extractBlocks(). Token raws are
	// de-indented for nested blocks, so each one is located by its first line, scanning forward.
	walk(lexer.lexer(markdown), (token, inQuote) => {
		const isQuote = token.type === "blockquote" && !inQuote;
		// Locate every fence and outer quote, even empty ones with no number, so the scan moves past them.
		if (!isQuote && !isFencedCode(token)) return;
		const block = blockFor(token, inQuote);
		const id = block && idFor(block);
		const rawLines = token.raw.replace(/\n+$/, "").split("\n");
		const first = rawLines[0].trim();
		for (let i = cursor; i < lines.length; i++) {
			const line = lines[i].trimEnd();
			if (!line.endsWith(first)) continue;
			const prefix = line.slice(0, line.length - first.length);
			if (!CONTAINER_PREFIX.test(prefix)) continue;
			if (id !== undefined) labels.set(i, [...(labels.get(i) ?? []), { id, prefix }]);
			// Skip a code block's body so fence-like lines inside it aren't matched. A quote's children come
			// next in the walk and may start on its first line, so the scan resumes there.
			cursor = isQuote ? i : i + rawLines.length;
			return;
		}
	});
	if (labels.size === 0) return markdown;
	const out: string[] = [];
	lines.forEach((line, i) => {
		let current = line;
		for (const label of labels.get(i) ?? []) {
			const text = `\`#${label.id}\``;
			// Read the prefix from the line as rewritten so far: an outer label may already have taken a marker.
			const prefix = current.slice(0, label.prefix.length);
			const cont = continuationOf(prefix);
			if (cont !== prefix) {
				// The block starts on a list marker line: the label takes the marker, the block moves below it.
				out.push(prefix + text);
				current = cont + current.slice(prefix.length);
				continue;
			}
			// Separate a top-level label from a preceding paragraph. Nested labels skip the blank line, which
			// would make a tight list loose; a soft break still renders the label on its own line.
			if (cont === "" && out.length > 0 && out[out.length - 1].trim() !== "") out.push("");
			out.push(cont + text);
		}
		out.push(current);
	});
	return out.join("\n");
}

/** Session-wide registry. Identical block text maps to one number. */
export class BlockRegistry {
	private byText = new Map<string, NumberedBlock>();
	private ordered: NumberedBlock[] = [];

	reset(): void {
		this.byText.clear();
		this.ordered = [];
	}

	add(block: CodeBlock): NumberedBlock {
		const existing = this.byText.get(block.text);
		if (existing) return existing;
		const numbered = { ...block, id: this.ordered.length + 1 };
		this.byText.set(block.text, numbered);
		this.ordered.push(numbered);
		return numbered;
	}

	addAll(markdown: string): NumberedBlock[] {
		return extractBlocks(markdown).map((block) => this.add(block));
	}

	idFor(text: string): number | undefined {
		return this.byText.get(text)?.id;
	}

	get(id: number): NumberedBlock | undefined {
		return this.ordered[id - 1];
	}

	/** Newest first. */
	all(): NumberedBlock[] {
		return [...this.ordered].reverse();
	}

	get size(): number {
		return this.ordered.length;
	}
}

/** Short description used in the bar and picker, e.g. `ts · 14 lines` or `bash · docker compose up`. */
export function describe(block: CodeBlock, maxSnippet = 32): string {
	const lines = block.text.split("\n");
	const lang = block.lang || "text";
	if (lines.length === 1) {
		const line = lines[0].trim();
		return `${lang} · ${line.length > maxSnippet ? `${line.slice(0, maxSnippet - 1)}…` : line}`;
	}
	return `${lang} · ${lines.length} lines`;
}

/** The parts of a session entry that runTexts() reads. */
export interface EntryLike {
	type: string;
	parentId: string | null;
	customType?: string;
	message?: unknown;
}

/**
 * Assistant texts of the run that ends just before `parentId`, oldest first, one array per message.
 * Walks back until `startId`, the last entry before the run began, or an earlier entry of `stopType`
 * (the previous run's bar). User messages inside the run, such as steering, are skipped. Without a
 * `startId`, the walk stops at the first user message instead.
 */
export function runTexts(
	getEntry: (id: string) => EntryLike | undefined,
	parentId: string | null,
	stopType: string,
	startId?: string | null,
): string[][] {
	const messages: string[][] = [];
	for (let id = parentId; id !== null && id !== startId; ) {
		const entry = getEntry(id);
		if (!entry || (entry.type === "custom" && entry.customType === stopType)) break;
		if (entry.type === "message") {
			if (startId === undefined && (entry.message as { role?: string })?.role === "user") break;
			const texts = assistantText(entry.message);
			if (texts.length > 0) messages.unshift(texts);
		}
		id = entry.parentId;
	}
	return messages;
}

/** Text content of an assistant message, joined the way Pi renders separate text parts. */
export function assistantText(message: unknown): string[] {
	const m = message as { role?: string; content?: unknown };
	if (m?.role !== "assistant" || !Array.isArray(m.content)) return [];
	return m.content
		.filter((part): part is { type: "text"; text: string } => part?.type === "text" && typeof part.text === "string")
		.map((part) => part.text.trim());
}
