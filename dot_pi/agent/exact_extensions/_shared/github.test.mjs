import assert from "node:assert/strict";
import test from "node:test";
import { isWorkGitHubOrg, parseGitHubOwnerRepo, scrubbedGhEnv, selectGitHubLogin } from "./github.ts";

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
