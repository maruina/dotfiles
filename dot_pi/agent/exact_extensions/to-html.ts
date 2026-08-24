import { randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { lexer, Marked, type Token, type Tokens } from "marked";
import hljs from "highlight.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";

const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_MERMAID_DIAGRAMS = 20;
export const MAX_PREVIEW_BYTES = 50 * 1024 * 1024;
const MAX_PREVIEW_FILES = 10;
const MAX_PREVIEW_AGE_MS = 24 * 60 * 60 * 1000;
const PREVIEW_DIRECTORY = path.join(os.tmpdir(), "pi-to-html");
const PREVIEW_PREFIX = "response-";
const PREVIEW_NAME = /^response-\d+-[0-9a-f-]+\.html$/i;
const MERMAID_LANGUAGE = "pi-to-html-mermaid";
const require = createRequire(import.meta.url);

type ResponseSelection =
  | { status: "ok"; text: string }
  | { status: "missing" }
  | { status: "incomplete" };

type InputValidation =
  | { ok: true }
  | { ok: false; reason: "input-too-large" | "too-many-mermaid-diagrams" };

type MarkdownToken = Tokens.Generic & {
  lang?: string;
  raw?: string;
  tokens?: MarkdownToken[];
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const isSafeLink = (href: string): boolean => {
  const value = href.trim();
  if (!value || /[\u0000-\u001F\u007F]/.test(value)) return false;
  if (value.startsWith("#")) return true;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  if (value.startsWith("./") || value.startsWith("../")) return true;

  const scheme = value.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (scheme) return scheme === "http" || scheme === "https" || scheme === "mailto";

  return !value.includes(":");
};

const isCompleteCodeFence = (raw: string): boolean => {
  const opener = raw.match(/^ {0,3}(`{3,}|~{3,})/);
  if (!opener) return false;

  const fence = opener[1];
  const source = raw.trimEnd();
  const close = new RegExp(`\\n${fence[0]}{${fence.length},}[ \\t]*$`);
  return close.test(source);
};

const markCompleteMermaidTokens = (tokens: MarkdownToken[]): number => {
  let count = 0;
  for (const token of tokens) {
    if (
      token.type === "code" &&
      token.lang?.trim().split(/\s+/, 1)[0]?.toLowerCase() === "mermaid" &&
      typeof token.raw === "string" &&
      isCompleteCodeFence(token.raw)
    ) {
      token.lang = MERMAID_LANGUAGE;
      count += 1;
    }
    if (token.tokens) count += markCompleteMermaidTokens(token.tokens);
  }
  return count;
};

const tokenize = (source: string): { tokens: MarkdownToken[]; mermaidCount: number } => {
  const tokens = lexer(source) as MarkdownToken[];
  return { tokens, mermaidCount: markCompleteMermaidTokens(tokens) };
};

export const validateInput = (source: string): InputValidation => {
  if (Buffer.byteLength(source, "utf8") > MAX_RESPONSE_BYTES) {
    return { ok: false, reason: "input-too-large" };
  }
  if (tokenize(source).mermaidCount > MAX_MERMAID_DIAGRAMS) {
    return { ok: false, reason: "too-many-mermaid-diagrams" };
  }
  return { ok: true };
};

const createMarkdownRenderer = (): Marked => {
  const renderer = {
    html({ text }: Tokens.HTML | Tokens.Tag): string {
      return escapeHtml(text);
    },
    link(this: { parser: { parseInline(tokens: Token[]): string } }, {
      href,
      tokens,
    }: Tokens.Link): string {
      const text = this.parser.parseInline(tokens);
      if (!isSafeLink(href)) return `<span>${text}</span>`;
      return `<a href="${escapeHtml(href)}" rel="noopener noreferrer">${text}</a>`;
    },
    image({ text }: Tokens.Image): string {
      return `<span class="image">${escapeHtml(text)}</span>`;
    },
    code({ text, lang }: Tokens.Code): string {
      if (lang === MERMAID_LANGUAGE) {
        return `<pre class="mermaid">${escapeHtml(text)}</pre>`;
      }

      const language = lang?.trim().split(/\s+/, 1)[0];
      const highlighted = language && hljs.getLanguage(language)
        ? hljs.highlight(text, { language }).value
        : escapeHtml(text);
      const className = language ? ` class="language-${escapeHtml(language)}"` : "";
      return `<pre><code${className}>${highlighted}</code></pre>`;
    },
  };

  return new Marked({ gfm: true, renderer });
};

const inlineMermaidBundle = (bundle: string): string =>
  bundle.replace(/<\/script/gi, "<\\/script");

export const renderHtml = (source: string, mermaidBundle: string): string => {
  const { tokens } = tokenize(source);
  const body = createMarkdownRenderer().parser(tokens);
  const bundle = inlineMermaidBundle(mermaidBundle);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pi response preview</title>
<style>
:root { color-scheme: light dark; font-family: system-ui, sans-serif; line-height: 1.5; }
body { max-width: 72rem; margin: 2rem auto; padding: 0 1rem; }
pre { overflow-x: auto; padding: 1rem; border-radius: .4rem; background: #1e1e1e; color: #f8f8f2; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
a { color: #4c8bf5; }
table { border-collapse: collapse; margin: 1rem 0; max-width: 100%; }
th, td { border: 1px solid currentColor; padding: .5rem; text-align: left; vertical-align: top; }
th { font-weight: 700; }
.image { color: #6b7280; }
.mermaid-error { border: 1px solid #b45309; }
.mermaid-error p { color: #b45309; font-weight: 600; }
</style>
</head>
<body>
<main>${body}</main>
<script>
${bundle}
const mermaid = globalThis.mermaid;
mermaid.initialize({ securityLevel: "strict", startOnLoad: false });
void (async () => {
  for (const [index, placeholder] of document.querySelectorAll("pre.mermaid").entries()) {
    const source = placeholder.textContent ?? "";
    try {
      const { svg } = await mermaid.render("pi-to-html-" + index, source);
      placeholder.outerHTML = svg;
    } catch (error) {
      const panel = document.createElement("div");
      panel.className = "mermaid-error";
      const message = document.createElement("p");
      message.textContent = "Diagram unavailable";
      const detail = document.createElement("p");
      detail.textContent = error instanceof Error ? error.message : String(error);
      const fallback = document.createElement("pre");
      fallback.textContent = source;
      panel.append(message, detail, fallback);
      placeholder.replaceWith(panel);
    }
  }
})();
</script>
</body>
</html>`;
};

export const selectLatestAssistantText = (entries: readonly SessionEntry[]): ResponseSelection => {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.type !== "message" || entry.message.role !== "assistant") continue;
    if (entry.message.stopReason !== "stop") return { status: "incomplete" };

    const text = entry.message.content
      .filter((block): block is { type: "text"; text: string } => block.type === "text")
      .map((block) => block.text)
      .join("\n");
    return text ? { status: "ok", text } : { status: "missing" };
  }
  return { status: "missing" };
};

const loadMermaidBundle = (): Promise<string> =>
  readFile(require.resolve("mermaid/dist/mermaid.min.js"), "utf8");

type PreviewEntry = {
  path: string;
  name: string;
  size: number;
  modifiedMs: number;
};

type PreviewStorageOptions = {
  directory?: string;
  now?: () => number;
  randomUuid?: () => string;
  maxAgeMs?: number;
  maxFiles?: number;
  maxBytes?: number;
  removeFile?: (filePath: string) => Promise<void>;
};

const previewStorageError = (message: string): Error => new Error(message);

export const createPreviewStorage = (options: PreviewStorageOptions = {}) => {
  const directory = options.directory ?? PREVIEW_DIRECTORY;
  const now = options.now ?? Date.now;
  const randomUuid = options.randomUuid ?? randomUUID;
  const maxAgeMs = options.maxAgeMs ?? MAX_PREVIEW_AGE_MS;
  const maxFiles = options.maxFiles ?? MAX_PREVIEW_FILES;
  const maxBytes = options.maxBytes ?? MAX_PREVIEW_BYTES;
  const removeFile = options.removeFile ?? (async (filePath: string) => {
    await rm(filePath);
  });

  const ensureDirectory = async (): Promise<void> => {
    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const details = await lstat(directory);
      if (!details.isDirectory() || details.isSymbolicLink()) {
        throw previewStorageError("unsafe preview directory");
      }
      await chmod(directory, 0o700);
    } catch (error) {
      if (error instanceof Error && error.message === "unsafe preview directory") {
        throw error;
      }
      throw previewStorageError("unsafe preview directory");
    }
  };

  const entries = async (): Promise<PreviewEntry[]> => {
    const result: PreviewEntry[] = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!PREVIEW_NAME.test(entry.name)) continue;
      const filePath = path.join(directory, entry.name);
      const details = await lstat(filePath);
      if (!details.isFile() || details.isSymbolicLink()) continue;
      result.push({
        path: filePath,
        name: entry.name,
        size: details.size,
        modifiedMs: details.mtimeMs,
      });
    }
    return result.sort((left, right) =>
      left.modifiedMs - right.modifiedMs || left.name.localeCompare(right.name));
  };

  const remove = async (entry: PreviewEntry): Promise<boolean> => {
    try {
      await removeFile(entry.path);
      return true;
    } catch {
      return false;
    }
  };

  const enforceLimits = async (outputBytes: number): Promise<void> => {
    if (outputBytes > maxBytes) throw previewStorageError("preview capacity unavailable");
    await ensureDirectory();

    let files = await entries();
    const oldestAllowed = now() - maxAgeMs;
    for (const entry of [...files]) {
      if (entry.modifiedMs >= oldestAllowed || !await remove(entry)) continue;
      files = files.filter((file) => file.path !== entry.path);
    }

    while (files.length >= maxFiles) {
      const oldest = files[0];
      if (!oldest || !await remove(oldest)) {
        throw previewStorageError("preview capacity unavailable");
      }
      files = files.slice(1);
    }

    let size = files.reduce((total, entry) => total + entry.size, 0);
    while (size + outputBytes > maxBytes) {
      const oldest = files[0];
      if (!oldest || !await remove(oldest)) {
        throw previewStorageError("preview capacity unavailable");
      }
      files = files.slice(1);
      size -= oldest.size;
    }
  };

  return {
    async cleanup(): Promise<void> {
      await enforceLimits(0);
    },
    async prepare(outputBytes: number): Promise<string> {
      await enforceLimits(outputBytes);
      return path.join(directory, `${PREVIEW_PREFIX}${now()}-${randomUuid()}.html`);
    },
    async write(filePath: string, document: string): Promise<void> {
      await writeFile(filePath, document, { encoding: "utf8", mode: 0o600, flag: "wx" });
    },
  };
};

export const getPreviewOpener = (
  platform: string,
  preview: string,
): { command: string; args: string[] } | null => {
  if (platform === "darwin") return { command: "open", args: [preview] };
  if (platform === "linux") return { command: "xdg-open", args: [preview] };
  if (platform === "win32") {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", `start "" "${preview}"`],
    };
  }
  return null;
};

export const openPreview = async (
  pi: Pick<ExtensionAPI, "exec">,
  preview: string,
  platform = process.platform,
): Promise<boolean> => {
  const opener = getPreviewOpener(platform, preview);
  if (!opener) return false;
  try {
    const result = await pi.exec(opener.command, opener.args, { timeout: 10_000 });
    return result.code === 0 && !result.killed;
  } catch {
    return false;
  }
};

const runToHtml = async (pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> => {
  if (ctx.mode !== "tui") {
    ctx.ui.notify("to-html requires interactive TUI mode", "error");
    return;
  }
  if (!getPreviewOpener(process.platform, "preview")) {
    ctx.ui.notify("Local HTML previews are not supported on this platform", "error");
    return;
  }

  const response = selectLatestAssistantText(ctx.sessionManager.getBranch());
  if (response.status === "incomplete") {
    ctx.ui.notify("Latest assistant response is incomplete", "error");
    return;
  }
  if (response.status === "missing") {
    ctx.ui.notify("No completed assistant response to preview", "error");
    return;
  }

  const input = validateInput(response.text);
  if (!input.ok) {
    ctx.ui.notify(
      input.reason === "input-too-large"
        ? "Latest assistant response exceeds the 1 MiB preview limit"
        : "Latest assistant response exceeds the 20 Mermaid-diagram limit",
      "error",
    );
    return;
  }

  let output: string | undefined;
  try {
    const document = renderHtml(response.text, await loadMermaidBundle());
    const storage = createPreviewStorage();
    output = await storage.prepare(Buffer.byteLength(document, "utf8"));
    await storage.write(output, document);
  } catch {
    if (output) await rm(output, { force: true }).catch(() => undefined);
    ctx.ui.notify("Could not create local HTML preview", "error");
    return;
  }

  if (!output) {
    ctx.ui.notify("Could not create local HTML preview", "error");
    return;
  }

  try {
    if (!await openPreview(pi, output)) {
      ctx.ui.notify(`Preview created but could not open: ${output}`, "error");
      return;
    }
  } catch {
    ctx.ui.notify(`Preview created but could not open: ${output}`, "error");
    return;
  }

  ctx.ui.notify(`Opened local HTML preview: ${output}`, "info");
};

export default function (pi: ExtensionAPI): void {
  pi.on("session_start", async () => {
    await createPreviewStorage().cleanup().catch(() => undefined);
  });

  pi.registerCommand("to-html", {
    description: "Open the latest assistant response as local HTML",
    handler: async (_args, ctx) => runToHtml(pi, ctx),
  });
}
