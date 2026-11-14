import type { AssistantMessage } from "@earendil-works/pi-ai";
import { estimateTokens, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

function formatTokens(tokens: number): string {
	if (tokens < 1_000) return `${tokens}`;
	if (tokens < 1_000_000) return `${(tokens / 1_000).toFixed(1)}k`;
	return `${(tokens / 1_000_000).toFixed(1)}m`;
}

function formatContext(usage: { tokens: number | null; contextWindow: number; percent: number | null } | undefined, estimated = false): string {
	if (!usage || usage.tokens === null) return "ctx n/a";
	const prefix = estimated ? "~" : "";
	const percent = usage.percent ?? (usage.contextWindow > 0 ? (usage.tokens / usage.contextWindow) * 100 : null);
	if (percent === null) return `${prefix}${formatTokens(usage.tokens)} ctx`;
	const left = Math.max(0, 100 - percent);
	return `${prefix}${percent.toFixed(0)}% ctx · ${left.toFixed(0)}% left`;
}

// Pi reports tokens: null after a compaction until the next assistant response
// (unknown until the next LLM call). Estimate the post-compaction context from
// the branch with the same per-entry estimator Pi uses, plus a chars/4 system
// prompt estimate (the system message entry stores sections, which
// estimateTokens does not count).
export function estimateContextTokens(entries: readonly unknown[], systemPrompt: string): number {
	let tokens = Math.ceil(systemPrompt.length / 4);
	for (const entry of entries) {
		const e = entry as { type: string; message?: unknown; content?: unknown };
		if (e.type === "message" && e.message) {
			tokens += estimateTokens(e.message as Parameters<typeof estimateTokens>[0]);
		} else if (e.type === "custom_message" && typeof e.content === "string") {
			tokens += Math.ceil(e.content.length / 4);
		}
	}
	return tokens;
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

function modelCapabilities(model: unknown): string {
	const m = model as { reasoning?: boolean; thinkingLevelMap?: Record<string, string | null | undefined>; input?: string[] } | undefined;
	const parts: string[] = [];

	if (m?.reasoning) {
		const labels = [
			["minimal", "Mi"],
			["low", "L"],
			["medium", "Me"],
			["high", "H"],
			["xhigh", "X"],
		] as const;
		const levels = labels.filter(([level]) => m.thinkingLevelMap?.[level] !== null).map(([, label]) => label);
		if (levels.length > 0) parts.push(`T:${levels.join("/")}`);
	}

	if (m?.input?.includes("image")) parts.push("I");
	return parts.join(" ");
}

function modelStatus(model: unknown): string {
	const m = model as { id?: string; name?: string } | undefined;
	const label = m?.name ?? shortModel(m?.id);
	const capabilities = modelCapabilities(model);
	return [label, capabilities].filter(Boolean).join(" ");
}

function sandboxStatus(): string | undefined {
	if (process.env.SHADOWFAX_INDICATOR === "0") return undefined;
	if (!process.env.NONO_CAP_FILE) return undefined;
	return "🐎 Shadowfax";
}

function renderLine(left: string, right: string, width: number): string {
	const maxLeftWidth = width - visibleWidth(right) - 1;
	if (maxLeftWidth < 1) return truncateToWidth(right, width, "");

	const truncatedLeft = truncateToWidth(left, maxLeftWidth, "");
	const padding = " ".repeat(Math.max(1, width - visibleWidth(truncatedLeft) - visibleWidth(right)));
	return truncatedLeft + padding + right;
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

					for (const entry of ctx.sessionManager.getBranch()) {
						if (entry.type !== "message" || entry.message.role !== "assistant") continue;
						const message = entry.message as AssistantMessage;
						input += message.usage?.input ?? 0;
						output += message.usage?.output ?? 0;
					}

					const contextUsage = ctx.getContextUsage();
					const context =
						contextUsage && contextUsage.tokens === null
							? formatContext(
								{
									tokens: estimateContextTokens(ctx.sessionManager.getBranch(), ctx.getSystemPrompt()),
									contextWindow: contextUsage.contextWindow,
									percent: null,
								},
								true,
							)
							: formatContext(contextUsage);
					const branch = footerData.getGitBranch();
					const dir = process.cwd().split("/").pop() || "";
					const sandbox = sandboxStatus();

					const thinking = pi.getThinkingLevel();
					const location = [dir ? `📁 ${dir}` : undefined, branch ? `⎇ ${branch}` : "⎇ no git"]
						.filter(Boolean)
						.join("  ");
					const llm = [modelStatus(ctx.model), thinking !== "off" ? thinking : undefined].filter(Boolean).join("  ");

					// Cost comes from the session-cost extension's AI Gateway estimate (via setStatus),
					// not client-side usage.cost, which is $0 for AI-Gateway-routed models with no per-token price.
					const costStatus = footerData.getExtensionStatuses().get("session-cost");
					const costText = costStatus ?? theme.fg("dim", "$—");

					const usageParts = [
						theme.fg("dim", `↑${formatTokens(input)}`),
						theme.fg("dim", `↓${formatTokens(output)}`),
						costText,
						sandbox ? theme.fg("dim", sandbox) : undefined,
					].filter(Boolean);

					const left = theme.fg("accent", location);
					const right = theme.fg("dim", context);
					const llmInfo = theme.fg("accent", llm);
					const usage = usageParts.join("  ");

					return [renderLine(left, right, width), renderLine(llmInfo, usage, width)];
				},
			};
		});
	});
}
