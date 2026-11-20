import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('./disk-cleanup.mjs', import.meta.url));
function fixture(t) {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'disk-scan-')); t.after(() => rmSync(temp, { recursive: true, force: true }));
  const home = path.join(temp, 'home'), bin = path.join(temp, 'bin'), repo = path.join(temp, 'repo'), worktrees = path.join(temp, 'worktrees'), ghLog = path.join(temp, 'gh-called');
  for (const p of [home, bin, repo, worktrees, path.join(home, 'Library/Caches/cache'), path.join(home, '.Trash')]) mkdirSync(p, { recursive: true });
  writeFileSync(path.join(home, 'crash.hprof'), 'dump');
  const git = (...args) => execFileSync('git', ['-C', repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.test', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q', '-b', 'main'); writeFileSync(path.join(repo, 'file'), 'base'); git('add', 'file'); git('commit', '-qm', 'base');
  git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'HEAD')); git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  const make = (name, branch = `maruina/${name}`) => { const dir = path.join(worktrees, 'repo', name); mkdirSync(path.dirname(dir), { recursive: true }); git('worktree', 'add', '-qb', branch, dir); return dir; };
  const dirs = Object.fromEntries(['integrated', 'dirty', 'active', 'locked'].map(name => [name, make(name)]));
  const foreign = make('foreign', 'someone/foreign');
  writeFileSync(path.join(dirs.dirty, 'dirty'), 'change'); git('worktree', 'lock', dirs.locked);
  writeFileSync(path.join(dirs.active, 'new-content'), 'not integrated');
  execFileSync('git', ['-C', dirs.active, 'add', 'new-content']);
  execFileSync('git', ['-C', dirs.active, '-c', 'user.name=Test', '-c', 'user.email=test@example.test', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'advance']);
  git('branch', 'maruina/branch-only'); const orphan = path.join(worktrees, 'repo', 'orphan'); mkdirSync(orphan);
  const program = (name, script) => { const p = path.join(bin, name); writeFileSync(p, script); chmodSync(p, 0o755); };
  program('gh', '#!/bin/sh\nprintf called > "$GH_LOG"\nexit 1\n');
  program('df', '#!/bin/sh\nprintf "Filesystem 1024-blocks Used Available Capacity Mounted on\\n/dev/test 1000 500 500 50%% /\\n"\n');
  program('du', '#!/bin/sh\nfor p in "$@"; do case "$p" in -*) ;; *) printf "42\\t%s\\n" "$p";; esac; done\n');
  program('docker', '#!/bin/sh\nif [ -n "$DOCKER_STOPPED" ]; then exit 1; fi\necho docker-sizes\n');
  program('pgrep', '#!/bin/sh\nif [ -n "$BAZEL_RUNNING" ]; then echo "42 bzl test"; exit 0; fi\nexit 1\n');
  const run = (args, extra = {}) => { const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GH_LOG: ghLog, ...extra }, timeout: 60000 }); return { ...result, data: result.stdout ? JSON.parse(result.stdout) : null }; };
  return { temp, home, bin, repo, worktrees, dirs, foreign, orphan, ghLog, git, run, program };
}

test('measure reports bounded consumers, Docker state, active bazel, dumps and trash', t => {
  const f = fixture(t);
  let r = f.run(['measure', '--home', f.home], { BAZEL_RUNNING: '1' });
  assert.equal(r.status, 0, r.stderr); assert.equal(r.data.schemaVersion, 1); assert.equal(r.data.dockerDf.available, true); assert.equal(r.data.bazelRunning, true);
  assert.ok(r.data.consumers.some(item => item.path.endsWith('/.Trash'))); assert.ok(r.data.crashDumps.some(item => item.path.endsWith('/crash.hprof'))); assert.ok(r.data.caches.some(item => item.path.endsWith('/Library/Caches/cache')));
  r = f.run(['measure', '--home', f.home], { DOCKER_STOPPED: '1' }); assert.equal(r.data.dockerDf.available, false); assert.equal(r.data.bazelRunning, false);
});

function gitFiles(dir, prefix = '') {
  const result = [];
  for (const entry of readdirSync(path.join(dir, prefix), { withFileTypes: true })) {
    const rel = path.join(prefix, entry.name);
    if (rel === 'wt/cache') continue;
    if (entry.isDirectory()) result.push(...gitFiles(dir, rel));
    else if (entry.isFile()) result.push([rel, createHash('sha256').update(readFileSync(path.join(dir, rel))).digest('hex')]);
  }
  return result.sort((a, b) => a[0].localeCompare(b[0]));
}

test('Worktrunk preview reports candidates and preserves worktrees, refs and dirty files', t => {
  const f = fixture(t); const beforeTrees = f.git('worktree', 'list', '--porcelain'); const beforeRefs = f.git('show-ref');
  const beforeGitFiles = gitFiles(path.join(f.repo, '.git'));
  const r = f.run(['scan-worktrees', '--repo', f.repo, '--worktrees-root', f.worktrees, '--min-age', '0s']);
  assert.equal(r.status, 0, r.stderr); assert.deepEqual(r.data.errors, []);
  const items = r.data.worktrees; const get = name => items.find(item => item.path === realpathSync(f.dirs[name]));
  assert.equal(get('integrated').classification, 'integrated_preview'); assert.equal(get('dirty').classification, 'dirty'); assert.equal(get('locked').classification, 'flagged'); assert.equal(get('active').classification, 'not_previewed');
  assert.ok(items.some(item => item.branch === 'someone/foreign' && item.classification === 'flagged'));
  assert.ok(items.some(item => item.path === realpathSync(f.orphan) && item.classification === 'orphaned'));
  assert.ok(r.data.branchCandidates.some(item => item.branch === 'maruina/branch-only'));
  assert.equal(f.git('worktree', 'list', '--porcelain'), beforeTrees); assert.equal(f.git('show-ref'), beforeRefs);
  assert.deepEqual(gitFiles(path.join(f.repo, '.git')), beforeGitFiles);
  assert.equal(readFileSync(path.join(f.dirs.dirty, 'dirty'), 'utf8'), 'change'); assert.equal(existsSync(f.ghLog), false);
});

test('Worktrunk preview recognizes a squash-integrated branch after the default branch advances', t => {
  const f = fixture(t);
  f.git('merge', '--squash', 'maruina/active'); f.git('commit', '-qm', 'squash');
  writeFileSync(path.join(f.repo, 'unrelated'), 'later'); f.git('add', 'unrelated'); f.git('commit', '-qm', 'later change');
  const refs = f.git('show-ref');
  const r = f.run(['scan-worktrees', '--repo', f.repo, '--worktrees-root', f.worktrees, '--min-age', '0s']);
  assert.equal(r.status, 0, r.stderr);
  const item = r.data.worktrees.find(entry => entry.path === realpathSync(f.dirs.active));
  assert.equal(item.classification, 'integrated_preview'); assert.ok(item.preview.reason); assert.equal(f.git('show-ref'), refs);
  assert.equal(existsSync(f.ghLog), false);
});

test('missing default branch evidence fails closed without changing Git config', t => {
  const f = fixture(t); f.git('symbolic-ref', '--delete', 'refs/remotes/origin/HEAD');
  const before = readFileSync(path.join(f.repo, '.git/config'), 'utf8');
  const r = f.run(['scan-worktrees', '--repo', f.repo, '--worktrees-root', f.worktrees]);
  assert.equal(r.status, 0); assert.ok(r.data.errors.some(error => error.reason === 'default_branch_unavailable'));
  assert.equal(readFileSync(path.join(f.repo, '.git/config'), 'utf8'), before);
});

test('a configured Worktrunk default branch works without origin/HEAD', t => {
  const f = fixture(t); f.git('symbolic-ref', '--delete', 'refs/remotes/origin/HEAD'); f.git('config', 'worktrunk.default-branch', 'main');
  const before = readFileSync(path.join(f.repo, '.git/config'), 'utf8');
  const r = f.run(['scan-worktrees', '--repo', f.repo, '--worktrees-root', f.worktrees, '--min-age', '0s']);
  assert.equal(r.status, 0, r.stderr); assert.deepEqual(r.data.errors, []);
  assert.equal(readFileSync(path.join(f.repo, '.git/config'), 'utf8'), before);
});

test('unavailable Worktrunk evidence fails closed and never calls gh', t => {
  const f = fixture(t); f.program('wt', '#!/bin/sh\nexit 1\n');
  const r = f.run(['scan-worktrees', '--repo', f.repo, '--worktrees-root', f.worktrees]);
  assert.equal(r.status, 0, r.stderr); assert.ok(r.data.errors.length); assert.ok(r.data.worktrees.every(item => item.classification !== 'integrated_preview' && item.classification !== 'orphaned'));
  assert.equal(existsSync(f.ghLog), false); assert.equal(existsSync(f.orphan), true);
});
