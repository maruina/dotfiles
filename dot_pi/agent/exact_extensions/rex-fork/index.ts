import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { runTabFork, publishStartupReceipt } from "./_fork.ts";

export default function rexFork(pi: ExtensionAPI) {
  let generation = 0;
  let prompts = 0;
  let active = false;
  const invalidate = () => { generation++; prompts = 0; };
  pi.on("session_shutdown", invalidate);
  pi.on("session_start", async (_event, ctx) => {
    invalidate();
    const epoch = generation;
    try { await publishStartupReceipt(pi, ctx, () => generation === epoch); }
    catch (error) { ctx.ui.notify(`Rex fork startup receipt failed: ${String(error)}`, "warning"); }
  });
  pi.on("ui_prompt_start", () => { prompts++; });
  pi.on("ui_prompt_end", () => { prompts = Math.max(0, prompts - 1); });
  pi.registerCommand("rex-fork", {
    description: "Fork this settled conversation into a verified Rex tab or split",
    getArgumentCompletions: prefix => ["tab", "right", "below"].filter(value => value.startsWith(prefix)).map(value => ({ value, label: value })),
    handler: async (args, ctx: ExtensionContext) => {
      const destination = args.trim();
      if (destination !== "tab" && destination !== "right" && destination !== "below") {
        ctx.ui.notify("Usage: /rex-fork tab|right|below (one argument required).", "warning");
        return;
      }
      if (ctx.mode !== "tui" || active || prompts > 0 || !ctx.isIdle() || ctx.hasPendingMessages()) {
        ctx.ui.notify("Rex fork refused: use a settled TUI with no pending messages, UI prompt, or fork operation.", "warning");
        return;
      }
      const epoch = generation;
      const file = ctx.sessionManager.getSessionFile();
      const id = ctx.sessionManager.getSessionId();
      const leaf = ctx.sessionManager.getLeafId();
      const current = () => generation === epoch && ctx.sessionManager.getSessionFile() === file
        && ctx.sessionManager.getSessionId() === id && ctx.sessionManager.getLeafId() === leaf;
      const settled = () => current() && prompts === 0 && ctx.isIdle() && !ctx.hasPendingMessages();
      active = true;
      try { await runTabFork(pi, ctx, current, settled, destination); }
      catch (error) { ctx.ui.notify(`Rex fork refused: ${error instanceof Error ? error.message : String(error)}`, "error"); }
      finally { active = false; }
    },
  });
}
