import type { BeforeAgentStartEvent, BeforeAgentStartEventResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { traceHook } from "./_shared/tracing.ts";

const execFileAsync = promisify(execFile);
const JIRA_KEY_RE = /\b[A-Z][A-Z0-9]+-[0-9]+\b/g;
const DATA_DOG_ROOT = path.join(process.env.HOME ?? "", "dd");
const DATA_DOG_WORKTREES = path.join(DATA_DOG_ROOT, ".worktrees");
const SKILL_LOADER_GUIDANCE = `## Skill Loading

For requests that involve planning, reviewing, implementing, modifying, debugging, or testing code, first read the \`skill-loader\` skill and follow its checklist before editing files. Use it to determine which language and domain skills to load. Skip this for purely informational, operational, or non-code tasks.`;
const CODE_TASK_RE = /\b(plan|implement|edit|modify|change|fix|refactor|review|write|add|create|update|debug|test|tests|testing)\b/i;
const CODE_CONTEXT_RE = /\b(code|file|files|function|class|method|module|package|script|terraform|helm|yaml|go|typescript|javascript|shell|bash|cli|controller|crd|extension|test|tests|testing|ci)\b|\.(go|ts|tsx|js|jsx|sh|bash|tf|tfvars|hcl|ya?ml)\b/i;

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

function runSync(command: string, args: string[] = [], cwd?: string, timeout = 2000): string | null {
  try {
    return execFileSync(command, args, { encoding: "utf8", timeout, cwd, stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

async function runAsync(command: string, args: string[] = [], cwd?: string, timeout = 10000): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(command, args, { encoding: "utf8", timeout, cwd });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

function git(cwd: string, args: string[], timeout?: number): string | null {
  return runSync("git", args, cwd, timeout);
}

function isGitRepo(cwd: string): boolean {
  return git(cwd, ["rev-parse", "--is-inside-work-tree"]) === "true";
}

function getGitIdentity(cwd: string): { name: string | null; email: string | null } {
  return {
    name: git(cwd, ["config", "user.name"]),
    email: git(cwd, ["config", "user.email"]),
  };
}

function getGitBranch(cwd: string): string | null {
  return git(cwd, ["branch", "--show-current"]);
}

function getLocalDefaultBranch(cwd: string): string | null {
  const originHead = git(cwd, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
  if (originHead?.startsWith("origin/")) return originHead.slice("origin/".length);
  return null;
}

async function getDefaultBranch(cwd: string): Promise<string | null> {
  const localDefault = getLocalDefaultBranch(cwd);
  if (localDefault) return localDefault;
  return (await runAsync("git", ["remote", "show", "origin"], cwd, 5000))?.match(/HEAD branch: (.+)/)?.[1]?.trim() ?? null;
}

function getRepoRoot(cwd: string): string | null {
  return git(cwd, ["rev-parse", "--show-toplevel"]);
}

function getLocalRepoName(cwd: string): string | null {
  const root = getRepoRoot(cwd);
  return root ? path.basename(root) : null;
}

async function getRepoName(cwd: string): Promise<string | null> {
  const nameWithOwner = await runAsync("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], cwd, 3000);
  return nameWithOwner ?? getLocalRepoName(cwd);
}

export function uniqueMatches(text: string): string[] {
  return [...new Set(text.match(JIRA_KEY_RE) ?? [])];
}

export function pathInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function getWorktreeInfo(cwd: string): string[] {
  const root = getRepoRoot(cwd);
  if (!root) return [];

  const lines: string[] = [];
  if (DATA_DOG_WORKTREES && pathInside(root, DATA_DOG_WORKTREES)) {
    lines.push("- This checkout is in the standard DataDog worktree directory.");
    lines.push(`- Worktree root: ${root}`);
    lines.push(`- Main checkout convention: ${DATA_DOG_ROOT}/<repo>`);
  } else if (DATA_DOG_ROOT && pathInside(root, DATA_DOG_ROOT)) {
    lines.push(`- Repository root: ${root}`);
    lines.push(`- Worktree convention: ${DATA_DOG_WORKTREES}/<repo-name>-<branch-slug>`);
  }
  return lines;
}

function repoHints(cwd: string, repoName: string | null): string[] {
  const root = getRepoRoot(cwd) ?? cwd;
  const repo = repoName ?? path.basename(root);
  const lowerRepo = repo.toLowerCase();
  const lines: string[] = [];

  if (lowerRepo.includes("dd-source")) {
    lines.push("- In dd-source, use `bzl` rather than `bazel` for builds/tests.");
    lines.push("- Prefer `:all` targets when practical (for example, `bzl test //path/to/package:all`).");
  }

  if (existsSync(path.join(root, ".terraform")) || existsSync(path.join(root, ".terraform-version")) || existsSync(path.join(root, "terraform"))) {
    lines.push("- For Terraform formatting, run with tracing disabled: `OTEL_TRACES_EXPORTER= terraform fmt`.");
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

  if (lowerRepo.includes("datadog")) {
    lines.push("- Prefer `gh` for GitHub operations and Datadog MCP/Atlassian MCP for internal Datadog data and docs.");
  }

  return [...new Set(lines)];
}

async function getGitHubUsername(): Promise<string | null> {
  return runAsync("gh", ["api", "graphql", "-f", "query=query { viewer { login } }", "--jq", ".data.viewer.login"]);
}

async function getCurrentPR(cwd: string): Promise<CurrentPullRequest | null> {
  const raw = await runAsync("gh", ["pr", "view", "--json", "number,title,state,url,baseRefName,headRefName"], cwd, 8000);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CurrentPullRequest;
  } catch {
    return null;
  }
}

async function getRecentPRs(cwd: string, limit = 3): Promise<RecentPullRequest[]> {
  const raw = await runAsync(
    "gh",
    ["pr", "list", "--author", "@me", "--limit", String(limit * 3), "--state", "all", "--json", "number,title,state,url,baseRefName,headRefName"],
    cwd,
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

export function formatCurrentModel(model?: { id?: string; name?: string }): string[] {
  if (!model?.id) return [];
  return ["## Current Model", `- ${model.name ?? model.id} (${model.id})`];
}

export function shouldAddSkillLoaderGuidance(prompt: string): boolean {
  return CODE_TASK_RE.test(prompt) && CODE_CONTEXT_RE.test(prompt);
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

  pi.on("before_agent_start", traceHook<BeforeAgentStartEvent, BeforeAgentStartEventResult>(pi, "user-context.before_agent_start", async (event, ctx) => {
    const { cwd } = ctx;
    const lines: string[] = [];
    const { name, email } = getGitIdentity(cwd);

    if (name || email) {
      lines.push("## User Identity");
      if (name) lines.push(`- Name: ${name}`);
      if (email) lines.push(`- Email: ${email}`);
    }

    const currentModelLines = formatCurrentModel(ctx.model);
    if (currentModelLines.length > 0) {
      if (lines.length > 0) lines.push("");
      lines.push(...currentModelLines);
    }

    if (isGitRepo(cwd)) {
      const localRepoName = getLocalRepoName(cwd);
      const branch = getGitBranch(cwd);
      const repoContextKey = buildRepoContextKey(cwd, branch, email);
      const cached = cachedRepoContext?.key === repoContextKey ? cachedRepoContext : null;
      const repoName = cached?.repoName ?? localRepoName;
      const defaultBranch = cached?.defaultBranch ?? getLocalDefaultBranch(cwd);
      const jiraKeys = uniqueMatches([branch, repoName].filter(Boolean).join(" "));

      if (repoName) {
        if (lines.length > 0) lines.push("");
        lines.push("## Current Repository");
        lines.push(repoName);
      }

      if (branch) {
        lines.push("");
        lines.push("## Current Git Branch");
        lines.push(branch);
      }

      if (defaultBranch) {
        lines.push("");
        lines.push("## Default Branch");
        lines.push(defaultBranch);
      }

      if (jiraKeys.length > 0) {
        lines.push("");
        lines.push("## Possible Jira Ticket(s)");
        for (const key of jiraKeys) lines.push(`- ${key}: https://datadoghq.atlassian.net/browse/${key}`);
      }

      const worktreeLines = getWorktreeInfo(cwd);
      if (worktreeLines.length > 0) {
        lines.push("");
        lines.push("## Worktree Context");
        lines.push(...worktreeLines);
      }

      const hintLines = repoHints(cwd, repoName);
      if (hintLines.length > 0) {
        lines.push("");
        lines.push("## Repo-Specific Hints");
        lines.push(...hintLines);
      }

      if (cached?.lines.length) {
        lines.push("");
        lines.push(...cached.lines);
      }

      if (repoContextFetchKey !== repoContextKey) {
        repoContextFetchKey = repoContextKey;
        void (async () => {
          const slowLines: string[] = [];
          const [remoteRepoName, remoteDefaultBranch, gitHubUser, currentPR, prs, files] = await Promise.all([
            getRepoName(cwd),
            getDefaultBranch(cwd),
            getGitHubUsername(),
            getCurrentPR(cwd),
            getRecentPRs(cwd, 3),
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

    const response: {
      message?: { customType: string; content: string; display: boolean };
      systemPrompt?: string;
    } = {};

    if (lines.length > 0) {
      response.message = {
        customType: "user-context",
        content: lines.join("\n"),
        display: false,
      };
    }

    if (shouldAddSkillLoaderGuidance(event.prompt)) {
      response.systemPrompt = `${event.systemPrompt}\n\n${SKILL_LOADER_GUIDANCE}`;
    }

    if (!response.message && !response.systemPrompt) return;
    return response;
  }));
}
