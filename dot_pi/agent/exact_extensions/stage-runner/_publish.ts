import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import { isWorkGitHubOrg, selectGitHubLogin } from "../_shared/github.ts";
import { getProfile } from "../_shared/profile.ts";

const exec = promisify(execFile);
export type Draft = { title: string; body: string };
const fields = "number,url,headRefOid,headRefName,baseRefName,headRepository,headRepositoryOwner,isCrossRepository";
export function publisher(
  cwd: string,
  profilePath: string | undefined,
  inherited: NodeJS.ProcessEnv,
  signal: AbortSignal,
) {
  const profile = profilePath
    ? (JSON.parse(readFileSync(profilePath, "utf8")) as { profile?: unknown }).profile
    : getProfile(inherited);
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
  async function bounded(bin: string, args: string[], vars: NodeJS.ProcessEnv, readSignal?: AbortSignal) {
    const { stdout } = await exec(bin, args, {
      cwd, env: vars, timeout: 30000, signal: readSignal, killSignal: "SIGKILL", maxBuffer: 1024 * 1024,
    });
    return stdout.trim();
  }
  async function command(bin: string, args: string[], vars = env, readSignal?: AbortSignal) {
    signal.throwIfAborted();
    try {
      // Keep the lock until an in-flight mutation exits, even when the operator cancels.
      const stdout = await bounded(bin, args, vars, readSignal);
      signal.throwIfAborted();
      return stdout;
    } catch {
      throw Error(`${bin} ${args[0]} failed`);
    }
  }
  const git = (...args: string[]) => command("git", args, gitEnv);
  async function inspect() {
    const url = await git("remote", "get-url", "--push", "--all", "origin");
    const isWorkOrganization = (repo: string) => isWorkGitHubOrg(repo.split("/")[0] ?? "");
    const parse = (s: string) => {
      const match = /^(?:git@(github\.com|ddoghq\.github\.com):|ssh:\/\/git@(github\.com|ddoghq\.github\.com)(?::(22))?\/|ssh:\/\/git@(ssh\.github\.com):(443)\/)([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(s);
      if (!match) return undefined;
      const [, scpHost, sshHost, sshPort, alternateHost, alternatePort, repo] = match;
      const host = scpHost ?? sshHost ?? alternateHost;
      if (host === "ddoghq.github.com" && (profile !== "work" || !isWorkOrganization(repo))) return undefined;
      return { repo, host, port: sshPort ?? alternatePort };
    };
    const push = parse(url);
    const fetch = await git("remote", "get-url", "--all", "origin");
    if (
      !push ||
      (parse(fetch)?.repo ?? /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(fetch)?.[1]) !== push.repo ||
      push.repo.split("/").some((p) => p === "." || p === "..")
    )
      throw Error("Expected matching GitHub SSH origin and single push destination");
    const { repo, host, port } = push;
    const branch = await git("symbolic-ref", "--short", "HEAD");
    const workOrganization = isWorkOrganization(repo);
    const login =
      profile === "work"
        ? selectGitHubLogin(repo.split("/")[0] ?? "")
        : JSON.parse(await command("gh", ["auth", "status", "--json", "hosts"])).hosts["github.com"].find(
            (a: { active: boolean }) => a.active,
          )?.login;
    if (typeof login !== "string" || !/^[\w-]+$/.test(login)) throw Error("Unknown GitHub login");
    try {
      await exec(
        "ssh",
        [
          ...sshOptions,
          "-T",
          ...(port ? ["-p", port] : []),
          `git@${host}`,
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
    // deliberate: Allow only known non-branch rule types. For broader support, check each ruleset's target.
    // GitHub still enforces push rules when it receives the push.
    if (
      !Array.isArray(rules) ||
      rules.some((rule) => rule?.type !== "repository_visibility" && rule?.type !== "file_path_restriction")
    )
      throw Error("Cannot publish to protected branch");
    const remote = async (reconcile = false) => {
      const args = ["ls-remote", "--heads", "origin", "refs/heads/" + branch];
      const result = reconcile ? await bounded("git", args, gitEnv) : await git(...args);
      if (!result) return "absent";
      const [sha, ref] = result.split("\t");
      if (!/^[0-9a-f]{40}$/.test(sha) || ref !== "refs/heads/" + branch) throw Error("Unknown remote head");
      return sha;
    };
    const remoteHead = await remote();
    if (
      remoteHead !== "absent" &&
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
    return {
      target: { profile, repo, url, branch, base, login, pr: pr?.url ?? null, review: profile === "work" && workOrganization },
      gh, lookup, remote, remoteHead,
    };
  }
  async function pinBase(branch: string) {
    const ref = `refs/heads/${branch}`;
    const [base, name] = (await git("ls-remote", "--heads", "origin", ref)).split("\t");
    if (!/^[0-9a-f]{40}$/.test(base) || name !== ref) throw Error("Cannot pin remote base " + ref);
    await git("fetch", "--no-tags", "--no-recurse-submodules", "--no-write-fetch-head", "--no-auto-maintenance", "origin", base);
    return base;
  }
  return {
    inspect, pinBase,
    async pushStartup(approved: Awaited<ReturnType<typeof inspect>>["target"], captured: string, sha: string, check: () => void) {
      const { target, remote, lookup } = await inspect();
      if (JSON.stringify(target) !== JSON.stringify(approved)) throw Error("Publication target changed since confirmation");
      const before = await remote();
      if (before !== captured) throw Error(`Remote changed before push; observed ${before}`);
      if ((await git("remote", "get-url", "--push", "--all", "origin")) !== target.url)
        throw Error("Push destination changed");
      check();
      signal.throwIfAborted();
      const ref = `refs/heads/${target.branch}`;
      let rejected = false;
      try {
        await bounded("git", ["-c", "core.hooksPath=/dev/null", "-c", "remote.origin.mirror=false",
          "-c", "remote.origin.receivepack=git-receive-pack", "push", "--porcelain", "--no-follow-tags", "--recurse-submodules=no",
          `--force-with-lease=${ref}:${captured}`, "origin", `${sha}:${ref}`], gitEnv);
      } catch (error) {
        const stdout = (error as { stdout?: string }).stdout;
        rejected = stdout?.split("\n").some(line => line.startsWith(`!\t${sha}:${ref}\t[rejected] (stale info)`)) ?? false;
      }
      let observed: string;
      try { observed = await remote(true); }
      catch { return { state: "unknown", observed: "unknown" } as const; }
      if (observed !== sha) return { state: rejected ? "rejected" : "unknown", observed } as const;
      if (signal.aborted) return { state: "changed", observed, reason: "Canceled after the push" } as const;
      if (target.pr) {
        try {
          const pr = await lookup();
          if (pr?.url !== target.pr || pr.headRefOid !== sha) throw Error("PR head differs");
        } catch { return { state: "changed", observed, reason: "PR head not confirmed" } as const; }
      }
      return { state: "confirmed", observed } as const;
    },
    async publish(approved: Awaited<ReturnType<typeof inspect>>["target"], sha: string, check: () => void,
      draft: (base: string, mergeBase: string, diff: string) => Promise<Draft>,
      onDraftError: (step: string, error: unknown) => never,
    ) {
      let prUrl = approved.pr;
      let observed = "unknown";
      try {
        const confirmed = async () => {
          const current = await inspect();
          if (JSON.stringify(current.target) !== JSON.stringify(approved))
            throw Error("Publication target changed since confirmation");
          return current;
        };
        let checked = await confirmed();
        let metadata: Draft | undefined;
        if (!approved.pr) {
          let step = "verified candidate changed";
          try {
            check();
            step = "could not supply the full pinned comparison";
            const base = await pinBase(approved.base);
            const mergeBase = await git("merge-base", base, sha);
            const { stdout } = await exec("git", ["diff", "--no-ext-diff", "--no-textconv", "--binary", mergeBase, sha], {
              cwd, env: gitEnv, timeout: 10000, maxBuffer: 1024 * 1024, signal, encoding: "buffer",
            });
            const diff = new TextDecoder("utf8", { fatal: true }).decode(stdout);
            step = "verified candidate changed";
            check();
            step = "could not prepare the draft";
            metadata = await draft(base, mergeBase, diff);
            step = "verified candidate changed";
            check();
            step = "could not reconfirm the publication target after drafting";
            checked = await confirmed();
            step = "verified candidate changed";
            check();
          } catch (error) {
            onDraftError(step, error);
          }
        }
        const { target, gh, lookup, remote } = checked;
        if (!target.pr && !metadata) throw Error("Missing draft metadata");
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
          if (!metadata) throw Error("Missing draft metadata");
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
              metadata.title,
              "--body",
              metadata.body,
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
