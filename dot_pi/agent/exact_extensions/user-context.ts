import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { isPathInside } from "./_shared/fs.ts";
import { parseGitHubOwnerRepo, routedGhEnv, selectGitHubLogin } from "./_shared/github.ts";
import { qualifiedId } from "./_shared/model.ts";
import { getProfile, type PiProfile } from "./_shared/profile.ts";
import { buildRexArgs } from "./_shared/rex.ts";

export { parseGitHubOwnerRepo, selectGitHubLogin };

const execFileAsync = promisify(execFile);
const JIRA_KEY_RE = /\b[A-Z][A-Z0-9]+-[0-9]+\b/g;
const TASK_LABEL_RE = /^π-[a-z]+(-[a-z]+){1,3}$/;
const TASK_STOPWORDS = new Set([
  "a", "about", "all", "also", "an", "and", "any", "are", "as", "at", "be", "but", "by",
  "can", "could", "did", "do", "does", "for", "from", "has", "have", "help", "here", "how",
  "i", "if", "in", "into", "is", "it", "its", "just", "me", "my", "not", "of", "on", "or",
  "our", "please", "should", "so", "some", "than", "that", "the", "their", "then", "there",
  "these", "this", "those", "to", "us", "we", "what", "when", "where", "which", "who", "why",
  "will", "with", "would", "you", "your",
]);

export function deriveSlashTaskLabel(prompt: string): string | null {
  const match = /^\s*\/([a-z][a-z0-9-]*)(?:\s+(.*))?$/is.exec(prompt);
  if (!match) return null;
  const cmdWords = match[1].toLowerCase().split("-").map((w) => w.replace(/[^a-z]/g, "")).filter(Boolean);
  if (cmdWords.length === 0) return null;

  const arg = (match[2] ?? "").trim();
  const argWords: string[] = [];
  const planMatch = /(?:^|\/)plans\/([^/\s]+)(?:\/|$)/.exec(arg);
  const prMatch = /github\.com\/[^/\s]+\/([^/\s]+)\/pull\/\d+/.exec(arg);
  const source = planMatch?.[1] ?? prMatch?.[1] ?? "";
  if (source) {
    for (const part of source.toLowerCase().split(/[^a-z]+/)) {
      if (part) argWords.push(part);
    }
  }

  const words = [...cmdWords, ...argWords].slice(0, 4);
  if (words.length === 1) words.push("task");
  const label = `π-${words.join("-")}`;
  return TASK_LABEL_RE.test(label) ? label : null;
}

export function derivePromptTaskLabel(prompt: string): string | null {
  const slash = deriveSlashTaskLabel(prompt);
  if (slash) return slash;
  const cleaned = prompt
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/`[^`]*`/g, " ")
    .toLowerCase();
  const words: string[] = [];
  const seen = new Set<string>();
  for (const raw of cleaned.split(/[^a-z]+/)) {
    if (raw.length < 2 || TASK_STOPWORDS.has(raw) || seen.has(raw)) continue;
    seen.add(raw);
    words.push(raw.slice(0, 16));
    if (words.length === 3) break;
  }
  if (words.length < 2) return null;
  const label = `π-${words.join("-")}`;
  return TASK_LABEL_RE.test(label) ? label : null;
}

type CurrentPullRequest = {
  number: number;
  title: string;
  state: string;
  url?: string;
  baseRefName?: string;
  headRefName?: string;
};

type AsyncRunner = (
  command: string,
  args?: string[],
  cwd?: string,
  timeout?: number,
  env?: NodeJS.ProcessEnv,
) => Promise<string | null>;

async function runAsync(command: string, args: string[] = [], cwd?: string, timeout = 10000, env?: NodeJS.ProcessEnv): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(command, args, { encoding: "utf8", timeout, cwd, ...(env ? { env } : {}) });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

function gitAsync(cwd: string, args: string[], timeout = 2000, run: AsyncRunner = runAsync): Promise<string | null> {
  return run("git", args, cwd, timeout);
}

const gitIdentityCache = new Map<string, { name: string | null; email: string | null }>();

async function getGitIdentity(cwd: string): Promise<{ name: string | null; email: string | null }> {
  const cached = gitIdentityCache.get(cwd);
  if (cached) return cached;
  const [name, email] = await Promise.all([
    gitAsync(cwd, ["config", "user.name"]),
    gitAsync(cwd, ["config", "user.email"]),
  ]);
  const identity = { name, email };
  gitIdentityCache.set(cwd, identity);
  return identity;
}

function resolveGitHeadPath(repoRoot: string): string | null {
  const dotGit = path.join(repoRoot, ".git");
  try {
    const st = statSync(dotGit);
    if (st.isDirectory()) return path.join(dotGit, "HEAD");
    if (st.isFile()) {
      const content = readFileSync(dotGit, "utf8").trim();
      const match = /^gitdir:\s*(.+)$/.exec(content);
      if (match?.[1]) return path.resolve(repoRoot, match[1].trim(), "HEAD");
    }
  } catch {
    // Ignore missing/unreadable .git metadata.
  }
  return null;
}

function getFileMtime(filePath: string | null): number | null {
  if (!filePath) return null;
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
}

type FastGitSnapshot = {
  repoRoot: string | null;
  branch: string | null;
  localDefaultBranch: string | null;
  headPath: string | null;
  headMtime: number | null;
};

const fastGitCache = new Map<string, FastGitSnapshot>();

async function getFastGitContext(cwd: string): Promise<{
  repoRoot: string | null;
  branch: string | null;
  localDefaultBranch: string | null;
}> {
  const cached = fastGitCache.get(cwd);
  if (cached && cached.repoRoot !== null) {
    const mtime = getFileMtime(cached.headPath);
    if (mtime !== null && mtime === cached.headMtime) return cached;
  }

  const [repoRoot, branch, localDefaultBranch] = await Promise.all([
    gitAsync(cwd, ["rev-parse", "--show-toplevel"]),
    gitAsync(cwd, ["branch", "--show-current"]),
    getLocalDefaultBranch(cwd),
  ]);
  const headPath = repoRoot ? resolveGitHeadPath(repoRoot) : null;
  const headMtime = getFileMtime(headPath);
  const snapshot: FastGitSnapshot = { repoRoot, branch, localDefaultBranch, headPath, headMtime };
  if (repoRoot !== null) fastGitCache.set(cwd, snapshot);
  return snapshot;
}

async function getLocalDefaultBranch(cwd: string): Promise<string | null> {
  const originHead = await gitAsync(cwd, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
  if (originHead?.startsWith("origin/")) return originHead.slice("origin/".length);
  return null;
}

async function getGitHubEnv(cwd: string, profile: PiProfile): Promise<NodeJS.ProcessEnv | undefined> {
  if (profile !== "work") return undefined;
  const remoteUrl = await gitAsync(cwd, ["remote", "get-url", "origin"]);
  if (!remoteUrl) return undefined;
  const parsed = parseGitHubOwnerRepo(remoteUrl);
  if (!parsed) return undefined;
  return routedGhEnv(parsed.owner, profile, runAsync, { cwd });
}

async function getRepoInfo(
  cwd: string,
  localRepoName: string,
  localDefaultBranch: string | null,
  ghEnv?: NodeJS.ProcessEnv,
): Promise<{ repoName: string | null; defaultBranch: string | null }> {
  const raw = await runAsync("gh", ["repo", "view", "--json", "nameWithOwner,defaultBranchRef"], cwd, 3000, ghEnv);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { nameWithOwner?: string; defaultBranchRef?: { name?: string } };
      return {
        repoName: parsed.nameWithOwner ?? localRepoName,
        defaultBranch: localDefaultBranch ?? parsed.defaultBranchRef?.name ?? null,
      };
    } catch {
      // Fall through to local defaults.
    }
  }
  return { repoName: localRepoName, defaultBranch: localDefaultBranch };
}

export function uniqueMatches(text: string): string[] {
  return [...new Set(text.match(JIRA_KEY_RE) ?? [])];
}

export function getWorktreeInfo(root: string, profile: PiProfile = getProfile(), home: string = process.env.HOME ?? ""): string[] {
  const lines: string[] = [];
  const baseRoot = path.join(home, profile === "work" ? "dd" : "src");
  const worktreesRoot = path.join(baseRoot, ".worktrees");
  if (home && isPathInside(worktreesRoot, root)) {
    lines.push(`- This checkout is in the standard ${profile === "work" ? "DataDog" : "personal"} worktree directory.`);
    lines.push(`- Worktree root: ${root}`);
    lines.push(`- Main checkout convention: ${baseRoot}/<repo>`);
  } else if (home && isPathInside(baseRoot, root)) {
    lines.push(`- Repository root: ${root}`);
    lines.push(`- Worktree convention: ${worktreesRoot}/<repo>/<branch-slug>`);
  }
  return lines;
}

export function repoHints(root: string, repoName: string | null, profile: PiProfile = getProfile()): string[] {
  const repo = repoName ?? path.basename(root);
  const lowerRepo = repo.toLowerCase();
  const lines: string[] = [];

  if (profile === "work" && lowerRepo.includes("dd-source")) {
    lines.push("- In dd-source, use `bzl` rather than `bazel` for builds/tests.");
    lines.push("- Prefer `:all` targets when practical (for example, `bzl test //path/to/package:all`).");
  }

  if (
    lowerRepo.includes("k8s") ||
    existsSync(path.join(root, "go.mod")) ||
    existsSync(path.join(root, "config", "crd")) ||
    existsSync(path.join(root, "controllers")) ||
    existsSync(path.join(root, "api"))
  ) {
    lines.push("- For Kubernetes API/controller work, consider the k8s API/controller skills before changing CRDs, status, watches, finalizers, or reconciliation logic.");
  }

  return [...new Set(lines)];
}

async function getGitHubUsername(ghEnv?: NodeJS.ProcessEnv): Promise<string | null> {
  return runAsync("gh", ["api", "graphql", "-f", "query=query { viewer { login } }", "--jq", ".data.viewer.login"], undefined, 10000, ghEnv);
}

async function getCurrentPR(cwd: string, ghEnv?: NodeJS.ProcessEnv): Promise<CurrentPullRequest | null> {
  const raw = await runAsync("gh", ["pr", "view", "--json", "number,title,state,url,baseRefName,headRefName"], cwd, 8000, ghEnv);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CurrentPullRequest;
  } catch {
    return null;
  }
}

export function formatPR(pr: CurrentPullRequest): string {
  const state = pr.state === "OPEN" ? "OPEN" : pr.state === "MERGED" ? "MERGED" : pr.state;
  const base = pr.baseRefName ? ` → ${pr.baseRefName}` : "";
  const head = pr.headRefName ? `${pr.headRefName}` : `#${pr.number}`;
  const link = pr.url ? ` (${pr.url})` : "";
  return `- [${state}] #${pr.number}${base}: ${pr.title} [head: ${head}]${link}`;
}

export function formatCurrentModel(model?: { provider?: string; id?: string; name?: string }): string[] {
  if (!model?.id) return [];
  const fullId = model.provider ? qualifiedId(model.provider, model.id) : model.id;
  return ["## Current Model", `- ${model.name ?? model.id} (${fullId})`];
}

export function formatRexContext(output: string): string[] {
  return ["## Rex", "", ...output.split("\n")];
}

function rexArgs(env: NodeJS.ProcessEnv, args: string[], timeoutSec = 3): string[] {
  return buildRexArgs(args, {
    timeoutSec,
    endpoint: env.REX_SERVER,
    validateEndpoint: false,
  });
}

// rex __internal session-start prints the Rex guidance block and exits 0
// with no output when REX_SESSION is unset, so it is safe outside Rex.
export async function loadRexLines(env: NodeJS.ProcessEnv, run: AsyncRunner): Promise<string[] | null> {
  if (!env.REX_SESSION) return null;
  const output = await run("rex", rexArgs(env, ["__internal", "session-start", "--agent", "pi", "--feature-session-naming=false"]), undefined, 3000);
  return output ? formatRexContext(output) : null;
}

type RexSessionSnapshot = {
  label?: string;
  windows?: Array<{
    window_id?: string;
    label?: string;
    layers?: Array<{ blocks?: Array<{ block_id?: string; label?: string }> }>;
  }>;
};

function repoNameFromRemote(remote: string): string {
  return remote.trim().replace(/\/+$/, "").replace(/^.*[/:]/, "").replace(/\.git$/, "");
}

async function applyRexSessionName(
  snapshot: RexSessionSnapshot,
  cwd: string,
  env: NodeJS.ProcessEnv,
  run: AsyncRunner,
): Promise<void> {
  const session = env.REX_SESSION;
  const block = env.REX_BLOCK;
  if (!session || !block) return;
  const label = snapshot.label ?? "";
  if (label.startsWith("keep:")) return;
  const windows = snapshot.windows ?? [];
  const blocks = windows.flatMap((w) => (w.layers ?? []).flatMap((l) => (l.blocks ?? []).map((b) => b.block_id)));
  if (windows.length !== 1 || blocks.length !== 1 || blocks[0] !== block) return;

  const root = await gitAsync(cwd, ["rev-parse", "--show-toplevel"], 2000, run);
  let name = "";
  if (root) {
    let remote = await gitAsync(cwd, ["remote", "get-url", "origin"], 2000, run);
    if (!remote) {
      const remotes = await gitAsync(cwd, ["remote"], 2000, run);
      const firstRemote = remotes?.split("\n")[0]?.trim();
      if (firstRemote) remote = await gitAsync(cwd, ["remote", "get-url", firstRemote], 2000, run);
    }
    name = remote ? repoNameFromRemote(remote) : path.basename(root);
  } else {
    name = path.basename(cwd);
  }
  if (!name || label === name) return;
  await run("rex", rexArgs(env, ["session", "rename", session, name]), cwd, 3000);
}

async function applyRexTaskLabel(
  snapshot: RexSessionSnapshot,
  label: string,
  env: NodeJS.ProcessEnv,
  run: AsyncRunner,
): Promise<void> {
  const session = env.REX_SESSION;
  const block = env.REX_BLOCK;
  if (!session || !block || !TASK_LABEL_RE.test(label)) return;
  const containing = (snapshot.windows ?? []).find((w) =>
    (w.layers ?? []).some((l) => (l.blocks ?? []).some((b) => b.block_id === block)),
  );
  if (!containing?.window_id) return;
  const paneCount = (containing.layers ?? []).reduce((sum, l) => sum + (l.blocks?.length ?? 0), 0);
  if (paneCount > 1) {
    await run("rex", rexArgs(env, ["block", "rename", "-s", session, block, label]), undefined, 3000);
  } else {
    await run("rex", rexArgs(env, ["window", "rename", "-s", session, containing.window_id, label]), undefined, 3000);
  }
}

export async function nameRexSessionAndTask(
  options: { sessionCwd?: string; taskLabel?: string | null },
  env: NodeJS.ProcessEnv,
  run: AsyncRunner = runAsync,
): Promise<void> {
  const session = env.REX_SESSION;
  const block = env.REX_BLOCK;
  const wantSession = Boolean(options.sessionCwd);
  const wantTask = Boolean(options.taskLabel && TASK_LABEL_RE.test(options.taskLabel));
  if (!session || !block || (!wantSession && !wantTask)) return;
  const raw = await run("rex", rexArgs(env, ["session", "inspect", session, "--json"]), options.sessionCwd, 3000);
  if (!raw) return;
  let snapshot: RexSessionSnapshot;
  try {
    snapshot = JSON.parse(raw) as RexSessionSnapshot;
  } catch {
    return;
  }
  const tasks: Promise<void>[] = [];
  if (wantSession && options.sessionCwd) tasks.push(applyRexSessionName(snapshot, options.sessionCwd, env, run));
  if (wantTask && options.taskLabel) tasks.push(applyRexTaskLabel(snapshot, options.taskLabel, env, run));
  await Promise.all(tasks);
}

export async function nameRexSession(cwd: string, env: NodeJS.ProcessEnv, run: AsyncRunner = runAsync): Promise<void> {
  await nameRexSessionAndTask({ sessionCwd: cwd }, env, run);
}

export async function nameRexTask(label: string, env: NodeJS.ProcessEnv, run: AsyncRunner = runAsync): Promise<void> {
  await nameRexSessionAndTask({ taskLabel: label }, env, run);
}

const rexNamingKey = Symbol.for("user-context.rex-naming");
const processState = globalThis as typeof globalThis & {
  [rexNamingKey]?: { startupCwd: string; attempted: boolean; taskNamed: boolean };
};
const rexNamingState = processState[rexNamingKey] ??= {
  startupCwd: process.cwd(),
  attempted: false,
  taskNamed: false,
};

let cachedRexLines: string[] | null | undefined;

async function getRexLines(): Promise<string[] | null> {
  if (cachedRexLines !== undefined) return cachedRexLines;
  cachedRexLines = await loadRexLines(process.env, runAsync);
  return cachedRexLines;
}

export function buildRepoContextKey(cwd: string, branch: string | null, email: string | null): string {
  return [cwd, branch ?? "", email ?? ""].join("\0");
}

type CachedRepoContext = {
  key: string;
  lines: string[];
  repoName: string | null;
  defaultBranch: string | null;
};

export default function (pi: ExtensionAPI) {
  let cachedRepoContext: CachedRepoContext | null = null;
  let repoContextFetchKey: string | null = null;
  let lastInjectedFastContent: string | null = null;
  let lastInjectedSlowContent: string | null = null;

  pi.on("session_start", () => {
    lastInjectedFastContent = null;
    lastInjectedSlowContent = null;
  });

  pi.on("session_compact", () => {
    lastInjectedFastContent = null;
    lastInjectedSlowContent = null;
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const profile = getProfile();
    const stageRunnerChild = process.env.PI_STAGE_RUNNER_CHILD === "1";
    const inInteractiveRex = !stageRunnerChild && ctx.mode === "tui" && Boolean(process.env.REX_SESSION) && Boolean(process.env.REX_BLOCK);
    if (inInteractiveRex) {
      const sessionCwd = !rexNamingState.attempted ? rexNamingState.startupCwd : undefined;
      if (sessionCwd) rexNamingState.attempted = true;
      let taskLabel: string | null = null;
      if (event.messageType === "user" && typeof event.prompt === "string") {
        const slashLabel = deriveSlashTaskLabel(event.prompt);
        taskLabel = slashLabel ?? (!rexNamingState.taskNamed ? derivePromptTaskLabel(event.prompt) : null);
        if (taskLabel) rexNamingState.taskNamed = true;
      }
      if (sessionCwd || taskLabel) {
        void nameRexSessionAndTask({ sessionCwd, taskLabel }, process.env);
      }
    }
    const { cwd } = ctx;
    const [{ name, email }, rexLines, { repoRoot, branch, localDefaultBranch }] = await Promise.all([
      getGitIdentity(cwd),
      stageRunnerChild ? Promise.resolve(null) : getRexLines(),
      getFastGitContext(cwd),
    ]);

    const fastLines: string[] = [];
    if (name || email) {
      fastLines.push("## User Identity");
      if (name) fastLines.push(`- Name: ${name}`);
      if (email) fastLines.push(`- Email: ${email}`);
    }

    if (rexLines) {
      if (fastLines.length > 0) fastLines.push("");
      fastLines.push(...rexLines);
    }

    const currentModelLines = formatCurrentModel(ctx.model);
    if (currentModelLines.length > 0) {
      if (fastLines.length > 0) fastLines.push("");
      fastLines.push(...currentModelLines);
    }

    const slowLinesToEmit: string[] = [];
    if (repoRoot) {
      const localRepoName = path.basename(repoRoot);
      const repoContextKey = buildRepoContextKey(cwd, branch, email);
      const cached = cachedRepoContext?.key === repoContextKey ? cachedRepoContext : null;
      const repoName = localRepoName;
      const defaultBranch = localDefaultBranch;
      const jiraKeys = profile === "work" ? uniqueMatches([branch, repoName].filter(Boolean).join(" ")) : [];

      if (repoName) {
        if (fastLines.length > 0) fastLines.push("");
        fastLines.push("## Current Repository");
        fastLines.push(repoName);
      }

      if (branch) {
        fastLines.push("");
        fastLines.push("## Current Git Branch");
        fastLines.push(branch);
      }

      if (defaultBranch) {
        fastLines.push("");
        fastLines.push("## Default Branch");
        fastLines.push(defaultBranch);
      }

      if (jiraKeys.length > 0) {
        fastLines.push("");
        fastLines.push("## Possible Jira Ticket(s)");
        for (const key of jiraKeys) fastLines.push(`- ${key}: https://datadoghq.atlassian.net/browse/${key}`);
      }

      const worktreeLines = getWorktreeInfo(repoRoot, profile);
      if (worktreeLines.length > 0) {
        fastLines.push("");
        fastLines.push("## Worktree Context");
        fastLines.push(...worktreeLines);
      }

      const hintLines = repoHints(repoRoot, repoName, profile);
      if (hintLines.length > 0) {
        fastLines.push("");
        fastLines.push("## Repo-Specific Hints");
        fastLines.push(...hintLines);
      }

      if (cached) {
        if (cached.repoName && cached.repoName !== localRepoName) {
          slowLinesToEmit.push("## Remote Repository");
          slowLinesToEmit.push(cached.repoName);
        }
        if (cached.defaultBranch && cached.defaultBranch !== localDefaultBranch) {
          if (slowLinesToEmit.length > 0) slowLinesToEmit.push("");
          slowLinesToEmit.push("## Default Branch");
          slowLinesToEmit.push(cached.defaultBranch);
        }
        if (cached.lines.length > 0) {
          if (slowLinesToEmit.length > 0) slowLinesToEmit.push("");
          slowLinesToEmit.push(...cached.lines);
        }
      }

      if (!stageRunnerChild && repoContextFetchKey !== repoContextKey) {
        repoContextFetchKey = repoContextKey;
        void (async () => {
          const slowLines: string[] = [];
          const ghEnv = await getGitHubEnv(cwd, profile);
          const onFeatureBranch = Boolean(branch && branch !== localDefaultBranch);
          const [repoInfo, gitHubUser, currentPR] = await Promise.all([
            getRepoInfo(cwd, localRepoName, localDefaultBranch, ghEnv),
            getGitHubUsername(ghEnv),
            onFeatureBranch ? getCurrentPR(cwd, ghEnv) : Promise.resolve(null),
          ]);
          const remoteRepoName = repoInfo.repoName;
          const remoteDefaultBranch = repoInfo.defaultBranch;

          if (gitHubUser) {
            slowLines.push("## GitHub Identity");
            slowLines.push(`- GitHub: @${gitHubUser}`);
          }

          if (currentPR) {
            if (slowLines.length > 0) slowLines.push("");
            slowLines.push("## Current Branch Pull Request");
            slowLines.push(formatPR(currentPR));
          }

          if (repoContextFetchKey === repoContextKey) {
            cachedRepoContext = {
              key: repoContextKey,
              lines: slowLines,
              repoName: remoteRepoName,
              defaultBranch: remoteDefaultBranch,
            };
          }
        })();
      }
    }

    const fastContent = fastLines.join("\n");
    const slowContent = slowLinesToEmit.join("\n");
    const chunks: string[] = [];

    if (fastContent && fastContent !== lastInjectedFastContent) {
      lastInjectedFastContent = fastContent;
      chunks.push(fastContent);
    }
    if (slowContent && slowContent !== lastInjectedSlowContent) {
      lastInjectedSlowContent = slowContent;
      chunks.push(slowContent);
    }

    if (chunks.length === 0) return;

    return {
      message: {
        customType: "user-context",
        content: chunks.join("\n\n"),
        display: false,
      },
    };
  });
}
