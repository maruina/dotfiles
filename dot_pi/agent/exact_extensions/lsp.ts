/** Generic LSP extension for Go, TypeScript/JavaScript, YAML, Helm, and Terraform. */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerLspExtension } from "./lsp/tools";

export default function lspExtension(pi: ExtensionAPI) {
  registerLspExtension(pi);
}
