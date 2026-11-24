import { execFileSync } from "node:child_process";

const WORK_GH_ORGS = new Set(["ddoghq", "ddoghq-sandbox"]);

export function isWorkGitHubOrg(owner) {
  return WORK_GH_ORGS.has(owner.toLowerCase());
}

export function selectGitHubLogin(owner) {
  return isWorkGitHubOrg(owner) ? "matteo-ruina_ddog" : "maruina";
}

export function parseGitHubOwnerRepo(remoteUrl) {
  if (typeof remoteUrl !== "string") return null;
  const match =
    /^(?:https?:\/\/github\.com\/|git@(?:github\.com|ddoghq\.github\.com):|ssh:\/\/git@(?:github\.com|ddoghq\.github\.com|ssh\.github\.com)(?::\d+)?\/)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i.exec(
      remoteUrl.trim(),
    );
  if (!match) return null;
  const [, owner, repo] = match;
  if (owner === "." || owner === ".." || repo === "." || repo === "..") return null;
  return { owner, repo };
}

export function githubRemoteIdentity(value) {
  const parsed = parseGitHubOwnerRepo(value);
  return parsed ? `${parsed.owner}/${parsed.repo}`.toLowerCase() : null;
}

export function parsePullRequestUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("invalid_url");
  }

  if (url.protocol !== "https:" || url.hostname !== "github.com" || url.username || url.password || url.port) {
    throw new Error("invalid_url");
  }

  const match = /^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/([0-9]+)\/?$/.exec(url.pathname);
  if (!match) throw new Error("invalid_url");
  const number = Number(match[3]);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error("invalid_url");

  const [, owner, repo] = match;
  return { owner, repo, number, url: `https://github.com/${owner}/${repo}/pull/${number}` };
}

export function scrubbedGhEnv(baseEnv = process.env, token) {
  const env = { ...baseEnv, GH_PROMPT_DISABLED: "1", GH_HOST: "github.com" };
  delete env.GH_TOKEN;
  delete env.GITHUB_TOKEN;
  if (token) env.GH_TOKEN = token;
  return env;
}

export function getGhTokenSync(login, { cwd, env = process.env, timeout = 5000 } = {}) {
  try {
    const token = execFileSync("gh", ["auth", "token", "--hostname", "github.com", "--user", login], {
      cwd,
      env: scrubbedGhEnv(env),
      encoding: "utf8",
      timeout,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return token && !/\s/.test(token) ? token : null;
  } catch {
    return null;
  }
}
