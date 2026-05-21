import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

const DESIGN_PROMPT = `# Design mode

You are in design mode. Treat this as a collaborative whiteboarding session, not an implementation session.

Rules while design mode is on:
- Discuss assumptions, tradeoffs, and simpler alternatives before proposing implementation.
- Ask when requirements are unclear.
- Do not edit code.
- If writing is useful, write only Markdown notes under .pi/.
- Keep outputs concise and decision-oriented.`;

let designOn = false;

function syncCmuxDesignStatus(pi: ExtensionAPI, on: boolean): void {
	if (on) {
		pi.events.emit("cmux:lock-status", { value: "plan-mode" });
	} else {
		pi.events.emit("cmux:unlock-status", {});
	}
}

function applyActiveTools(pi: ExtensionAPI, on: boolean): void {
	const active = new Set(pi.getActiveTools());
	if (on) {
		active.delete("edit");
		active.delete("write");
	} else {
		active.add("edit");
		active.add("write");
	}
	pi.setActiveTools([...active]);
}

export default function designExtension(pi: ExtensionAPI): void {
	pi.on("session_start", () => {
		syncCmuxDesignStatus(pi, designOn);
	});

	pi.on("before_agent_start", async (event) => {
		if (!designOn) return;
		return { systemPrompt: `${event.systemPrompt}\n\n${DESIGN_PROMPT}` };
	});

	pi.registerCommand("design", {
		description: "Toggle design mode. Optional argument is sent as a user message.",
		handler: async (args, ctx: ExtensionCommandContext) => {
			designOn = !designOn;
			applyActiveTools(pi, designOn);
			syncCmuxDesignStatus(pi, designOn);
			ctx.ui.notify(designOn ? "design mode: on" : "design mode: off", "info");

			const text = args.trim();
			if (text.length > 0) pi.sendUserMessage(text);
		},
	});
}
