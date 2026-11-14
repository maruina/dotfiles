import assert from "node:assert/strict";
import test from "node:test";

import { estimateContextTokens } from "./statusline.ts";

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
