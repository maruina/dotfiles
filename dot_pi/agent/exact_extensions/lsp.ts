/** Generic LSP extension for Go and TypeScript/JavaScript. */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerLspExtension } from "./lsp/tools";

export default function lspExtension(pi: ExtensionAPI) {
  registerLspExtension(pi);
}
