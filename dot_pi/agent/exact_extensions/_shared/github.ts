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
