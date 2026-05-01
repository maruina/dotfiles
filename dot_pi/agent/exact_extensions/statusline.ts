import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

function formatTokens(tokens: number): string {
	if (tokens < 1_000) return `${tokens}`;
	if (tokens < 1_000_000) return `${(tokens / 1_000).toFixed(1)}k`;
	return `${(tokens / 1_000_000).toFixed(1)}m`;
}

function formatContext(usage: { tokens: number | null; contextWindow: number; percent: number | null } | undefined): string {
	if (!usage || usage.tokens === null) return "ctx n/a";
	const percent = usage.percent ?? (usage.contextWindow > 0 ? (usage.tokens / usage.contextWindow) * 100 : null);
	if (percent === null) return `${formatTokens(usage.tokens)} ctx`;
	const left = Math.max(0, 100 - percent);
	return `${percent.toFixed(0)}% ctx · ${left.toFixed(0)}% left`;
}

function shortModel(id?: string): string {
	if (!id) return "no model";
	return id
		.replace(/^anthropic\//, "")
		.replace(/^openai\//, "")
		.replace(/^google\//, "")
		.replace(/^claude-/, "")
		.replace(/^gpt-/, "gpt ");
}

function sandboxStatus(): string | undefined {
	if (process.env.SHADOWFAX_INDICATOR === "0") return undefined;
	if (!process.env.NONO_CAP_FILE) return undefined;
	return "🐎 Shadowfax";
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.setFooter((tui, theme, footerData) => {
			const unsubBranch = footerData.onBranchChange(() => tui.requestRender());
			const unsubThinking = pi.on("thinking_level_select", async () => {
				tui.requestRender();
			});

			return {
				dispose() {
					unsubBranch();
					if (typeof unsubThinking === "function") unsubThinking();
				},
				invalidate() {},
				render(width: number): string[] {
					let input = 0;
					let output = 0;
					let cost = 0;

					for (const entry of ctx.sessionManager.getBranch()) {
						if (entry.type !== "message" || entry.message.role !== "assistant") continue;
						const message = entry.message as AssistantMessage;
						input += message.usage?.input ?? 0;
						output += message.usage?.output ?? 0;
						cost += message.usage?.cost?.total ?? 0;
					}

					const context = formatContext(ctx.getContextUsage());
					const branch = footerData.getGitBranch();
					const dir = process.cwd().split("/").pop() || "";
					const sandbox = sandboxStatus();

					const thinking = pi.getThinkingLevel();
					const leftParts = [
						dir ? `📁 ${dir}` : undefined,
						branch ? `⎇ ${branch}` : "⎇ no git",
						shortModel(ctx.model?.id),
						thinking !== "off" ? thinking : undefined,
					].filter(Boolean);

					const rightParts = [
						context,
						`↑${formatTokens(input)}`,
						`↓${formatTokens(output)}`,
						`$${cost.toFixed(3)}`,
						sandbox,
					].filter(Boolean);

					const left = theme.fg("accent", leftParts.join("  "));
					const right = theme.fg("dim", rightParts.join("  "));
					const padding = " ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)));

					return [truncateToWidth(left + padding + right, width, "")];
				},
			};
		});
	});
}
