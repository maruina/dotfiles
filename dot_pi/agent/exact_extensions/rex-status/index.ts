import { copyToClipboard, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  createRexExecJson,
  formatRexPaneLocation,
  formatRexPanePrompt,
  listRexPanes,
  type RexPane,
} from "./panes.ts";
import { pickRexPane } from "./picker.ts";

export interface RexStatusDeps {
  listPanes?: (pi: ExtensionAPI) => Promise<RexPane[]>;
  pickPane?: (ctx: ExtensionContext, panes: RexPane[], initialQuery: string) => Promise<RexPane | undefined>;
  copy?: (text: string) => Promise<void>;
}

export function createRexStatusExtension(deps: RexStatusDeps = {}) {
  const loadPanes = deps.listPanes ?? ((pi: ExtensionAPI) => listRexPanes(createRexExecJson(pi)));
  const choosePane = deps.pickPane ?? pickRexPane;
  const copy = deps.copy ?? copyToClipboard;

  return function rexStatus(pi: ExtensionAPI) {
    pi.registerCommand("rex-status", {
      description: "Pick a Rex terminal pane and copy a capture reference for an agent",
      handler: async (args, ctx: ExtensionContext) => {
        if (!ctx.hasUI || ctx.mode !== "tui") {
          ctx.ui.notify("/rex-status requires an interactive TUI.", "warning");
          return;
        }

        let panes: RexPane[];
        try {
          panes = await loadPanes(pi);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          ctx.ui.notify(`Could not inspect Rex panes: ${message}`, "error");
          return;
        }

        if (panes.length === 0) {
          ctx.ui.notify("No Rex terminal panes found.", "info");
          return;
        }

        const picked = await choosePane(ctx, panes, args.trim());
        if (!picked) return;

        const snippet = formatRexPanePrompt(picked);
        try {
          await copy(snippet);
          ctx.ui.notify(`Copied Rex pane reference (${formatRexPaneLocation(picked)})`, "info");
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          ctx.ui.notify(`Copy failed (${message}).\n${snippet}`, "warning");
        }
      },
    });
  };
}

export default createRexStatusExtension();
