import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { mapBounded } from "./async.ts";
import { isWorkGitHubOrg, parseGitHubOwnerRepo, parsePullRequestUrl, routedGhEnv, scrubbedGhEnv, selectGitHubLogin } from "./github.ts";

test("parseGitHubOwnerRepo parses HTTPS, SCP, and SSH GitHub remotes and rejects traversal", () => {
  assert.deepEqual(parseGitHubOwnerRepo("git@github.com:maruina/dotfiles.git"), { owner: "maruina", repo: "dotfiles" });
  assert.deepEqual(parseGitHubOwnerRepo("git@ddoghq.github.com:ddoghq/compute.git"), { owner: "ddoghq", repo: "compute" });
  assert.deepEqual(parseGitHubOwnerRepo("ssh://git@ssh.github.com:443/DataDog/dd-source.git"), { owner: "DataDog", repo: "dd-source" });
  assert.deepEqual(parseGitHubOwnerRepo("https://github.com/DataDog/dd-source"), { owner: "DataDog", repo: "dd-source" });
  assert.equal(parseGitHubOwnerRepo("https://github.com/../repo"), null);
  assert.equal(parseGitHubOwnerRepo("not-a-github-url"), null);
});

test("isWorkGitHubOrg and selectGitHubLogin route work orgs to matteo-ruina_ddog and others to maruina", () => {
  assert.equal(isWorkGitHubOrg("ddoghq"), true);
  assert.equal(isWorkGitHubOrg("DDOGHQ-SANDBOX"), true);
  assert.equal(isWorkGitHubOrg("DataDog"), false);
  assert.equal(selectGitHubLogin("ddoghq"), "matteo-ruina_ddog");
  assert.equal(selectGitHubLogin("ddoghq-sandbox"), "matteo-ruina_ddog");
  assert.equal(selectGitHubLogin("DataDog"), "maruina");
  assert.equal(selectGitHubLogin("maruina"), "maruina");
});

test("scrubbedGhEnv clears ambient tokens and sets GH_HOST and optional token", () => {
  const base = { PATH: "/usr/bin", GH_TOKEN: "old", GITHUB_TOKEN: "old2" };
  const clean = scrubbedGhEnv(base);
  assert.equal(clean.GH_TOKEN, undefined);
  assert.equal(clean.GITHUB_TOKEN, undefined);
  assert.equal(clean.GH_HOST, "github.com");
  assert.equal(clean.GH_PROMPT_DISABLED, "1");
  assert.equal(scrubbedGhEnv(base, "fresh").GH_TOKEN, "fresh");
});

test("routedGhEnv reads the work login token with a scrubbed environment", async () => {
  const baseEnv = { PATH: "/usr/bin", GH_TOKEN: "old", GITHUB_TOKEN: "old2" };
  const clean = { PATH: "/usr/bin", GH_HOST: "github.com", GH_PROMPT_DISABLED: "1" };
  let calls = 0;
  const env = await routedGhEnv("ddoghq", "work", async (...args) => {
    calls++;
    assert.deepEqual(args, ["gh", ["auth", "token", "--hostname", "github.com", "--user", "matteo-ruina_ddog"], "/repo", 3000, clean]);
    return "test-token";
  }, { cwd: "/repo", baseEnv });
  assert.equal(calls, 1);
  assert.deepEqual(env, { ...clean, GH_TOKEN: "test-token" });
});

test("routedGhEnv skips personal auth and returns no env when work auth fails", async () => {
  const opts = { cwd: "/repo", timeoutMs: 10000, baseEnv: {} };
  assert.equal(await routedGhEnv("maruina", "personal", () => assert.fail("unexpected subprocess"), opts), undefined);
  assert.equal(await routedGhEnv("maruina", "work", async (_command, args, _cwd, timeout) => {
    assert.equal(args.at(-1), "maruina");
    assert.equal(timeout, 10000);
    return null;
  }, opts), undefined);
});

test("_shared/github.ts stays in parity with exact_scripts/_github.mjs", async () => {
  const agentRoot = path.resolve(import.meta.dirname, "../..");
  const scriptsHelper = ["exact_scripts", "scripts"]
    .map((dir) => path.join(agentRoot, dir, "_github.mjs"))
    .find((file) => existsSync(file));
  assert.ok(scriptsHelper, "Expected _github.mjs helper");
  const scriptMod = await import(pathToFileURL(scriptsHelper).href);

  for (const remote of [
    "git@GITHUB.COM:DataDog/dd-source.git",
    "https://github.com/ddoghq/compute",
    "https://github.com/../repo",
    "not-a-url",
  ]) {
    assert.deepEqual(parseGitHubOwnerRepo(remote), scriptMod.parseGitHubOwnerRepo(remote), remote);
  }

  for (const pr of [
    "https://github.com/DataDog/dd-source/pull/42",
    "https://github.com/ddoghq/compute/pull/7/",
  ]) {
    assert.deepEqual(parsePullRequestUrl(pr), scriptMod.parsePullRequestUrl(pr), pr);
  }

  for (const badPr of [
    "https://github.com/../repo/pull/1",
    "https://github.com/org/../pull/1",
    "https://github.com/org/repo/pull/0",
    "http://github.com/org/repo/pull/1",
  ]) {
    assert.throws(() => parsePullRequestUrl(badPr), badPr);
    assert.throws(() => scriptMod.parsePullRequestUrl(badPr), badPr);
  }
});

test("mapBounded clamps non-positive limits to 1 and handles empty arrays", async () => {
  assert.deepEqual(await mapBounded([], 0, async (x) => x * 2), []);
  assert.deepEqual(await mapBounded([1, 2, 3], 0, async (x) => x * 2), [2, 4, 6]);
  assert.deepEqual(await mapBounded([1, 2], -5, async (x) => x + 1), [2, 3]);
});
