import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BlockRegistry, describe, type EntryLike, extractBlocks, labelMarkdown, runTexts } from "./blocks.ts";
import { DEFAULT_SHORTCUT, readConfig } from "./config.ts";
import { Marked } from "@earendil-works/pi-tui";

const lexer = (md: string) => new Marked().lexer(md);

const sample = [
	"Run this:",
	"```bash",
	"docker compose up -d",
	"```",
	"",
	"1. Then edit:",
	"   ```ts",
	"   const a = 1;",
	"   const b = 2;",
	"   ```",
	"",
	"~~~md",
	"You are a helpful reviewer.",
	"Be terse.",
	"~~~",
	"",
	"    indented code is ignored",
].join("\n");

test("extracts fenced blocks in order with raw text, including nested ones", () => {
	assert.deepEqual(extractBlocks(sample), [
		{ lang: "bash", text: "docker compose up -d" },
		{ lang: "ts", text: "const a = 1;\nconst b = 2;" },
		{ lang: "md", text: "You are a helpful reviewer.\nBe terse." },
	]);
});

test("keeps only the language word from the info string", () => {
	assert.deepEqual(extractBlocks("```python title=x.py\nprint(1)\n```"), [{ lang: "python", text: "print(1)" }]);
});

test("skips empty blocks", () => {
	assert.deepEqual(extractBlocks("```\n\n```"), []);
});

test("registry numbers blocks session-wide and dedupes identical text", () => {
	const registry = new BlockRegistry();
	const first = registry.addAll(sample);
	assert.deepEqual(
		first.map((b) => b.id),
		[1, 2, 3],
	);
	const second = registry.addAll("```bash\ndocker compose up -d\n```\n```sh\nls\n```");
	assert.deepEqual(
		second.map((b) => b.id),
		[1, 4],
	);
	assert.equal(registry.get(4)?.text, "ls");
	assert.deepEqual(
		registry.all().map((b) => b.id),
		[4, 3, 2, 1],
	);
});

test("labels top-level and nested blocks without changing their content", () => {
	const registry = new BlockRegistry();
	const labelled = labelMarkdown(sample, (block) => registry.add(block).id);
	assert.match(labelled, /Run this:\n\n`#1`\n```bash\ndocker compose up -d\n```/);
	assert.match(labelled, /1\. Then edit:\n {3}`#2`\n {3}```ts\n/);
	assert.match(labelled, /`#3`\n~~~md\n/);
	assert.deepEqual(extractBlocks(labelled), extractBlocks(sample));
	assert.equal(lexer(labelled).filter((t) => t.type === "list").length, 1);
});

test("labels a block nested in a bullet, skipping fence-like lines inside earlier blocks", () => {
	const md = [
		"- turned into this:",
		"   ```",
		"     The task died",
		"   ```",
		"   That error goes on.",
		"- next",
		"",
		"````md",
		"```",
		"inner",
		"```",
		"````",
		"- ```sh",
		"  ls",
		"  ```",
	].join("\n");
	const registry = new BlockRegistry();
	const labelled = labelMarkdown(md, (block) => registry.add(block).id);
	assert.match(labelled, /^- turned into this:\n {3}`#1`\n {3}```\n {5}The task died\n/);
	assert.match(labelled, /\n`#2`\n````md\n```\ninner\n```\n````\n/);
	assert.match(labelled, /\n- `#3`\n {2}```sh\n {2}ls\n/);
	assert.deepEqual(extractBlocks(labelled), extractBlocks(md));
});

test("an empty fence before a block doesn't take its label", () => {
	const registry = new BlockRegistry();
	const md = "```sh\n```\n\n```sh\nreal\n```";
	assert.equal(labelMarkdown(md, (block) => registry.add(block).id), "```sh\n```\n\n`#1`\n```sh\nreal\n```");
	assert.equal(registry.get(1)?.text, "real");
});

test("a quote that opens with a fence labels both on that line, and later blocks keep theirs", () => {
	const registry = new BlockRegistry();
	const md = "> ```sh\n> first\n> ```\n\n```sh\nsecond\n```\n\n- > ```sh\n  > third\n  > ```";
	const labelled = labelMarkdown(md, (block) => registry.add(block).id);
	assert.match(labelled, /^`#1`\n> `#2`\n> ```sh\n> first\n/);
	assert.match(labelled, /\n`#3`\n```sh\nsecond\n/);
	assert.match(labelled, /\n- `#4`\n {2}> `#5`\n {2}> ```sh\n {2}> third\n/);
	assert.deepEqual([2, 3, 5].map((id) => registry.get(id)?.text), ["first", "second", "third"]);
});

test("labels sharing a line each take their own list marker", () => {
	const registry = new BlockRegistry();
	const md = "- > 2. ```sh\n  >    ls\n  >    ```";
	const labelled = labelMarkdown(md, (block) => registry.add(block).id);
	assert.equal(labelled, "- `#1`\n  > 2. `#2`\n  >    ```sh\n  >    ls\n  >    ```");
	assert.deepEqual(
		extractBlocks(labelled).map((block) => block.text),
		["2. `#2`\n   ```sh\n   ls\n   ```", "ls"],
	);
});

test("leaves markdown without code untouched", () => {
	const md = "Just *prose*.\n\nNothing to copy.";
	assert.equal(
		labelMarkdown(md, () => 1),
		md,
	);
});

const review = [
	"File: src/mod.rs",
	"Line: 371",
	"",
	"> Nonblocking: we own `merged`, so could we iterate by value?",
	"> The fallback can stay.",
	">",
	"> > nested quote",
	">",
	"> ```rs",
	"> let a = 1;",
	"> ```",
	"",
	"- item",
	"  > quote in a list",
].join("\n");

test("extracts outermost blockquotes as markdown without the > markers", () => {
	assert.deepEqual(extractBlocks(review), [
		{
			lang: "quote",
			text: "Nonblocking: we own `merged`, so could we iterate by value?\nThe fallback can stay.\n\n> nested quote\n\n```rs\nlet a = 1;\n```",
		},
		{ lang: "rs", text: "let a = 1;" },
		{ lang: "quote", text: "quote in a list" },
	]);
});

test("skips empty blockquotes", () => {
	assert.deepEqual(extractBlocks(">\n>"), []);
});

test("labels blockquotes and blocks nested in them", () => {
	const registry = new BlockRegistry();
	const labelled = labelMarkdown(review, (block) => registry.add(block).id);
	assert.match(labelled, /Line: 371\n\n`#1`\n> Nonblocking/);
	assert.match(labelled, /\n>\n> `#2`\n> ```rs\n/);
	assert.match(labelled, /- item\n {2}`#3`\n {2}> quote in a list/);
	const blocks = extractBlocks(labelled);
	assert.deepEqual(blocks.slice(1), extractBlocks(review).slice(1));
	assert.equal(registry.size, 3);
});

test("runTexts collects the run's assistant texts back to the prompt or the previous bar", () => {
	const assistant = (...texts: string[]) => ({ role: "assistant", content: texts.map((text) => ({ type: "text", text })) });
	const chain: [string, EntryLike][] = [
		["u1", { type: "message", parentId: null, message: { role: "user", content: "hi" } }],
		["a1", { type: "message", parentId: "u1", message: assistant("old run") }],
		["bar1", { type: "custom", customType: "copycat", parentId: "a1" }],
		["a2", { type: "message", parentId: "bar1", message: assistant("continued, no prompt") }],
		["u2", { type: "message", parentId: "a2", message: { role: "user", content: "next" } }],
		["a3", { type: "message", parentId: "u2", message: assistant("first", "second part") }],
		["t1", { type: "message", parentId: "a3", message: { role: "toolResult", content: [] } }],
		["m1", { type: "model_change", parentId: "t1" }],
		["a4", { type: "message", parentId: "m1", message: { role: "assistant", content: [{ type: "toolCall" }] } }],
		["a5", { type: "message", parentId: "a4", message: assistant("final") }],
	];
	const entries = new Map(chain);
	const get = (id: string) => entries.get(id);
	assert.deepEqual(runTexts(get, "a5", "copycat"), [["first", "second part"], ["final"]]);
	assert.deepEqual(runTexts(get, "a2", "copycat"), [["continued, no prompt"]]);
	assert.deepEqual(runTexts(get, "u2", "copycat"), []);
	assert.deepEqual(runTexts(get, "missing", "copycat"), []);
	// With the run's start known, a steering message inside the run doesn't cut it short.
	assert.deepEqual(runTexts(get, "a5", "copycat", "a2"), [["first", "second part"], ["final"]]);
	// An earlier bar still ends the walk, even when the recorded start is further back.
	assert.deepEqual(runTexts(get, "a5", "copycat", "a1"), [["continued, no prompt"], ["first", "second part"], ["final"]]);
	assert.deepEqual(runTexts(get, "a5", "copycat", "a3"), [["final"]]);
	assert.deepEqual(runTexts(get, "a2", "copycat", null), [["continued, no prompt"]]);
});

test("describe shows a snippet for one-liners and a line count otherwise", () => {
	assert.equal(describe({ lang: "bash", text: "ls -la" }), "bash · ls -la");
	assert.equal(describe({ lang: "", text: "a\nb\nc" }), "text · 3 lines");
	assert.equal(describe({ lang: "sh", text: "x".repeat(50) }, 10), `sh · ${"x".repeat(9)}…`);
});

test("config: defaults, overrides, opt-outs, and bad values", () => {
	const dir = mkdtempSync(join(tmpdir(), "copycat-"));
	const withConfig = (content: string) => {
		const path = join(dir, `${Math.random()}.json`);
		writeFileSync(path, content);
		return readConfig(path);
	};
	const defaults = { shortcut: DEFAULT_SHORTCUT, promptRule: true, warnings: [] };
	assert.deepEqual(readConfig(join(dir, "missing.json")), defaults);
	assert.deepEqual(withConfig("{}"), defaults);
	assert.deepEqual(withConfig('{"shortcut": "Ctrl+Shift+Y"}'), { ...defaults, shortcut: "ctrl+shift+y" });
	assert.deepEqual(withConfig('{"shortcut": "alt+enter"}'), { ...defaults, shortcut: "alt+enter" });
	assert.deepEqual(withConfig('{"shortcut": ""}'), { ...defaults, shortcut: undefined });
	assert.deepEqual(withConfig('{"shortcut": false, "promptRule": false}'), { ...defaults, shortcut: undefined, promptRule: false });
	for (const bad of ['{"shortcut": "hyper+c"}', '{"shortcut": 3}', '{"promptRule": "no"}', "not json", "[]"]) {
		const config = withConfig(bad);
		assert.equal(config.shortcut, DEFAULT_SHORTCUT, bad);
		assert.equal(config.promptRule, true, bad);
		assert.equal(config.warnings.length, 1, bad);
	}
});
