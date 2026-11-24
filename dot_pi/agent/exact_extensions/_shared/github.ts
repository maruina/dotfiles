import type { PiProfile } from "./profile.ts";

const WORK_GH_ORGS = new Set(["ddoghq", "ddoghq-sandbox"]);

export function isWorkGitHubOrg(owner: string): boolean {
  return WORK_GH_ORGS.has(owner.toLowerCase());
}

export function parseGitHubOwnerRepo(remoteUrl: string): { owner: string; repo: string } | null {
  const match = /^(?:https?:\/\/github\.com\/|git@(?:github\.com|ddoghq\.github\.com):|ssh:\/\/git@(?:github\.com|ddoghq\.github\.com|ssh\.github\.com)(?::\d+)?\/)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(
    remoteUrl.trim(),
  );
  if (!match) return null;
  const [, owner, repo] = match;
  if (owner === "." || owner === ".." || repo === "." || repo === "..") return null;
  return { owner, repo };
}

export function selectGitHubLogin(owner: string): string {
  return isWorkGitHubOrg(owner) ? "matteo-ruina_ddog" : "maruina";
}

export function scrubbedGhEnv(baseEnv: NodeJS.ProcessEnv = process.env, token?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...baseEnv, GH_PROMPT_DISABLED: "1", GH_HOST: "github.com" };
  delete env.GH_TOKEN;
  delete env.GITHUB_TOKEN;
  if (token) env.GH_TOKEN = token;
  return env;
}

export async function routedGhEnv(
  owner: string,
  profile: PiProfile,
  run: (command: string, args: string[], cwd: string, timeout: number, env: NodeJS.ProcessEnv) => Promise<string | null>,
  { cwd, timeoutMs = 3000, baseEnv = process.env }: { cwd: string; timeoutMs?: number; baseEnv?: NodeJS.ProcessEnv },
): Promise<NodeJS.ProcessEnv | undefined> {
  if (profile !== "work") return undefined;
  const login = selectGitHubLogin(owner);
  const cleanEnv = scrubbedGhEnv(baseEnv);
  const token = await run("gh", ["auth", "token", "--hostname", "github.com", "--user", login], cwd, timeoutMs, cleanEnv);
  return token ? scrubbedGhEnv(cleanEnv, token) : undefined;
}
