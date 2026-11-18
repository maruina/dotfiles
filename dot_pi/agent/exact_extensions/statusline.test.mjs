import assert from "node:assert/strict";
import test from "node:test";

import statusline, { estimateContextTokens } from "./statusline.ts";

async function contextFooter(usage) {
	let footer;
	const pi = {
		on(event, handler) {
			if (event === "session_start") this.start = handler;
		},
		getThinkingLevel: () => "off",
	};
	const ctx = {
		getContextUsage: () => usage,
		getSystemPrompt: () => "abcd".repeat(18),
		sessionManager: { getBranch: () => [] },
		ui: {
			setFooter(factory) {
				footer = factory(
					{ requestRender() {} },
					{ fg: (_color, text) => text },
					{ onBranchChange: () => () => {}, getGitBranch: () => "main", getExtensionStatuses: () => new Map() },
				);
			},
		},
	};
	statusline(pi);
	await pi.start({}, ctx);
	return footer.render(160)[0].trimEnd();
}

test("context footer shows the configured context window", async () => {
	assert.match(await contextFooter({ tokens: 48_960, percent: 18, contextWindow: 272_000 }), /18% ctx · 82% left · 272\.0k total$/);
	assert.match(await contextFooter({ tokens: 180_000, percent: 18, contextWindow: 1_000_000 }), /18% ctx · 82% left · 1\.0m total$/);
});

test("context footer shows the context window with estimated post-compaction usage", async () => {
	assert.match(await contextFooter({ tokens: null, percent: null, contextWindow: 100 }), /~18% ctx · 82% left · 100 total$/);
});

test("context footer preserves unavailable context usage", async () => {
	assert.match(await contextFooter(undefined), /ctx n\/a$/);
});

function messageEntry(role, content) {
	return { type: "message", message: { role, content } };
}

function customMessageEntry(content) {
	return { type: "custom_message", content };
}

test("estimateContextTokens returns 0 for an empty branch without a system prompt", () => {
	assert.equal(estimateContextTokens([], ""), 0);
});

test("estimateContextTokens estimates the system prompt at chars/4", () => {
	assert.equal(estimateContextTokens([], "abcd".repeat(4)), 4);
});

test("estimateContextTokens counts message and custom_message entries", () => {
	const entries = [
		messageEntry("user", [{ type: "text", text: "abcd" }]),
		messageEntry("assistant", [{ type: "text", text: "abcdefgh" }]),
		customMessageEntry("efgh"),
		{ type: "compaction", summary: "not a source entry" },
	];
	assert.equal(estimateContextTokens(entries, ""), 4);
});

test("estimateContextTokens ignores non-string custom_message content", () => {
	const entries = [customMessageEntry([{ type: "text", text: "ignored by the statusline estimator" }])];
	assert.equal(estimateContextTokens(entries, ""), 0);
});

test("estimateContextTokens adds the system prompt to the branch estimate", () => {
	const entries = [messageEntry("user", [{ type: "text", text: "abcd" }])];
	assert.equal(estimateContextTokens(entries, "abcd".repeat(2)), 3);
});
