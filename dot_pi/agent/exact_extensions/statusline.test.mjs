import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";

import statusline, { estimateContextTokens } from "./statusline.ts";

async function contextFooter(usage, statuses = new Map(), cwd = "/tmp/my-session-repo", width = 160) {
	let footer;
	const pi = {
		on(event, handler) {
			if (event === "session_start") this.start = handler;
		},
		getThinkingLevel: () => "off",
	};
	const ctx = {
		cwd,
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
	return footer.render(width);
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

const prOpen = "\x1b]8;;https://github.com/maruina/dotfiles/pull/42\x1b\\";
const prClose = "\x1b]8;;\x1b\\";
const prLeft = `[open] ${prOpen}#42 A pull request with a long title${prClose}`;

test("footer puts PR status below the unchanged model line and aligns the right segment", async () => {
	const base = await contextFooter(undefined);
	const right = "✓ CI  💬 2";
	const status = new Map([["pr-status", `${prLeft}\t${right}`]]);
	const lines = await contextFooter(undefined, status);
	assert.deepEqual(lines.slice(0, 2), base);
	assert.equal(lines.length, 3);
	assert.ok(lines[2].startsWith(prLeft));
	assert.ok(lines[2].endsWith(right));
	assert.equal(visibleWidth(lines[2]), 160);
});

test("footer supports left-only PR status and preserves the two lines when PR status is empty", async () => {
	const base = await contextFooter(undefined);
	assert.equal(base.length, 2);
	assert.deepEqual(await contextFooter(undefined, new Map([["pr-status", ""]])), base);
	for (const status of [prLeft, `${prLeft}\t`]) {
		const lines = await contextFooter(undefined, new Map([["pr-status", status]]));
		assert.deepEqual(lines.slice(0, 2), base);
		assert.equal(lines[2].trimEnd(), prLeft);
	}
});

test("footer keeps the OSC 8 link closed when it truncates a PR title", async () => {
	const status = new Map([["pr-status", `${prLeft}\t✓ CI`]]);
	const lines = await contextFooter(undefined, status, undefined, 24);
	assert.equal(lines.length, 3);
	assert.equal(visibleWidth(lines[2]), 24);
	assert.ok(lines[2].includes(`${prOpen}#42`));
	assert.ok(lines[2].includes(prClose));
	assert.ok(lines[2].endsWith("✓ CI"));
	assert.ok(!lines[2].includes("long title"));
});

test("footer displays the basename of ctx.cwd rather than process.cwd()", async () => {
	const lines = await contextFooter(undefined, new Map(), "/some/other/worktree-dir");
	assert.match(lines[0], /📁 worktree-dir/);
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
