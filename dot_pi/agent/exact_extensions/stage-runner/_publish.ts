import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import path from "node:path";

const exec = promisify(execFile);
const fields = "number,url,headRefOid,headRefName,baseRefName,headRepository,headRepositoryOwner,isCrossRepository";
export function publisher(
  cwd: string,
  profilePath: string | undefined,
  inherited: NodeJS.ProcessEnv,
  signal: AbortSignal,
) {
  const { profile } = JSON.parse(readFileSync(profilePath ?? path.join(import.meta.dirname, "_profile.json"), "utf8"));
  if (profile !== "work" && profile !== "personal") throw Error("Unknown publication profile");
  const env = {
    ...inherited,
    GH_HOST: "github.com",
    GH_PROMPT_DISABLED: "1",
    GIT_TERMINAL_PROMPT: "0",
  } as NodeJS.ProcessEnv;
  for (const key of ["GH_TOKEN", "GITHUB_TOKEN", "GH_DEBUG", "GIT_SSH", "GIT_SSH_COMMAND"]) delete env[key];
  const sshOptions = ["-oBatchMode=yes", "-oStrictHostKeyChecking=yes"];
  const gitEnv = { ...env, GIT_SSH_COMMAND: ["ssh", ...sshOptions].join(" "), GIT_SSH_VARIANT: "ssh" };
  async function command(bin: string, args: string[], vars = env, readSignal?: AbortSignal) {
    signal.throwIfAborted();
    try {
      // Keep the lock until an in-flight mutation exits, even when the operator cancels.
      const { stdout } = await exec(bin, args, {
        cwd,
        env: vars,
        timeout: 30000,
        signal: readSignal,
        killSignal: "SIGKILL",
        maxBuffer: 1024 * 1024,
      });
      signal.throwIfAborted();
      return stdout.trim();
    } catch {
      throw Error(`${bin} ${args[0]} failed`);
    }
  }
  const git = (...args: string[]) => command("git", args, gitEnv);
  async function inspect() {
    const url = await git("remote", "get-url", "--push", "--all", "origin");
    const parse = (s: string) =>
      /^(?:git@github\.com:|ssh:\/\/git@(?:github\.com(?::22)?|ssh\.github\.com:443)\/)([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(
        s,
      )?.[1];
    const repo = parse(url);
    const fetch = await git("remote", "get-url", "--all", "origin");
    if (
      !repo ||
      (parse(fetch) ?? /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(fetch)?.[1]) !== repo ||
      repo.split("/").some((p) => p === "." || p === "..")
    )
      throw Error("Expected matching GitHub SSH origin and single push destination");
    const branch = await git("symbolic-ref", "--short", "HEAD");
    const login =
      profile === "work"
        ? /^(ddoghq|ddoghq-sandbox)\//i.test(repo)
          ? "matteo-ruina_ddog"
          : "maruina"
        : JSON.parse(await command("gh", ["auth", "status", "--json", "hosts"])).hosts["github.com"].find(
            (a: { active: boolean }) => a.active,
          )?.login;
    if (typeof login !== "string" || !/^[\w-]+$/.test(login)) throw Error("Unknown GitHub login");
    const ssh443 = url.startsWith("ssh://git@ssh.github.com:443/");
    try {
      await exec(
        "ssh",
        [
          ...sshOptions,
          "-T",
          ...(ssh443 ? ["-p", "443"] : url.startsWith("ssh://git@github.com:22/") ? ["-p", "22"] : []),
          ssh443 ? "git@ssh.github.com" : "git@github.com",
        ],
        { cwd, env, signal, timeout: 10000, maxBuffer: 8192 },
      );
      throw Error();
    } catch (error) {
      const e = error as { code?: number; stderr?: string };
      if (
        e.code !== 1 ||
        !e.stderr
          ?.trim()
          .split("\n")
          .includes(`Hi ${login}! You've successfully authenticated, but GitHub does not provide shell access.`)
      )
        throw Error("Cannot verify SSH login for " + repo);
    }
    const token = await command("gh", ["auth", "token", "--hostname", "github.com", "--user", login]);
    if (!token) throw Error("Missing GitHub API credential");
    const ghEnv = { ...env, GH_TOKEN: token };
    const gh = (...args: string[]) => command("gh", args, ghEnv);
    if (JSON.parse(await gh("api", "user")).login !== login) throw Error("Unexpected GitHub API login");
    const info = JSON.parse(await gh("api", `repos/${repo}`));
    const base = info.default_branch;
    if (info.full_name !== repo || info.fork !== false || !base || [base, "main", "master"].includes(branch))
      throw Error("Unexpected publication repository or branch");
    const rules = JSON.parse(await gh("api", `repos/${repo}/rules/branches/${encodeURIComponent(branch)}`));
    if (!Array.isArray(rules) || rules.length) throw Error("Cannot publish to protected branch");
    const remote = async () => {
      const result = await git("ls-remote", "--heads", "origin", "refs/heads/" + branch);
      if (!result) return "absent";
      const [sha, ref] = result.split("\t");
      if (!/^[0-9a-f]{40}$/.test(sha) || ref !== "refs/heads/" + branch) throw Error("Unknown remote head");
      return sha;
    };
    if (
      (await remote()) !== "absent" &&
      JSON.parse(await gh("api", `repos/${repo}/branches/${encodeURIComponent(branch)}`)).protected !== false
    )
      throw Error("Protected branch");
    const lookup = async (readSignal?: AbortSignal) => {
      const prs = JSON.parse(
        await command("gh", ["pr", "list", "--repo", repo, "--head", branch, "--state", "open", "--limit", "2",
          "--json", fields], ghEnv, readSignal),
      );
      if (!Array.isArray(prs)) throw Error("Invalid PR response");
      if (!prs.length) return undefined;
      const [pr] = prs;
      if (
        prs.length !== 1 ||
        pr.isCrossRepository !== false ||
        pr.headRepositoryOwner?.login + "/" + pr.headRepository?.name !== repo ||
        pr.headRefName !== branch ||
        pr.baseRefName !== base ||
        !Number.isSafeInteger(pr.number) ||
        pr.url !== `https://github.com/${repo}/pull/${pr.number}`
      )
        throw Error("Conflicting PR target");
      return pr;
    };
    const pr = await lookup();
    return { target: { profile, repo, url, branch, base, login, pr: pr?.url ?? null }, gh, lookup, remote };
  }
  return {
    inspect,
    async publish(approved: Awaited<ReturnType<typeof inspect>>["target"], sha: string, check: () => void) {
      let prUrl = approved.pr;
      let observed = "unknown";
      try {
        const { target, gh, lookup, remote } = await inspect();
        if (JSON.stringify(target) !== JSON.stringify(approved))
          throw Error("Publication target changed since confirmation");
        if ((await git("remote", "get-url", "--push", "--all", "origin")) !== target.url)
          throw Error("Push destination changed");
        check();
        try {
          await git(
            "-c",
            "core.hooksPath=/dev/null",
            "-c",
            "remote.origin.mirror=false",
            "-c",
            "remote.origin.receivepack=git-receive-pack",
            "push",
            "--no-follow-tags",
            "--recurse-submodules=no",
            "origin",
            `${sha}:refs/heads/${target.branch}`,
          );
        } catch {
          /* Reconcile before any further write. */
        }
        observed = await remote();
        if (observed !== sha) throw Error("Push not confirmed");
        let pr = await lookup();
        if ((pr?.url ?? null) !== approved.pr) throw Error("PR changed during publication");
        if (!pr) {
          check();
          try {
            await gh(
              "pr",
              "create",
              "--repo",
              target.repo,
              "--head",
              target.branch,
              "--base",
              target.base,
              "--draft",
              "--title",
              target.branch,
              "--body",
              `Independently verified commit: ${sha}`,
            );
          } catch {
            /* A timeout can follow successful creation. */
          }
          pr = await lookup();
        }
        prUrl = pr?.url ?? prUrl;
        observed = await remote();
        if (observed !== sha || pr?.headRefOid !== sha) throw Error("PR head not confirmed");
        const { url, number } = pr as { url: string; number: number };
        return { url, number, async checkHead(readSignal: AbortSignal) {
          const current = await lookup(readSignal);
          if (current?.url !== url || current.headRefOid !== sha)
            throw Error(`Published PR changed; observed head: ${current?.headRefOid ?? "unknown"}`);
        } };
      } catch (e) {
        throw Error(
          `Publication stopped: verified ${sha}; observed ${observed}; ${prUrl ?? approved.repo + ":" + approved.branch}; ${e}`,
        );
      }
    },
  };
}
