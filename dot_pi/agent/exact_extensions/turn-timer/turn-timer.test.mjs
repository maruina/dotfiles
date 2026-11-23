import assert from "node:assert/strict";
import test from "node:test";

import { formatDuration } from "./_format.ts";
import turnTimer from "./index.ts";

test("formatDuration renders tenths below 60s and whole seconds at 60s and above", () => {
	assert.equal(formatDuration(-5), "0.0s");
	assert.equal(formatDuration(420), "0.4s");
	assert.equal(formatDuration(59_960), "1m 0s");
	assert.equal(formatDuration(83_000), "1m 23s");
	assert.equal(formatDuration(3_725_000), "1h 2m 5s");
});

test("turn-timer emits a display-only timing message on agent_settled and strips it from LLM context", () => {
	const handlers = new Map();
	const sent = [];
	turnTimer({
		on(event, handler) {
			handlers.set(event, handler);
		},
		registerMessageRenderer() {},
		sendMessage(message, options) {
			sent.push({ message, options });
		},
	});

	assert.equal(handlers.has("agent_end"), false);
	assert.equal(handlers.has("agent_settled"), true);

	handlers.get("before_agent_start")();
	handlers.get("agent_settled")({}, { hasUI: true });
	assert.equal(sent.length, 1);
	assert.equal(sent[0].message.customType, "turn-timer");
	assert.equal(sent[0].message.display, true);
	assert.deepEqual(sent[0].options, { triggerTurn: false });

	const filtered = handlers.get("context")({
		messages: [{ role: "user", content: "hi" }, { role: "custom", customType: "turn-timer", content: "⏱ 0.1s" }],
	});
	assert.deepEqual(filtered, { messages: [{ role: "user", content: "hi" }] });
});
