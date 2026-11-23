import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { parseGitHubOwnerRepo, selectGitHubLogin } from "./_shared/github.ts";

export { parseGitHubOwnerRepo, selectGitHubLogin };

const execFileAsync = promisify(execFile);
const JIRA_KEY_RE = /\b[A-Z][A-Z0-9]+-[0-9]+\b/g;
const DATA_DOG_ROOT = path.join(process.env.HOME ?? "", "dd");
const DATA_DOG_WORKTREES = path.join(DATA_DOG_ROOT, ".worktrees");
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

type RecentPullRequest = {
  number: number;
  title: string;
  state: string;
  url?: string;
  baseRefName?: string;
  headRefName?: string;
};

async function runAsync(command: string, args: string[] = [], cwd?: string, timeout = 10000, env?: NodeJS.ProcessEnv): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(command, args, { encoding: "utf8", timeout, cwd, ...(env ? { env } : {}) });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

function gitAsync(cwd: string, args: string[], timeout = 2000): Promise<string | null> {
  return runAsync("git", args, cwd, timeout);
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

async function getLocalDefaultBranch(cwd: string): Promise<string | null> {
  const originHead = await gitAsync(cwd, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
  if (originHead?.startsWith("origin/")) return originHead.slice("origin/".length);
  return null;
}

async function getDefaultBranch(cwd: string): Promise<string | null> {
  const localDefault = await getLocalDefaultBranch(cwd);
  if (localDefault) return localDefault;
  return (await runAsync("git", ["remote", "show", "origin"], cwd, 5000))?.match(/HEAD branch: (.+)/)?.[1]?.trim() ?? null;
}

async function getGitHubEnv(cwd: string): Promise<NodeJS.ProcessEnv | undefined> {
  const remoteUrl = await gitAsync(cwd, ["remote", "get-url", "origin"]);
  if (!remoteUrl) return undefined;
  const parsed = parseGitHubOwnerRepo(remoteUrl);
  if (!parsed) return undefined;
  const login = selectGitHubLogin(parsed.owner);
  const cleanEnv = { ...process.env };
  delete cleanEnv.GH_TOKEN;
  delete cleanEnv.GITHUB_TOKEN;
  const token = await runAsync("gh", ["auth", "token", "--hostname", "github.com", "--user", login], cwd, 3000, cleanEnv);
  if (!token) return undefined;
  return { ...cleanEnv, GH_TOKEN: token, GH_HOST: "github.com" };
}

async function getRepoName(cwd: string, localRepoName: string, ghEnv?: NodeJS.ProcessEnv): Promise<string | null> {
  const nameWithOwner = await runAsync("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], cwd, 3000, ghEnv);
  return nameWithOwner ?? localRepoName;
}

export function uniqueMatches(text: string): string[] {
  return [...new Set(text.match(JIRA_KEY_RE) ?? [])];
}

export function pathInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function getWorktreeInfo(root: string): string[] {
  const lines: string[] = [];
  if (DATA_DOG_WORKTREES && pathInside(root, DATA_DOG_WORKTREES)) {
    lines.push("- This checkout is in the standard DataDog worktree directory.");
    lines.push(`- Worktree root: ${root}`);
    lines.push(`- Main checkout convention: ${DATA_DOG_ROOT}/<repo>`);
  } else if (DATA_DOG_ROOT && pathInside(root, DATA_DOG_ROOT)) {
    lines.push(`- Repository root: ${root}`);
    lines.push(`- Worktree convention: ${DATA_DOG_WORKTREES}/<repo>/<branch-slug>`);
  }
  return lines;
}

function repoHints(root: string, repoName: string | null): string[] {
  const repo = repoName ?? path.basename(root);
  const lowerRepo = repo.toLowerCase();
  const lines: string[] = [];

  if (lowerRepo.includes("dd-source")) {
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

async function getRecentPRs(cwd: string, limit = 3, ghEnv?: NodeJS.ProcessEnv): Promise<RecentPullRequest[]> {
  const raw = await runAsync(
    "gh",
    ["pr", "list", "--author", "@me", "--limit", String(limit * 3), "--state", "all", "--json", "number,title,state,url,baseRefName,headRefName"],
    cwd,
    10000,
    ghEnv,
  );
  if (!raw) return [];
  try {
    const all = JSON.parse(raw) as RecentPullRequest[];
    return all.filter((pr) => pr.state === "OPEN" || pr.state === "MERGED").slice(0, limit);
  } catch {
    return [];
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getRecentFiles(email: string, cwd: string, sampleSize = 10): Promise<string[]> {
  const raw = await runAsync("git", ["log", `--author=${escapeRegExp(email)}`, "--since=3 months ago", "--name-only", "--pretty=format:"], cwd, 15000);
  if (!raw) return [];
  const files = [...new Set(raw.split("\n").map((line) => line.trim()).filter(Boolean))];

  // Deterministic-ish sample: prefer files seen more recently in git-log order, but spread
  // across the set so this does not always return only files from the latest commit.
  const stride = Math.max(1, Math.floor(files.length / sampleSize));
  return files.filter((_, index) => index % stride === 0).slice(0, Math.min(sampleSize, files.length));
}

export function formatPR(pr: RecentPullRequest | CurrentPullRequest): string {
  const state = pr.state === "OPEN" ? "OPEN" : pr.state === "MERGED" ? "MERGED" : pr.state;
  const base = pr.baseRefName ? ` → ${pr.baseRefName}` : "";
  const head = pr.headRefName ? `${pr.headRefName}` : `#${pr.number}`;
  const link = pr.url ? ` (${pr.url})` : "";
  return `- [${state}] #${pr.number}${base}: ${pr.title} [head: ${head}]${link}`;
}

export function formatCurrentModel(model?: { provider?: string; id?: string; name?: string }): string[] {
  if (!model?.id) return [];
  const qualifiedId = model.provider && !model.id.startsWith(`${model.provider}/`)
    ? `${model.provider}/${model.id}`
    : model.id;
  return ["## Current Model", `- ${model.name ?? model.id} (${qualifiedId})`];
}

export function formatRexContext(output: string): string[] {
  return ["## Rex", "", ...output.split("\n")];
}

type AsyncRunner = typeof runAsync;

// rex __internal session-start prints the Rex guidance block and exits 0
// with no output when REX_SESSION is unset, so it is safe outside Rex.
export async function loadRexLines(env: NodeJS.ProcessEnv, run: AsyncRunner): Promise<string[] | null> {
  if (!env.REX_SESSION) return null;
  const output = await run("rex", ["__internal", "session-start", "--agent", "pi", "--feature-session-naming=false"], undefined, 3000);
  return output ? formatRexContext(output) : null;
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
    const stageRunnerChild = process.env.PI_STAGE_RUNNER_CHILD === "1";
    const inInteractiveRex = !stageRunnerChild && ctx.mode === "tui" && Boolean(process.env.REX_SESSION) && Boolean(process.env.REX_BLOCK);
    if (inInteractiveRex && !rexNamingState.attempted) {
      rexNamingState.attempted = true;
      void runAsync("fish", ["-c", "rex-name-session"], rexNamingState.startupCwd, 3000);
    }
    if (inInteractiveRex && event.messageType === "user" && typeof event.prompt === "string") {
      const slashLabel = deriveSlashTaskLabel(event.prompt);
      const taskLabel = slashLabel ?? (!rexNamingState.taskNamed ? derivePromptTaskLabel(event.prompt) : null);
      if (taskLabel) {
        rexNamingState.taskNamed = true;
        void runAsync("fish", ["-c", `rex-name-task ${taskLabel}`], ctx.cwd, 3000);
      }
    }
    const { cwd } = ctx;
    const [{ name, email }, rexLines, repoRoot, branch, localDefaultBranch] = await Promise.all([
      getGitIdentity(cwd),
      stageRunnerChild ? Promise.resolve(null) : getRexLines(),
      gitAsync(cwd, ["rev-parse", "--show-toplevel"]),
      gitAsync(cwd, ["branch", "--show-current"]),
      getLocalDefaultBranch(cwd),
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
      const jiraKeys = uniqueMatches([branch, repoName].filter(Boolean).join(" "));

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

      const worktreeLines = getWorktreeInfo(repoRoot);
      if (worktreeLines.length > 0) {
        fastLines.push("");
        fastLines.push("## Worktree Context");
        fastLines.push(...worktreeLines);
      }

      const hintLines = repoHints(repoRoot, repoName);
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
          const ghEnv = await getGitHubEnv(cwd);
          const [remoteRepoName, remoteDefaultBranch, gitHubUser, currentPR, prs, files] = await Promise.all([
            getRepoName(cwd, localRepoName, ghEnv),
            getDefaultBranch(cwd),
            getGitHubUsername(ghEnv),
            getCurrentPR(cwd, ghEnv),
            getRecentPRs(cwd, 3, ghEnv),
            email ? getRecentFiles(email, cwd) : Promise.resolve([] as string[]),
          ]);

          if (gitHubUser) {
            slowLines.push("## GitHub Identity");
            slowLines.push(`- GitHub: @${gitHubUser}`);
          }

          if (currentPR) {
            if (slowLines.length > 0) slowLines.push("");
            slowLines.push("## Current Branch Pull Request");
            slowLines.push(formatPR(currentPR));
          }

          const recent = currentPR ? prs.filter((pr) => pr.number !== currentPR.number) : prs;
          if (recent.length > 0) {
            if (slowLines.length > 0) slowLines.push("");
            slowLines.push("## Recent Pull Requests");
            for (const pr of recent) slowLines.push(formatPR(pr));
          }

          if (files.length > 0) {
            if (slowLines.length > 0) slowLines.push("");
            slowLines.push("## Files Recently Modified by User (sample, last 3 months)");
            for (const file of files) slowLines.push(`- ${file}`);
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
