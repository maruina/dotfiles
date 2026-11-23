import assert from "node:assert/strict";
import test from "node:test";

import statusline, { estimateContextTokens } from "./statusline.ts";

async function contextFooter(usage, statuses = new Map()) {
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
					{ onBranchChange: () => () => {}, getGitBranch: () => "main", getExtensionStatuses: () => statuses },
				);
			},
		},
	};
	statusline(pi);
	await pi.start({}, ctx);
	return footer.render(160);
}

test("context footer shows the configured context window", async () => {
	assert.match((await contextFooter({ tokens: 48_960, percent: 18, contextWindow: 272_000 }))[0].trimEnd(), /18% ctx · 82% left · 272\.0k total$/);
	assert.match((await contextFooter({ tokens: 180_000, percent: 18, contextWindow: 1_000_000 }))[0].trimEnd(), /18% ctx · 82% left · 1\.0m total$/);
});

test("context footer shows the context window with estimated post-compaction usage", async () => {
	assert.match((await contextFooter({ tokens: null, percent: null, contextWindow: 100 }))[0].trimEnd(), /~18% ctx · 82% left · 100 total$/);
});

test("context footer preserves unavailable context usage", async () => {
	assert.match((await contextFooter(undefined))[0].trimEnd(), /ctx n\/a$/);
});

test("footer renders other extension statuses alongside session-cost", async () => {
	const statuses = new Map([
		["session-cost", "$0.42"],
		["compute-guardrails", "🛡 guardrails"],
	]);
	const lines = await contextFooter(undefined, statuses);
	assert.match(lines[1], /\$0\.42/);
	assert.match(lines[1], /🛡 guardrails/);
});

test("statusline skips footer registration in non-TUI or headless sessions", async () => {
	let footerSet = false;
	let start;
	statusline({
		on(event, handler) {
			if (event === "session_start") start = handler;
		},
		getThinkingLevel: () => "off",
	});
	await start({}, { hasUI: false, mode: "json", ui: { setFooter: () => { footerSet = true; } } });
	assert.equal(footerSet, false);
});

function messageEntry(role, content) {
	return { type: "message", message: { role, content } };
}

function customMessageEntry(content) {
	return { type: "custom_message", content };
}

test("estimateContextTokens combines system prompt, message, and string custom_message entries", () => {
	assert.equal(estimateContextTokens([], ""), 0);
	assert.equal(estimateContextTokens([], "abcd".repeat(4)), 4);
	const entries = [
		messageEntry("user", [{ type: "text", text: "abcd" }]),
		messageEntry("assistant", [{ type: "text", text: "abcdefgh" }]),
		customMessageEntry("efgh"),
		customMessageEntry([{ type: "text", text: "ignored non-string custom_message" }]),
		{ type: "compaction", summary: "not a source entry" },
	];
	assert.equal(estimateContextTokens(entries, ""), 4);
	assert.equal(estimateContextTokens([messageEntry("user", [{ type: "text", text: "abcd" }])], "abcd".repeat(2)), 3);
});
