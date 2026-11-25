import { parseGitHubOwnerRepo, parsePullRequestUrl, routedGhEnv, scrubbedGhEnv, selectGitHubLogin } from "../_shared/github.ts";
import type { PiProfile } from "../_shared/profile.ts";

// deliberate: Read one page of checks and threads per poll. Follow cursors if the footer needs complete results.
const PR_FIELDS = `
        number title url state isDraft mergedAt
        statusCheckRollup {
          contexts(first: 100) {
            pageInfo { hasNextPage }
            nodes {
              __typename
              ... on CheckRun { status conclusion }
              ... on StatusContext { state }
            }
          }
        }
        reviewThreads(first: 100) {
          pageInfo { hasNextPage }
          nodes {
            isResolved isOutdated
            comments(last: 1) { nodes { author { login } } }
          }
        }`;

const BRANCH_QUERY = `query BranchPullRequests($owner: String!, $repo: String!, $headRef: String!) {
  viewer { login }
  repository(owner: $owner, name: $repo) {
    pullRequests(headRefName: $headRef, states: [OPEN, MERGED, CLOSED], first: 5, orderBy: { field: UPDATED_AT, direction: DESC }) {
      nodes {
        headRepository { nameWithOwner }${PR_FIELDS}
      }
    }
  }
}`;

const PR_BY_NUMBER_QUERY = `query PullRequestByNumber($owner: String!, $repo: String!, $number: Int!) {
  viewer { login }
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {${PR_FIELDS}
    }
  }
}`;

export type AsyncRunner = (
  command: string,
  args?: string[],
  cwd?: string,
  timeout?: number,
  env?: NodeJS.ProcessEnv,
) => Promise<string | null>;

export type PrRef = { owner: string; repo: string; number: number };
export type PrState = "OPEN" | "MERGED" | "CLOSED";
export type PrStatusResult = {
  key: string;
  line: string;
  state: PrState;
  mergedAt: string | null;
};
export type TokenCache = Map<string, NodeJS.ProcessEnv | undefined>;

export function prKey(pr: PrRef): string {
  return `${pr.owner.toLowerCase()}/${pr.repo.toLowerCase()}#${pr.number}`;
}

type Page<T> = { nodes: (T | null)[]; pageInfo: { hasNextPage: boolean } };
type CheckContext = { __typename: string; status?: string; conclusion?: string | null; state?: string };
type ReviewThread = {
  isResolved: boolean;
  isOutdated: boolean;
  comments: { nodes: ({ author: { login: string } | null } | null)[] };
};

type PullRequest = {
  number: number;
  title: string;
  url: string;
  state: PrState;
  isDraft: boolean;
  mergedAt?: string | null;
  headRepository?: { nameWithOwner: string } | null;
  statusCheckRollup: { contexts: Page<CheckContext> } | null;
  reviewThreads: Page<ReviewThread>;
};

type BranchQueryResult = {
  data?: { viewer: { login: string }; repository: { pullRequests: { nodes: (PullRequest | null)[] } } | null };
  errors?: unknown[];
};

type ByNumberQueryResult = {
  data?: { viewer: { login: string }; repository: { pullRequest: PullRequest | null } | null };
  errors?: unknown[];
};

function sanitizeTitle(title: string): string {
  return title
    .replace(/(?:\x1b\]|\x9d)[^\x07\x1b\x9c]*(?:\x07|\x1b\\|\x9c|$)/g, "")
    .replace(/(?:\x1b\[|\x9b)[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/g, "")
    .replace(/[\x00-\x1f\x7f-\x9f]/g, "");
}

function validPullUrl(value: string, number: number): boolean {
  try {
    const parsed = parsePullRequestUrl(value);
    return parsed.url === value && parsed.number === number;
  } catch {
    return false;
  }
}

function checkOutcome(check: CheckContext | null) {
  if (check?.__typename === "StatusContext") {
    switch (check.state) {
      case "FAILURE": case "ERROR": return "failure";
      case "PENDING": case "EXPECTED": return "pending";
      case "SUCCESS": return "success";
      default: return "unknown";
    }
  }
  if (check?.__typename !== "CheckRun") return "unknown";
  const { status, conclusion } = check;
  if (["FAILURE", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"].includes(conclusion ?? "")) return "failure";
  if (!["COMPLETED", "IN_PROGRESS", "PENDING", "QUEUED", "REQUESTED", "WAITING"].includes(status ?? "") ||
    (conclusion !== null && !["SUCCESS", "SKIPPED", "NEUTRAL", "CANCELLED", "STALE"].includes(conclusion ?? ""))) return "unknown";
  if (status !== "COMPLETED") return "pending";
  if (conclusion === "SUCCESS") return "success";
  if (conclusion === "SKIPPED" || conclusion === "NEUTRAL") return "neutral";
  return "other";
}

function ciSymbol(rollup: PullRequest["statusCheckRollup"]): string {
  if (rollup === null) return "—";
  const { nodes, pageInfo } = rollup.contexts;
  if (nodes.length === 0 && !pageInfo.hasNextPage) return "—";
  const outcomes = nodes.map(checkOutcome);
  if (outcomes.includes("failure")) return "✗";
  if (pageInfo.hasNextPage || outcomes.includes("unknown")) return "?";
  if (outcomes.includes("pending")) return "◔";
  if (outcomes.includes("success") && !outcomes.includes("other")) return "✓";
  return "⊘";
}

function unrepliedCount({ nodes, pageInfo }: Page<ReviewThread>, viewer: string): string {
  let count = 0;
  const viewerLogin = viewer.toLowerCase();
  for (const thread of nodes) {
    if (!thread || thread.isResolved || thread.isOutdated) continue;
    const lastComment = thread.comments.nodes[0];
    if (lastComment && lastComment.author?.login.toLowerCase() !== viewerLogin) count++;
  }
  return `${count}${pageInfo.hasNextPage ? "+" : ""}`;
}

async function resolveAuthEnv(
  owner: string,
  profile: PiProfile,
  run: AsyncRunner,
  { cwd, baseEnv, tokenCache }: { cwd: string; baseEnv: NodeJS.ProcessEnv; tokenCache?: TokenCache },
): Promise<NodeJS.ProcessEnv> {
  if (profile !== "work") return scrubbedGhEnv(baseEnv);
  const login = selectGitHubLogin(owner);
  if (tokenCache?.has(login)) {
    const cached = tokenCache.get(login);
    if (!cached) throw new Error();
    return cached;
  }
  const env = await routedGhEnv(owner, profile, run, { cwd, baseEnv, timeoutMs: 10000 });
  tokenCache?.set(login, env);
  if (!env) throw new Error();
  return env;
}

function formatPrResult(
  repo: { owner: string; repo: string },
  pr: PullRequest,
  login: string,
  showRepo: boolean,
): PrStatusResult {
  if (!Number.isSafeInteger(pr.number) || pr.number < 1 || !["OPEN", "MERGED", "CLOSED"].includes(pr.state)) {
    throw new Error();
  }
  const stateLabel = pr.state === "OPEN" && pr.isDraft ? "draft" : pr.state.toLowerCase();
  const prefix = showRepo ? `${sanitizeTitle(repo.repo)}#${pr.number}` : `#${pr.number}`;
  const text = `${prefix} ${sanitizeTitle(pr.title)}`;
  const linked = validPullUrl(pr.url, pr.number) ? `\x1b]8;;${pr.url}\x1b\\${text}\x1b]8;;\x1b\\` : text;
  return {
    key: prKey({ owner: repo.owner, repo: repo.repo, number: pr.number }),
    line: `[${stateLabel}] ${linked}\t${ciSymbol(pr.statusCheckRollup)} CI  💬 ${unrepliedCount(pr.reviewThreads, login)}`,
    state: pr.state,
    mergedAt: typeof pr.mergedAt === "string" ? pr.mergedAt : null,
  };
}

export async function queryPrStatus(
  remote: string,
  branch: string,
  profile: PiProfile,
  run: AsyncRunner,
  { cwd, baseEnv = process.env, tokenCache }: { cwd: string; baseEnv?: NodeJS.ProcessEnv; tokenCache?: TokenCache },
): Promise<PrStatusResult | undefined> {
  const repo = parseGitHubOwnerRepo(remote);
  if (!repo) return undefined;

  try {
    const env = await resolveAuthEnv(repo.owner, profile, run, { cwd, baseEnv, tokenCache });
    const raw = await run("gh", [
      "api", "graphql", "--raw-field", `query=${BRANCH_QUERY}`,
      "--raw-field", `owner=${repo.owner}`, "--raw-field", `repo=${repo.repo}`, "--raw-field", `headRef=${branch}`,
    ], cwd, 10000, env);
    if (!raw) throw new Error();
    const { data, errors } = JSON.parse(raw) as BranchQueryResult;
    const login = data?.viewer?.login;
    if (errors?.length || !login || !data?.repository ||
      (profile === "work" && login.toLowerCase() !== selectGitHubLogin(repo.owner))) throw new Error();

    const name = `${repo.owner}/${repo.repo}`.toLowerCase();
    const matches = data.repository.pullRequests.nodes.filter((node): node is PullRequest =>
      node?.headRepository?.nameWithOwner.toLowerCase() === name);
    const pr = matches.find((node) => node.state === "OPEN") ?? matches[0];
    if (!pr) return undefined;
    return formatPrResult(repo, pr, login, false);
  } catch {
    // Subprocess errors and response bodies must not reach the footer or logs.
    throw new Error("Cannot read PR status");
  }
}

export async function queryPrByNumber(
  ref: PrRef,
  profile: PiProfile,
  run: AsyncRunner,
  {
    cwd,
    baseEnv = process.env,
    showRepo = false,
    tokenCache,
  }: { cwd: string; baseEnv?: NodeJS.ProcessEnv; showRepo?: boolean; tokenCache?: TokenCache },
): Promise<PrStatusResult | undefined> {
  if (!Number.isSafeInteger(ref.number) || ref.number < 1) return undefined;

  try {
    const env = await resolveAuthEnv(ref.owner, profile, run, { cwd, baseEnv, tokenCache });
    const raw = await run("gh", [
      "api", "graphql", "--raw-field", `query=${PR_BY_NUMBER_QUERY}`,
      "--raw-field", `owner=${ref.owner}`, "--raw-field", `repo=${ref.repo}`, "--field", `number=${ref.number}`,
    ], cwd, 10000, env);
    if (!raw) throw new Error();
    const { data, errors } = JSON.parse(raw) as ByNumberQueryResult;
    const login = data?.viewer?.login;
    if (errors?.length || !login || !data?.repository ||
      (profile === "work" && login.toLowerCase() !== selectGitHubLogin(ref.owner))) throw new Error();

    const pr = data.repository.pullRequest;
    if (!pr) return undefined;
    return formatPrResult(ref, pr, login, showRepo);
  } catch {
    // Subprocess errors and response bodies must not reach the footer or logs.
    throw new Error("Cannot read PR status");
  }
}
