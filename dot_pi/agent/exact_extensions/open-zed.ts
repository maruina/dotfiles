import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("zed", {
    description: "Open Zed editor in the current directory",
    handler: async (_args, ctx) => {
      await pi.exec("zed", [ctx.cwd], { timeout: 1000 });
      ctx.ui.notify("Zed opened", "info");
    },
  });
}
