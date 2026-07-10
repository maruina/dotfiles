/**
 * Files Extension
 *
 * /files command lists session-edited files, git status files, and session-referenced
 * files first, and offers quick actions like reveal, open, or diff.
 */

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ExtensionAPI,
  ExtensionContext,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { DynamicBorder, getAgentDir } from "@earendil-works/pi-coding-agent";
import {
  Container,
  fuzzyFilter,
  Input,
  matchesKey,
  type SelectItem,
  SelectList,
  Spacer,
  Text,
} from "@earendil-works/pi-tui";
import { parseGitStatusPorcelainZ } from "./files/_git.ts";

type ContentBlock = {
  type?: string;
  text?: string;
  arguments?: Record<string, unknown>;
};

type FileReference = {
  path: string;
  display: string;
  exists: boolean;
  isDirectory: boolean;
};

type FileEntry = {
  canonicalPath: string;
  resolvedPath: string;
  displayPath: string;
  exists: boolean;
  isDirectory: boolean;
  status?: string;
  inRepo: boolean;
  isTracked: boolean;
  isReferenced: boolean;
  hasSessionChange: boolean;
  lastTimestamp: number;
};

type GitStatusEntry = {
  status: string;
  exists: boolean;
  isDirectory: boolean;
};

type FileToolName = "write" | "edit";

type SessionFileChange = {
  operations: Set<FileToolName>;
  lastTimestamp: number;
};

const FILE_TAG_REGEX = /<file\s+name=["']([^"']+)["']>/g;
const FILE_URL_REGEX = /file:\/\/[^\s"'<>]+/g;
const PATH_REGEX = /(?:^|[\s"'`([{<])((?:~|\/)[^\s"'`<>)}\]]+)/g;

type FilesExtensionSettings = {
  diffEditor?: string;
};

const loadFilesSettings = (): FilesExtensionSettings => {
  try {
    const settingsPath = path.join(getAgentDir(), "settings.json");
    const raw = JSON.parse(readFileSync(settingsPath, "utf8"));
    // pi owns `extensions` as a string[] of paths; read our config from
    // `extensionSettings.files` to avoid a type collision that crashes pi.
    return (raw?.extensionSettings?.files as FilesExtensionSettings | undefined) ?? {};
  } catch {
    return {};
  }
};

const filesSettings = loadFilesSettings();

const extractFileReferencesFromText = (text: string): string[] => {
  const refs: string[] = [];

  for (const match of text.matchAll(FILE_TAG_REGEX)) {
    refs.push(match[1]);
  }

  for (const match of text.matchAll(FILE_URL_REGEX)) {
    refs.push(match[0]);
  }

  for (const match of text.matchAll(PATH_REGEX)) {
    refs.push(match[1]);
  }

  return refs;
};

const extractPathsFromToolArgs = (args: unknown): string[] => {
  if (!args || typeof args !== "object") {
    return [];
  }

  const refs: string[] = [];
  const record = args as Record<string, unknown>;
  const directKeys = [
    "path",
    "file",
    "filePath",
    "filepath",
    "fileName",
    "filename",
  ] as const;
  const listKeys = ["paths", "files", "filePaths"] as const;

  for (const key of directKeys) {
    const value = record[key];
    if (typeof value === "string") {
      refs.push(value);
    }
  }

  for (const key of listKeys) {
    const value = record[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") {
          refs.push(item);
        }
      }
    }
  }

  return refs;
};

const extractFileReferencesFromContent = (content: unknown): string[] => {
  if (typeof content === "string") {
    return extractFileReferencesFromText(content);
  }

  if (!Array.isArray(content)) {
    return [];
  }

  const refs: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") {
      continue;
    }

    const block = part as ContentBlock;

    if (block.type === "text" && typeof block.text === "string") {
      refs.push(...extractFileReferencesFromText(block.text));
    }

    if (block.type === "toolCall") {
      refs.push(...extractPathsFromToolArgs(block.arguments));
    }
  }

  return refs;
};

const extractFileReferencesFromEntry = (entry: SessionEntry): string[] => {
  if (entry.type === "message") {
    return extractFileReferencesFromContent(entry.message.content);
  }

  if (entry.type === "custom_message") {
    return extractFileReferencesFromContent(entry.content);
  }

  return [];
};

const sanitizeReference = (raw: string): string => {
  let value = raw.trim();
  value = value.replace(/^["'`(<\[]+/, "");
  value = value.replace(/[>"'`,;).\]]+$/, "");
  value = value.replace(/[.,;:]+$/, "");
  return value;
};

const isCommentLikeReference = (value: string): boolean =>
  value.startsWith("//");

const stripLineSuffix = (value: string): string => {
  let result = value.replace(/#L\d+(C\d+)?$/i, "");
  const lastSeparator = Math.max(
    result.lastIndexOf("/"),
    result.lastIndexOf("\\"),
  );
  const segmentStart = lastSeparator >= 0 ? lastSeparator + 1 : 0;
  const segment = result.slice(segmentStart);
  const colonIndex = segment.indexOf(":");
  if (colonIndex >= 0 && /\d/.test(segment[colonIndex + 1] ?? "")) {
    result = result.slice(0, segmentStart + colonIndex);
    return result;
  }

  const lastColon = result.lastIndexOf(":");
  if (lastColon > lastSeparator) {
    const suffix = result.slice(lastColon + 1);
    if (/^\d+(?::\d+)?$/.test(suffix)) {
      result = result.slice(0, lastColon);
    }
  }
  return result;
};

const normalizeReferencePath = (raw: string, cwd: string): string | null => {
  let candidate = sanitizeReference(raw);
  if (!candidate || isCommentLikeReference(candidate)) {
    return null;
  }

  if (candidate.startsWith("file://")) {
    try {
      candidate = fileURLToPath(candidate);
    } catch {
      return null;
    }
  }

  candidate = stripLineSuffix(candidate);
  if (!candidate || isCommentLikeReference(candidate)) {
    return null;
  }

  if (candidate.startsWith("~")) {
    candidate = path.join(os.homedir(), candidate.slice(1));
  }

  if (!path.isAbsolute(candidate)) {
    candidate = path.resolve(cwd, candidate);
  }

  candidate = path.normalize(candidate);
  const root = path.parse(candidate).root;
  if (candidate.length > root.length) {
    candidate = candidate.replace(/[\\/]+$/, "");
  }

  return candidate;
};

const formatDisplayPath = (absolutePath: string, root: string): string => {
  const normalizedRoot = path.resolve(root);
  if (absolutePath.startsWith(normalizedRoot + path.sep)) {
    return path.relative(normalizedRoot, absolutePath);
  }

  return absolutePath;
};

const collectRecentFileReferences = (
  entries: SessionEntry[],
  cwd: string,
  limit: number,
): FileReference[] => {
  const results: FileReference[] = [];
  const seen = new Set<string>();

  for (let i = entries.length - 1; i >= 0 && results.length < limit; i -= 1) {
    const refs = extractFileReferencesFromEntry(entries[i]);
    for (let j = refs.length - 1; j >= 0 && results.length < limit; j -= 1) {
      const normalized = normalizeReferencePath(refs[j], cwd);
      if (!normalized || seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);

      let exists = false;
      let isDirectory = false;
      if (existsSync(normalized)) {
        exists = true;
        const stats = statSync(normalized);
        isDirectory = stats.isDirectory();
      }

      results.push({
        path: normalized,
        display: formatDisplayPath(normalized, cwd),
        exists,
        isDirectory,
      });
    }
  }

  return results;
};

const findLatestFileReference = (
  entries: SessionEntry[],
  cwd: string,
): FileReference | null => {
  const refs = collectRecentFileReferences(entries, cwd, 100);
  return refs.find((ref) => ref.exists) ?? null;
};

const toCanonicalPath = (
  inputPath: string,
): { canonicalPath: string; isDirectory: boolean } | null => {
  if (!existsSync(inputPath)) {
    return null;
  }

  try {
    const canonicalPath = realpathSync(inputPath);
    const stats = statSync(canonicalPath);
    return { canonicalPath, isDirectory: stats.isDirectory() };
  } catch {
    return null;
  }
};

const toCanonicalPathMaybeMissing = (
  inputPath: string,
): { canonicalPath: string; isDirectory: boolean; exists: boolean } | null => {
  const resolvedPath = path.resolve(inputPath);
  if (!existsSync(resolvedPath)) {
    return {
      canonicalPath: path.normalize(resolvedPath),
      isDirectory: false,
      exists: false,
    };
  }

  try {
    const canonicalPath = realpathSync(resolvedPath);
    const stats = statSync(canonicalPath);
    return { canonicalPath, isDirectory: stats.isDirectory(), exists: true };
  } catch {
    return {
      canonicalPath: path.normalize(resolvedPath),
      isDirectory: false,
      exists: true,
    };
  }
};

const collectSessionFileChanges = (
  entries: SessionEntry[],
  cwd: string,
): Map<string, SessionFileChange> => {
  const toolCalls = new Map<string, { path: string; name: FileToolName }>();

  for (const entry of entries) {
    if (entry.type !== "message") continue;
    const msg = entry.message;

    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === "toolCall") {
          const name = block.name as FileToolName;
          if (name === "write" || name === "edit") {
            const filePath = block.arguments?.path;
            if (filePath && typeof filePath === "string") {
              toolCalls.set(block.id, { path: filePath, name });
            }
          }
        }
      }
    }
  }

  const fileMap = new Map<string, SessionFileChange>();

  for (const entry of entries) {
    if (entry.type !== "message") continue;
    const msg = entry.message;

    if (msg.role === "toolResult") {
      const toolCall = toolCalls.get(msg.toolCallId);
      if (!toolCall) continue;

      const resolvedPath = path.isAbsolute(toolCall.path)
        ? toolCall.path
        : path.resolve(cwd, toolCall.path);
      const canonical = toCanonicalPath(resolvedPath);
      if (!canonical) {
        continue;
      }

      const existing = fileMap.get(canonical.canonicalPath);
      if (existing) {
        existing.operations.add(toolCall.name);
        if (msg.timestamp > existing.lastTimestamp) {
          existing.lastTimestamp = msg.timestamp;
        }
      } else {
        fileMap.set(canonical.canonicalPath, {
          operations: new Set([toolCall.name]),
          lastTimestamp: msg.timestamp,
        });
      }
    }
  }

  return fileMap;
};

const splitNullSeparated = (value: string): string[] =>
  value.split("\0").filter(Boolean);

const isPathInside = (root: string, targetPath: string): boolean => {
  const relative = path.relative(root, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const getGitRoot = async (
  pi: ExtensionAPI,
  cwd: string,
): Promise<string | null> => {
  const result = await pi.exec("git", ["rev-parse", "--path-format=absolute", "--show-toplevel"], {
    cwd,
  });
  if (result.code !== 0) {
    return null;
  }

  const root = result.stdout.trim();
  return root ? path.normalize(root) : null;
};

const getGitStatusMap = async (
  pi: ExtensionAPI,
  cwd: string,
): Promise<Map<string, GitStatusEntry>> => {
  const statusMap = new Map<string, GitStatusEntry>();
  const statusResult = await pi.exec("git", ["status", "--porcelain=1", "-z"], {
    cwd,
  });
  if (statusResult.code !== 0 || !statusResult.stdout) {
    return statusMap;
  }

  for (const entry of parseGitStatusPorcelainZ(statusResult.stdout)) {
    const resolved = path.isAbsolute(entry.path)
      ? entry.path
      : path.resolve(cwd, entry.path);
    const canonical = toCanonicalPathMaybeMissing(resolved);
    if (!canonical) continue;
    statusMap.set(canonical.canonicalPath, {
      status: entry.status,
      exists: canonical.exists,
      isDirectory: canonical.isDirectory,
    });
  }

  return statusMap;
};

const getTrackedGitFiles = async (
  pi: ExtensionAPI,
  gitRoot: string,
  paths: string[],
): Promise<Set<string>> => {
  const tracked = new Set<string>();
  if (paths.length === 0) {
    return tracked;
  }

  const relativePaths = paths
    .map((filePath) => path.relative(gitRoot, filePath))
    .filter(
      (relativePath) =>
        relativePath &&
        !relativePath.startsWith("..") &&
        !path.isAbsolute(relativePath),
    )
    .map((relativePath) => `:(literal)${relativePath}`);
  if (relativePaths.length === 0) {
    return tracked;
  }

  const result = await pi.exec(
    "git",
    ["ls-files", "-z", "--", ...relativePaths],
    { cwd: gitRoot },
  );
  if (result.code !== 0 || !result.stdout) {
    return tracked;
  }

  for (const relativePath of splitNullSeparated(result.stdout)) {
    const canonical = toCanonicalPath(path.resolve(gitRoot, relativePath));
    if (canonical) {
      tracked.add(canonical.canonicalPath);
    }
  }

  return tracked;
};

const buildFileEntries = async (
  pi: ExtensionAPI,
  ctx: ExtensionContext,
): Promise<{ files: FileEntry[]; gitRoot: string | null }> => {
  const entries = ctx.sessionManager.getBranch();
  const gitRoot = await getGitRoot(pi, ctx.cwd);
  const displayRoot = gitRoot ?? ctx.cwd;
  const sessionChanges = collectSessionFileChanges(entries, displayRoot);
  const statusMap = gitRoot
    ? await getGitStatusMap(pi, gitRoot)
    : new Map<string, GitStatusEntry>();

  const fileMap = new Map<string, FileEntry>();

  const upsertFile = (
    data: Partial<FileEntry> & { canonicalPath: string; isDirectory: boolean },
  ) => {
    const existing = fileMap.get(data.canonicalPath);
    const displayPath =
      data.displayPath ?? formatDisplayPath(data.canonicalPath, displayRoot);

    if (existing) {
      fileMap.set(data.canonicalPath, {
        ...existing,
        ...data,
        displayPath,
        exists: data.exists ?? existing.exists,
        isDirectory: data.isDirectory ?? existing.isDirectory,
        isReferenced: existing.isReferenced || data.isReferenced === true,
        inRepo: existing.inRepo || data.inRepo === true,
        isTracked: existing.isTracked || data.isTracked === true,
        hasSessionChange:
          existing.hasSessionChange || data.hasSessionChange === true,
        lastTimestamp: Math.max(
          existing.lastTimestamp,
          data.lastTimestamp ?? 0,
        ),
      });
      return;
    }

    fileMap.set(data.canonicalPath, {
      canonicalPath: data.canonicalPath,
      resolvedPath: data.resolvedPath ?? data.canonicalPath,
      displayPath,
      exists: data.exists ?? true,
      isDirectory: data.isDirectory,
      status: data.status,
      inRepo: data.inRepo ?? false,
      isTracked: data.isTracked ?? false,
      isReferenced: data.isReferenced ?? false,
      hasSessionChange: data.hasSessionChange ?? false,
      lastTimestamp: data.lastTimestamp ?? 0,
    });
  };

  for (const [canonicalPath, statusEntry] of statusMap.entries()) {
    if (fileMap.has(canonicalPath)) {
      continue;
    }

    const inRepo = gitRoot !== null && isPathInside(gitRoot, canonicalPath);

    upsertFile({
      canonicalPath,
      resolvedPath: canonicalPath,
      isDirectory: statusEntry.isDirectory,
      exists: statusEntry.exists,
      status: statusEntry.status,
      inRepo,
      isTracked: statusEntry.status !== "??",
    });
  }

  const references = collectRecentFileReferences(entries, displayRoot, 200).filter(
    (ref) => ref.exists,
  );
  for (const ref of references) {
    const canonical = toCanonicalPath(ref.path);
    if (!canonical) continue;

    const inRepo = gitRoot !== null && isPathInside(gitRoot, canonical.canonicalPath);

    upsertFile({
      canonicalPath: canonical.canonicalPath,
      resolvedPath: canonical.canonicalPath,
      isDirectory: canonical.isDirectory,
      exists: true,
      status: statusMap.get(canonical.canonicalPath)?.status,
      inRepo,
      isReferenced: true,
    });
  }

  for (const [canonicalPath, change] of sessionChanges.entries()) {
    const canonical = toCanonicalPath(canonicalPath);
    if (!canonical) continue;

    const inRepo = gitRoot !== null && isPathInside(gitRoot, canonical.canonicalPath);

    upsertFile({
      canonicalPath: canonical.canonicalPath,
      resolvedPath: canonical.canonicalPath,
      isDirectory: canonical.isDirectory,
      exists: true,
      status: statusMap.get(canonical.canonicalPath)?.status,
      inRepo,
      hasSessionChange: true,
      lastTimestamp: change.lastTimestamp,
    });
  }

  if (gitRoot) {
    const trackedSet = await getTrackedGitFiles(
      pi,
      gitRoot,
      Array.from(fileMap.keys()),
    );
    for (const [canonicalPath, file] of fileMap.entries()) {
      if (trackedSet.has(canonicalPath) || (file.status && file.status !== "??")) {
        fileMap.set(canonicalPath, { ...file, isTracked: true });
      }
    }
  }

  const files = Array.from(fileMap.values()).sort((a, b) => {
    if (a.hasSessionChange !== b.hasSessionChange) {
      return a.hasSessionChange ? -1 : 1;
    }
    const aDirty = Boolean(a.status);
    const bDirty = Boolean(b.status);
    if (aDirty !== bDirty) {
      return aDirty ? -1 : 1;
    }
    if (a.inRepo !== b.inRepo) {
      return a.inRepo ? -1 : 1;
    }
    if (a.lastTimestamp !== b.lastTimestamp) {
      return b.lastTimestamp - a.lastTimestamp;
    }
    if (a.isReferenced !== b.isReferenced) {
      return a.isReferenced ? -1 : 1;
    }
    return a.displayPath.localeCompare(b.displayPath);
  });

  return { files, gitRoot };
};

const showActionSelector = async (
  ctx: ExtensionContext,
  options: { canDiff: boolean; hasGitRoot: boolean },
): Promise<
  "reveal" | "open" | "openGoland" | "addToPrompt" | "diff" | null
> => {
  const actions: SelectItem[] = [
    ...(options.canDiff ? [{ value: "diff", label: `Diff in ${filesSettings.diffEditor ?? "Zed"}` }] : []),
    { value: "reveal", label: "Reveal in Finder" },
    { value: "open", label: "Open" },
    { value: "openGoland", label: options.hasGitRoot ? "Open Worktree as GoLand Project" : "Open with GoLand" },
    { value: "addToPrompt", label: "Add to prompt" },
  ];

  return ctx.ui.custom<
    "reveal" | "open" | "openGoland" | "addToPrompt" | "diff" | null
  >((tui, theme, _kb, done) => {
    const container = new Container();
    container.addChild(new DynamicBorder((str) => theme.fg("accent", str)));
    container.addChild(
      new Text(theme.fg("accent", theme.bold("Choose action"))),
    );

    const selectList = new SelectList(actions, actions.length, {
      selectedPrefix: (text) => theme.fg("accent", text),
      selectedText: (text) => theme.fg("accent", text),
      description: (text) => theme.fg("muted", text),
      scrollInfo: (text) => theme.fg("dim", text),
      noMatch: (text) => theme.fg("warning", text),
    });

    selectList.onSelect = (item) =>
      done(
        item.value as
          | "reveal"
          | "open"
          | "openGoland"
          | "addToPrompt"
          | "diff",
      );
    selectList.onCancel = () => done(null);

    container.addChild(selectList);
    container.addChild(
      new Text(theme.fg("dim", "Press enter to confirm or esc to cancel")),
    );
    container.addChild(new DynamicBorder((str) => theme.fg("accent", str)));

    return {
      render(width: number) {
        return container.render(width);
      },
      invalidate() {
        container.invalidate();
      },
      handleInput(data: string) {
        selectList.handleInput(data);
        tui.requestRender();
      },
    };
  });
};

const openPath = async (
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  target: FileEntry,
): Promise<void> => {
  if (!existsSync(target.resolvedPath)) {
    ctx.ui.notify(`File not found: ${target.displayPath}`, "error");
    return;
  }

  const command = process.platform === "darwin" ? "open" : "xdg-open";
  const result = await pi.exec(command, [target.resolvedPath]);
  if (result.code !== 0) {
    const errorMessage =
      result.stderr?.trim() || `Failed to open ${target.displayPath}`;
    ctx.ui.notify(errorMessage, "error");
  }
};

const openWithGoLand = async (
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  target: FileEntry,
): Promise<void> => {
  const targetPath = target.resolvedPath;
  if (!existsSync(targetPath)) {
    ctx.ui.notify(`File not found: ${target.displayPath}`, "error");
    return;
  }

  const targetStats = statSync(targetPath);
  const gitCwd = targetStats.isDirectory() ? targetPath : path.dirname(targetPath);
  const selectedGitRoot = await getGitRoot(pi, gitCwd);
  const golandPath = selectedGitRoot ?? targetPath;
  const result = process.platform === "darwin"
    ? await pi.exec("open", ["-na", "GoLand.app", "--args", golandPath])
    : await pi.exec("goland", [golandPath]);
  if (result.code !== 0) {
    const errorMessage =
      result.stderr?.trim() || `Failed to open ${target.displayPath} in GoLand`;
    ctx.ui.notify(errorMessage, "error");
  }
};

const revealPath = async (
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  target: FileEntry,
): Promise<void> => {
  if (!existsSync(target.resolvedPath)) {
    ctx.ui.notify(`File not found: ${target.displayPath}`, "error");
    return;
  }

  const isDirectory =
    target.isDirectory || statSync(target.resolvedPath).isDirectory();
  let command = "open";
  let args: string[] = [];

  if (process.platform === "darwin") {
    args = isDirectory ? [target.resolvedPath] : ["-R", target.resolvedPath];
  } else {
    command = "xdg-open";
    args = [
      isDirectory ? target.resolvedPath : path.dirname(target.resolvedPath),
    ];
  }

  const result = await pi.exec(command, args);
  if (result.code !== 0) {
    const errorMessage =
      result.stderr?.trim() || `Failed to reveal ${target.displayPath}`;
    ctx.ui.notify(errorMessage, "error");
  }
};

const openDiff = async (
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  target: FileEntry,
  gitRoot: string | null,
): Promise<void> => {
  if (!gitRoot) {
    ctx.ui.notify("Git repository not found", "warning");
    return;
  }

  const relativePath = path
    .relative(gitRoot, target.resolvedPath)
    .split(path.sep)
    .join("/");
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "pi-files-"));
  const tmpFile = path.join(tmpDir, path.basename(target.displayPath));

  const existsInHead = await pi.exec(
    "git",
    ["cat-file", "-e", `HEAD:${relativePath}`],
    { cwd: gitRoot },
  );
  if (existsInHead.code === 0) {
    const result = await pi.exec("git", ["show", `HEAD:${relativePath}`], {
      cwd: gitRoot,
    });
    if (result.code !== 0) {
      const errorMessage =
        result.stderr?.trim() || `Failed to diff ${target.displayPath}`;
      ctx.ui.notify(errorMessage, "error");
      return;
    }
    writeFileSync(tmpFile, result.stdout ?? "", "utf8");
  } else {
    writeFileSync(tmpFile, "", "utf8");
  }

  let workingPath = target.resolvedPath;
  if (!existsSync(target.resolvedPath)) {
    workingPath = path.join(
      tmpDir,
      `pi-files-working-${path.basename(target.displayPath)}`,
    );
    writeFileSync(workingPath, "", "utf8");
  }

  const diffEditor = filesSettings.diffEditor ?? "zed";
  const openResult = await pi.exec(diffEditor, ["--diff", tmpFile, workingPath], {
    cwd: gitRoot,
  });
  if (openResult.code !== 0) {
    const errorMessage =
      openResult.stderr?.trim() ||
      `Failed to open diff for ${target.displayPath}`;
    ctx.ui.notify(errorMessage, "error");
  }
};

const addFileToPrompt = (ctx: ExtensionContext, target: FileEntry): void => {
  const mentionTarget = target.displayPath || target.resolvedPath;
  const mention = `@${mentionTarget}`;
  const current = ctx.ui.getEditorText();
  const separator = current && !current.endsWith(" ") ? " " : "";
  ctx.ui.setEditorText(`${current}${separator}${mention}`);
  ctx.ui.notify(`Added ${mention} to prompt`, "info");
};

const showFileSelector = async (
  ctx: ExtensionContext,
  files: FileEntry[],
  selectedPath?: string | null,
  gitRoot?: string | null,
): Promise<{ selected: FileEntry | null; quickAction: "diff" | null }> => {
  const items: SelectItem[] = files.map((file) => {
    const directoryLabel = file.isDirectory ? " [directory]" : "";
    const statusSuffix = file.status ? ` [${file.status}]` : "";
    return {
      value: file.canonicalPath,
      label: `${file.displayPath}${directoryLabel}${statusSuffix}`,
    };
  });

  let quickAction: "diff" | null = null;
  const selection = await ctx.ui.custom<string | null>(
    (tui, theme, keybindings, done) => {
      const container = new Container();
      container.addChild(new DynamicBorder((str) => theme.fg("accent", str)));
      container.addChild(
        new Text(theme.fg("accent", theme.bold(" Select file")), 0, 0),
      );

      const searchInput = new Input();
      container.addChild(searchInput);
      container.addChild(new Spacer(1));

      const listContainer = new Container();
      container.addChild(listContainer);
      container.addChild(
        new Text(
          theme.fg(
            "dim",
            "Type to filter • enter to select • ctrl+shift+d diff • esc to cancel",
          ),
          0,
          0,
        ),
      );
      container.addChild(new DynamicBorder((str) => theme.fg("accent", str)));

      let filteredItems = items;
      let selectList: SelectList | null = null;

      const updateList = () => {
        listContainer.clear();
        if (filteredItems.length === 0) {
          listContainer.addChild(
            new Text(theme.fg("warning", "  No matching files"), 0, 0),
          );
          selectList = null;
          return;
        }

        selectList = new SelectList(
          filteredItems,
          Math.min(filteredItems.length, 12),
          {
            selectedPrefix: (text) => theme.fg("accent", text),
            selectedText: (text) => theme.fg("accent", text),
            description: (text) => theme.fg("muted", text),
            scrollInfo: (text) => theme.fg("dim", text),
            noMatch: (text) => theme.fg("warning", text),
          },
        );

        if (selectedPath) {
          const index = filteredItems.findIndex(
            (item) => item.value === selectedPath,
          );
          if (index >= 0) {
            selectList.setSelectedIndex(index);
          }
        }

        selectList.onSelect = (item) => done(item.value as string);
        selectList.onCancel = () => done(null);

        listContainer.addChild(selectList);
      };

      const applyFilter = () => {
        const query = searchInput.getValue();
        filteredItems = query
          ? fuzzyFilter(
              items,
              query,
              (item) => `${item.label} ${item.value} ${item.description ?? ""}`,
            )
          : items;
        updateList();
      };

      applyFilter();

      return {
        render(width: number) {
          return container.render(width);
        },
        invalidate() {
          container.invalidate();
        },
        handleInput(data: string) {
          if (matchesKey(data, "ctrl+shift+d")) {
            const selected = selectList?.getSelectedItem();
            if (selected) {
              const file = files.find(
                (entry) => entry.canonicalPath === selected.value,
              );
              const canDiff =
                file?.isTracked && !file.isDirectory && Boolean(gitRoot);
              if (!canDiff) {
                ctx.ui.notify(
                  "Diff is only available for tracked files",
                  "warning",
                );
                return;
              }
              quickAction = "diff";
              done(selected.value as string);
              return;
            }
          }

          if (
            keybindings.matches(data, "tui.select.up") ||
            keybindings.matches(data, "tui.select.down") ||
            keybindings.matches(data, "tui.select.confirm") ||
            keybindings.matches(data, "tui.select.cancel")
          ) {
            if (selectList) {
              selectList.handleInput(data);
            } else if (keybindings.matches(data, "tui.select.cancel")) {
              done(null);
            }
            tui.requestRender();
            return;
          }

          searchInput.handleInput(data);
          applyFilter();
          tui.requestRender();
        },
      };
    },
  );

  const selected = selection
    ? (files.find((file) => file.canonicalPath === selection) ?? null)
    : null;
  return { selected, quickAction };
};

const runFileBrowser = async (
  pi: ExtensionAPI,
  ctx: ExtensionContext,
): Promise<void> => {
  if (!ctx.hasUI) {
    ctx.ui.notify("Files requires interactive mode", "error");
    return;
  }

  const { files, gitRoot } = await buildFileEntries(pi, ctx);
  if (files.length === 0) {
    ctx.ui.notify("No files found", "info");
    return;
  }

  let lastSelectedPath: string | null = null;
  while (true) {
    const { selected, quickAction } = await showFileSelector(
      ctx,
      files,
      lastSelectedPath,
      gitRoot,
    );
    if (!selected) {
      ctx.ui.notify("Files cancelled", "info");
      return;
    }

    lastSelectedPath = selected.canonicalPath;

    const canDiff =
      selected.isTracked && !selected.isDirectory && Boolean(gitRoot);
    if (quickAction === "diff") {
      await openDiff(pi, ctx, selected, gitRoot);
      continue;
    }

    const action = await showActionSelector(ctx, {
      canDiff,
      hasGitRoot: Boolean(gitRoot),
    });
    if (!action) {
      continue;
    }

    switch (action) {
      case "open":
        await openPath(pi, ctx, selected);
        break;
      case "openGoland":
        await openWithGoLand(pi, ctx, selected);
        break;
      case "addToPrompt":
        addFileToPrompt(ctx, selected);
        break;
      case "diff":
        await openDiff(pi, ctx, selected, gitRoot);
        break;
      default:
        await revealPath(pi, ctx, selected);
        break;
    }
  }
};

export default function (pi: ExtensionAPI): void {
  pi.registerCommand("files", {
    description: "Browse edited, changed, and referenced files",
    handler: async (_args, ctx) => {
      await runFileBrowser(pi, ctx);
    },
  });

  pi.registerShortcut("ctrl+shift+o", {
    description: "Browse files mentioned in the session",
    handler: async (ctx) => {
      await runFileBrowser(pi, ctx);
    },
  });

  pi.registerShortcut("ctrl+shift+f", {
    description: "Reveal the latest file reference in Finder",
    handler: async (ctx) => {
      const entries = ctx.sessionManager.getBranch();
      const latest = findLatestFileReference(entries, ctx.cwd);

      if (!latest) {
        ctx.ui.notify("No file reference found in the session", "warning");
        return;
      }

      const canonical = toCanonicalPath(latest.path);
      if (!canonical) {
        ctx.ui.notify(`File not found: ${latest.display}`, "error");
        return;
      }

      await revealPath(pi, ctx, {
        canonicalPath: canonical.canonicalPath,
        resolvedPath: canonical.canonicalPath,
        displayPath: latest.display,
        exists: true,
        isDirectory: canonical.isDirectory,
        status: undefined,
        inRepo: false,
        isTracked: false,
        isReferenced: true,
        hasSessionChange: false,
        lastTimestamp: 0,
      });
    },
  });
}
