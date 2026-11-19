import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const checkout = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const source = existsSync(join(checkout, "dot_config/worktrunk")) ? checkout :
  resolve(dirname(execFileSync("chezmoi", ["source-path", join(homedir(), ".config/worktrunk/config.toml")], { encoding: "utf8" }).trim()), "../..");
const template = join(source, "dot_config/worktrunk/config.toml.tmpl");
const fishConfig = join(source, "dot_config/private_fish/conf.d/worktrunk.fish");

function switchWorktree(f, branch, env = f.env, create = true) {
  return f.run("wt", ["switch", ...(create ? ["--create"] : []), branch, ...(create ? ["--base", "main"] : []), "--no-cd", "--format=json", "--yes"], { env });
}

function fixture(profile) {
  const root = mkdtempSync(join(tmpdir(), "worktrunk 'fixture "));
  try {
  const home = join(root, "home 'space");
  const repo = join(root, "repo 'space");
  const agent = join(root, "agent");
  const config = join(root, "worktrunk.toml");
  mkdirSync(home); mkdirSync(repo); mkdirSync(agent);
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("WORKTRUNK_") && !key.startsWith("GIT_"))), HOME: home, XDG_CONFIG_HOME: join(home, ".config"), WORKTRUNK_CONFIG_PATH: config,
    WORKTRUNK_SYSTEM_CONFIG_PATH: join(root, "system.toml"), GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0", PI_CODING_AGENT_DIR: agent, PI_OFFLINE: "1" };
  const run = (command, args, options = {}) => spawnSync(command, args, { cwd: repo, env, encoding: "utf8", timeout: 30_000, ...options });
  const git = (...args) => {
    const r = run("git", args);
    assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
    return r.stdout.trim();
  };
  git("init", "-q", "-b", "main");
  git("config", "user.name", "fixture"); git("config", "user.email", "fixture@example.invalid"); git("config", "commit.gpgsign", "false");
  writeFileSync(join(repo, "tracked"), "baseline\n"); git("add", "tracked"); git("commit", "-qm", "baseline");
  const base = git("rev-parse", "HEAD");
  const rendered = run("chezmoi", ["--source", source, "--override-data", JSON.stringify({ profile }), "execute-template", "--file", template]);
  assert.equal(rendered.status, 0, rendered.stderr);
  writeFileSync(config, rendered.stdout);
  const worktrees = join(home, profile === "work" ? "dd" : "src", ".worktrees");
  return { root, home, repo, agent, config, env, run, git, base, worktrees };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

for (const profile of ["work", "personal"]) for (const shell of ["bash", "fish"]) {
  test(`${profile}: ${shell} creates the configured worktree and guidance link`, () => {
    const f = fixture(profile);
    try {
      const remote = join(f.root, "remote.git");
      const peer = join(f.root, "peer");
      f.git("clone", "--bare", ".", remote);
      f.git("remote", "add", "origin", remote);
      f.git("clone", remote, peer);
      f.git("-C", peer, "config", "user.name", "fixture");
      f.git("-C", peer, "config", "user.email", "fixture@example.invalid");
      f.git("-C", peer, "config", "commit.gpgsign", "false");
      writeFileSync(join(peer, "remote-commit"), "fetched\n");
      f.git("-C", peer, "add", "remote-commit");
      f.git("-C", peer, "commit", "-qm", "remote advance");
      f.git("-C", peer, "push", "origin", "main");
      f.git("fetch", "origin", "main");
      const fetched = f.git("rev-parse", "origin/main");
      assert.notEqual(fetched, f.base);
      writeFileSync(join(f.repo, "AGENTS.local.md"), "fixture guidance\n");
      const branch = "Feature/Example/Nested";
      const refsBefore = f.git("show-ref");
      const registrationsBefore = f.git("worktree", "list", "--porcelain");
      const expected = join(f.worktrees, "repo 'space", "feature-example-nested");
      let result;
      if (shell === "bash") {
        result = f.run("bash", ["-c", 'exec wt "$@"', "fixture", "switch", "--create", branch, "--base", "origin/main", "--no-cd", "--format=json", "--yes"]);
      } else {
        result = f.run("fish", ["--no-config", "-c", 'source "$FIXTURE_FISH"; git-wt $argv', "switch", "--create", branch, "--base", "origin/main", "--no-cd", "--format=json", "--yes"], { env: { ...f.env, WORKTREES_ROOT: f.worktrees, FIXTURE_FISH: fishConfig } });
      }
      assert.equal(result.status, 0, result.stderr);
      const output = JSON.parse(result.stdout);
      assert.equal(output.action, "created");
      assert.equal(output.branch, branch);
      assert.equal(realpathSync(output.path), realpathSync(expected));
      assert.equal(f.git("-C", expected, "rev-parse", "HEAD"), fetched);
      assert.equal(f.git("-C", expected, "branch", "--show-current"), branch);
      const refsAfter = f.git("show-ref");
      const registrationsAfter = f.git("worktree", "list", "--porcelain");
      assert.ok(refsBefore.split("\n").every((line) => refsAfter.split("\n").includes(line)));
      assert.ok(refsAfter.includes(`${fetched} refs/heads/${branch}`));
      assert.ok(registrationsAfter.startsWith(registrationsBefore));
      assert.ok(registrationsAfter.includes(expected));
      assert.equal(lstatSync(join(expected, "AGENTS.local.md")).isSymbolicLink(), true);
      assert.equal(realpathSync(join(expected, "AGENTS.local.md")), realpathSync(join(f.repo, "AGENTS.local.md")));
      assert.equal(readFileSync(join(expected, "AGENTS.local.md"), "utf8"), "fixture guidance\n");
      if (profile === "work" && shell === "bash") {
        const worktreeStatus = f.git("-C", expected, "status", "--porcelain");
        const primaryStatus = f.git("status", "--porcelain");
        const extension = join(f.root, "check-guidance.ts");
        const proof = join(f.root, "pi-saw-guidance");
        writeFileSync(extension, `import { readFileSync, writeFileSync } from "node:fs";\nimport { join } from "node:path";\nexport default function(pi) { pi.on("session_start", (_event, ctx) => { writeFileSync(${JSON.stringify(proof)}, readFileSync(join(ctx.cwd, "AGENTS.local.md"), "utf8")); }); }\n`);
        const pi = f.run("pi", ["--mode", "rpc", "--no-session", "--no-context-files", "--no-extensions", "-e", extension], { cwd: expected, input: '{"id":"check","type":"get_state"}\n' });
        assert.equal(pi.status, 0, pi.stderr);
        assert.ok(pi.stdout.split("\n").filter(Boolean).map(JSON.parse).some((event) => event.id === "check" && event.success));
        assert.equal(readFileSync(proof, "utf8"), "fixture guidance\n");
        assert.equal(f.git("show-ref"), refsAfter);
        assert.equal(f.git("worktree", "list", "--porcelain"), registrationsAfter);
        assert.equal(f.git("-C", expected, "rev-parse", "HEAD"), fetched);
        assert.equal(f.git("-C", expected, "status", "--porcelain"), worktreeStatus);
        assert.equal(f.git("status", "--porcelain"), primaryStatus);
      }
      assert.equal(f.git("rev-parse", "HEAD"), f.base);
      assert.equal(f.git("branch", "--show-current"), "main");
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
}

for (const profile of ["work", "personal"]) {
  test(`${profile}: collisions and dirty reuse preserve existing worktrees and refs`, () => {
    const f = fixture(profile);
    try {
      const first = switchWorktree(f, "Feature/Test");
      assert.equal(first.status, 0, first.stderr);
      const path = join(f.worktrees, "repo 'space", "feature-test");
      writeFileSync(join(path, "tracked"), "dirty data\n");
      const refs = f.git("show-ref");
      const registrations = f.git("worktree", "list", "--porcelain");
      const collision = switchWorktree(f, "feature-test");
      assert.notEqual(collision.status, 0);
      assert.equal(f.git("show-ref"), refs);
      assert.equal(f.git("worktree", "list", "--porcelain"), registrations);
      assert.equal(readFileSync(join(path, "tracked"), "utf8"), "dirty data\n");
      const reuse = switchWorktree(f, "Feature/Test", f.env, false);
      assert.equal(reuse.status, 0, reuse.stderr);
      assert.equal(readFileSync(join(path, "tracked"), "utf8"), "dirty data\n");
      assert.equal(f.git("show-ref"), refs);
      assert.equal(f.git("worktree", "list", "--porcelain"), registrations);
      assert.equal(f.git("rev-parse", "HEAD"), f.base);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });

  for (const target of ["absent", "tracked", "valid-symlink", "dangling-symlink"]) {
    test(`${profile}: ${target} guidance is preserved`, () => {
      const f = fixture(profile);
      try {
        const guidance = join(f.repo, "AGENTS.local.md");
        if (target === "tracked") writeFileSync(guidance, "tracked guidance\n");
        if (target === "valid-symlink") symlinkSync("tracked", guidance);
        if (target === "dangling-symlink") symlinkSync("missing-target", guidance);
        if (target !== "absent") { f.git("add", "-f", "AGENTS.local.md"); f.git("commit", "-qm", "guidance fixture"); }
        const result = switchWorktree(f, "test/guidance");
        assert.equal(result.status, 0, result.stderr);
        const dest = join(f.worktrees, "repo 'space", "test-guidance", "AGENTS.local.md");
        if (target === "absent") assert.throws(() => lstatSync(dest), { code: "ENOENT" });
        else if (target === "tracked") { assert.equal(lstatSync(dest).isFile(), true); assert.equal(readFileSync(dest, "utf8"), "tracked guidance\n"); }
        else assert.equal(readlinkSync(dest), target === "valid-symlink" ? "tracked" : "missing-target");
      } finally { rmSync(f.root, { recursive: true, force: true }); }
    });
  }

  test(`${profile}: direct Worktrunk honors its override but not WORKTREES_ROOT`, () => {
    const f = fixture(profile);
    try {
      const unrelated = join(f.root, "different root");
      const bare = switchWorktree(f, "override/bare", { ...f.env, WORKTREES_ROOT: unrelated });
      assert.equal(bare.status, 0, bare.stderr);
      assert.equal(existsSync(join(f.worktrees, "repo 'space", "override-bare")), true);
      assert.equal(existsSync(unrelated), false);
      const pattern = `${unrelated}/{{ repo }}/{{ branch | replace('/', '-') | lower }}`;
      const explicit = switchWorktree(f, "override/explicit", { ...f.env, WORKTRUNK_WORKTREE_PATH: pattern });
      assert.equal(explicit.status, 0, explicit.stderr);
      assert.equal(existsSync(join(unrelated, "repo 'space", "override-explicit")), true);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
}
