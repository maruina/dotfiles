import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("./sync-vendored-skills.mjs", import.meta.url));
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "vendor-sync-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const upstream = path.join(root, "upstream");
  const bare = path.join(root, "remote.git");
  const repos = path.join(root, "repos");
  const clone = path.join(repos, "example", "skills");
  const source = path.join(root, "source");
  const skills = path.join(source, "dot_pi/agent/exact_skills");
  mkdirSync(upstream, { recursive: true });
  mkdirSync(skills, { recursive: true });
  git(upstream, "init", "-q", "-b", "main");
  git(upstream, "config", "user.name", "Test");
  git(upstream, "config", "user.email", "test@example.test");
  git(upstream, "config", "commit.gpgsign", "false");
  const put = (relative, text) => { const file = path.join(upstream, relative); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, text); };
  put("skills/full/SKILL.md", "old\n");
  put("skills/full/stale.md", "stale\n");
  put("skills/partial/SKILL.md", "partial old\n");
  put("skills/partial/LICENSE", "license old\n");
  git(upstream, "add", ".");
  git(upstream, "commit", "-qm", "old");
  const old = git(upstream, "rev-parse", "HEAD");
  git(root, "clone", "-q", "--bare", upstream, bare);
  mkdirSync(path.dirname(clone), { recursive: true });
  git(root, "clone", "-q", bare, clone);
  git(clone, "remote", "set-url", "origin", "https://github.com/example/skills");
  const vendor = (name, subpath, extra = "") => {
    const dir = path.join(skills, `exact_${name}`); mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "VENDOR.md"), `# Vendored skill\n\n- Upstream: https://github.com/example/skills\n- Path: \`${subpath}\`\n${extra}- Pinned commit: \`${old}\`\n`);
    return dir;
  };
  const full = vendor("full", "skills/full");
  const partial = vendor("partial", "skills/partial", "- Files: `SKILL.md`, `LICENSE`\n");
  const hand = path.join(skills, "hand"); mkdirSync(hand); writeFileSync(path.join(hand, "SKILL.md"), "hand maintained\n");
  writeFileSync(path.join(full, "SKILL.md"), "old\n");
  writeFileSync(path.join(full, "stale.md"), "stale\n");
  writeFileSync(path.join(partial, "SKILL.md"), "partial old\n");
  writeFileSync(path.join(partial, "LICENSE"), "license old\n");
  writeFileSync(path.join(partial, "keep.md"), "local\n");
  put("skills/full/SKILL.md", "new  \n");
  put("skills/full/nested/ref.md", "reference\r\nwith trailing space  \r\n");
  put("skills/full/nested/bytes.bin", Buffer.from([0, 255, 32, 10, 9]));
  rmSync(path.join(upstream, "skills/full/stale.md"));
  put("skills/partial/SKILL.md", "partial new\n");
  put("skills/partial/LICENSE", "license new\n");
  chmodSync(path.join(upstream, "skills/partial/LICENSE"), 0o755);
  put("skills/partial/not-selected.md", "ignored\n");
  git(upstream, "add", "-A"); git(upstream, "commit", "-qm", "new");
  const next = git(upstream, "rev-parse", "HEAD");
  git(upstream, "push", "-q", bare, "main");
  const run = (...args) => spawnSync(process.execPath, [cli, "--source", source, ...args], { encoding: "utf8", env: { ...process.env, GO_REPOS_ROOT: repos, GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: `url.${bare}.insteadOf`, GIT_CONFIG_VALUE_0: "https://github.com/example/skills" }, timeout: 15000 });
  return { root, upstream, clone, source, full, partial, hand, old, next, run, vendor };
}

test("help explains non-interactive use", () => {
  const result = spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--source/);
  assert.match(result.stdout, /--dry-run/);
});

test("sync reads the fetched commit, preserves local files for subsets, and skips matching pins", (t) => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.schemaVersion, 1);
  assert.equal(git(f.clone, "rev-parse", "HEAD"), f.old);
  assert.deepEqual(readFileSync(path.join(f.full, "SKILL.md")), readFileSync(path.join(f.upstream, "skills/full/SKILL.md")));
  assert.deepEqual(readFileSync(path.join(f.full, "exact_nested/ref.md")), readFileSync(path.join(f.upstream, "skills/full/nested/ref.md")));
  assert.deepEqual(readFileSync(path.join(f.full, "exact_nested/bytes.bin")), readFileSync(path.join(f.upstream, "skills/full/nested/bytes.bin")));
  assert.equal(existsSync(path.join(f.full, "stale.md")), false);
  assert.equal(readFileSync(path.join(f.partial, "SKILL.md"), "utf8"), "partial new\n");
  assert.equal(readFileSync(path.join(f.partial, "executable_LICENSE"), "utf8"), "license new\n");
  assert.equal(existsSync(path.join(f.partial, "LICENSE")), false);
  assert.equal(readFileSync(path.join(f.partial, "keep.md"), "utf8"), "local\n");
  assert.equal(existsSync(path.join(f.partial, "not-selected.md")), false);
  assert.match(readFileSync(path.join(f.full, "VENDOR.md"), "utf8"), new RegExp(f.next));
  assert.match(readFileSync(path.join(f.partial, "VENDOR.md"), "utf8"), new RegExp(f.next));
  assert.equal(readFileSync(path.join(f.hand, "SKILL.md"), "utf8"), "hand maintained\n");
  const before = statSync(path.join(f.full, "SKILL.md")).mtimeMs;
  const again = f.run(); assert.equal(again.status, 0, again.stderr);
  assert.ok(JSON.parse(again.stdout).skills.every(item => item.status === "up_to_date"));
  assert.equal(statSync(path.join(f.full, "SKILL.md")).mtimeMs, before);
});

test("matching pins detect and repair content, mode and stale-file drift", (t) => {
  const f = fixture(t);
  assert.equal(f.run().status, 0);
  const skill = path.join(f.full, "SKILL.md");
  writeFileSync(skill, "new\n");
  chmodSync(path.join(f.partial, "executable_LICENSE"), 0o644);
  writeFileSync(path.join(f.full, "stale.md"), "stale\n");
  const preview = f.run("--dry-run"); assert.equal(preview.status, 0, preview.stderr);
  assert.ok(JSON.parse(preview.stdout).skills.every(item => item.status === "would_update"));
  assert.equal(readFileSync(skill, "utf8"), "new\n");
  const result = f.run(); assert.equal(result.status, 0, result.stderr);
  assert.ok(JSON.parse(result.stdout).skills.every(item => item.status === "updated"));
  assert.deepEqual(readFileSync(skill), readFileSync(path.join(f.upstream, "skills/full/SKILL.md")));
  assert.equal(statSync(path.join(f.partial, "executable_LICENSE")).mode & 0o111, 0o111);
  assert.equal(existsSync(path.join(f.full, "stale.md")), false);
  assert.equal(readFileSync(path.join(f.partial, "keep.md"), "utf8"), "local\n");
});

test("dry-run previews without writes and filters skill names", (t) => {
  const f = fixture(t);
  const before = readFileSync(path.join(f.full, "VENDOR.md"), "utf8");
  const result = f.run("--dry-run", "full");
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).skills.map(item => item.name), ["full"]);
  assert.equal(readFileSync(path.join(f.full, "VENDOR.md"), "utf8"), before);
  assert.equal(readFileSync(path.join(f.full, "SKILL.md"), "utf8"), "old\n");
});

test("unknown and hand-maintained filters fail before writes", (t) => {
  const f = fixture(t);
  for (const name of ["unknown", "hand"]) {
    const result = f.run("full", name);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, new RegExp(name));
    assert.match(readFileSync(path.join(f.full, "VENDOR.md"), "utf8"), new RegExp(f.old));
  }
});

test("exact skill and nested directories remove stale installed files", (t) => {
  const f = fixture(t);
  const result = f.run("full");
  assert.equal(result.status, 0, result.stderr);
  const home = path.join(f.root, "home");
  const target = path.join(home, ".pi/agent/skills/full");
  mkdirSync(path.join(target, "nested"), { recursive: true });
  writeFileSync(path.join(target, "stale.md"), "stale\n");
  writeFileSync(path.join(target, "nested/stale.md"), "stale\n");
  const applied = spawnSync("chezmoi", ["--source", f.source, "--destination", home, "apply", target], { encoding: "utf8", timeout: 15000 });
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(existsSync(path.join(target, "stale.md")), false);
  assert.equal(existsSync(path.join(target, "nested/stale.md")), false);
  assert.deepEqual(readFileSync(path.join(target, "nested/ref.md")), readFileSync(path.join(f.upstream, "skills/full/nested/ref.md")));
});

test("an existing clone with a different origin fails without changing the skill", (t) => {
  const f = fixture(t);
  git(f.clone, "remote", "set-url", "origin", "https://github.com/other/skills");
  const result = f.run("full");
  assert.notEqual(result.status, 0);
  assert.equal(JSON.parse(result.stdout).error.code, "origin_mismatch");
  assert.match(readFileSync(path.join(f.full, "VENDOR.md"), "utf8"), new RegExp(f.old));
});

test("an existing clone with multiple origin URLs fails closed", (t) => {
  const f = fixture(t);
  git(f.clone, "remote", "set-url", "origin", path.join(f.root, "wrong.git"));
  git(f.clone, "config", "--add", "remote.origin.url", "https://github.com/example/skills");
  const result = f.run("full");
  assert.notEqual(result.status, 0);
  assert.equal(JSON.parse(result.stdout).error.code, "origin_mismatch");
  assert.match(readFileSync(path.join(f.full, "VENDOR.md"), "utf8"), new RegExp(f.old));
});

test("invalid upstream or escaped destination fails without advancing pins", (t) => {
  const f = fixture(t);
  const invalid = f.vendor("invalid", "skills/missing");
  let result = f.run("full", "invalid");
  assert.notEqual(result.status, 0);
  assert.equal(JSON.parse(result.stdout).error.code, "missing_upstream");
  assert.match(readFileSync(path.join(invalid, "VENDOR.md"), "utf8"), new RegExp(f.old));
  assert.match(readFileSync(path.join(f.full, "VENDOR.md"), "utf8"), new RegExp(f.old));
  assert.equal(readFileSync(path.join(f.full, "SKILL.md"), "utf8"), "old\n");
  rmSync(path.join(f.partial, "SKILL.md"));
  symlinkSync(path.join(f.root, "outside"), path.join(f.partial, "SKILL.md"));
  result = f.run("partial");
  assert.notEqual(result.status, 0);
  assert.match(readFileSync(path.join(f.partial, "VENDOR.md"), "utf8"), new RegExp(f.old));
  assert.equal(existsSync(path.join(f.root, "outside")), false);
});
