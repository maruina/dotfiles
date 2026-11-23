import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("./cli.mjs", import.meta.url));

export default function rexRecovery(pi: ExtensionAPI) {
  let saving = false;
  let lastSavedKey: string | null = null;
  async function save(force: boolean, ctx: ExtensionContext) {
    if (ctx.mode !== "tui" || !process.env.REX_SESSION || !process.env.REX_BLOCK || saving) return;
    const file = ctx.sessionManager.getSessionFile();
    if (!file) return;
    const key = `${file}\0${ctx.cwd}`;
    if (!force && key === lastSavedKey) return;
    saving = true;
    try {
      const result = await pi.exec(process.execPath, [cli, "--checkpoint", file, ctx.cwd, String(process.pid)], { timeout: 20000 });
      if (result.code === 0) lastSavedKey = key;
      else ctx.ui.notify(`Rex recovery checkpoint failed: ${result.stderr || result.stdout}`, "warning");
    } catch (error) {
      ctx.ui.notify(`Rex recovery checkpoint failed: ${String(error)}`, "warning");
    } finally {
      saving = false;
    }
  }
  pi.on("session_start", (_event, ctx) => {
    lastSavedKey = null;
    return save(true, ctx);
  });
  pi.on("agent_start", (_event, ctx) => save(false, ctx));
  pi.on("agent_settled", (_event, ctx) => save(false, ctx));
}
