import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('./lifecycle-git.mjs', import.meta.url));
function fixture(t) {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'lifecycle-git-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, 'repo'); mkdirSync(repo);
  const git = (...args) => execFileSync('git', ['-C', repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.test', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q', '-b', 'main');
  const put = (name, content) => { const p = path.join(repo, name); mkdirSync(path.dirname(p), { recursive: true }); writeFileSync(p, content); };
  const commit = message => { git('add', '-A'); git('commit', '-qm', message); };
  const run = (...args) => { const result = spawnSync(process.execPath, [cli, ...args], { cwd: repo, encoding: 'utf8', timeout: 15000 }); return { ...result, data: result.stdout ? JSON.parse(result.stdout) : null }; };
  put('design.md', '# Design\n\nStatus: Draft\n\n## Body\nContent\n'); commit('draft');
  return { temp, repo, git, put, commit, run };
}

test('discover-plan returns none when no plan or design is present in a plans directory', t => {
  const f = fixture(t);
  let r = f.run('discover-plan'); assert.equal(r.status, 0); assert.equal(r.data.status, 'none');
  f.put('pkg/plans/topic/design.md', '# Design fallback\n');
  r = f.run('discover-plan'); assert.equal(r.status, 0); assert.equal(r.data.status, 'unique'); assert.equal(r.data.designs.length, 1);
});

test('resolve and discover plans across worktrees without silently choosing ambiguity', t => {
  const f = fixture(t);
  f.put('plans/feature/plan.md', '# Main plan\n'); f.commit('plan');
  const second = path.join(f.temp, 'second'); f.git('worktree', 'add', '-qb', 'maruina/feature', second);
  mkdirSync(path.join(second, 'pkg/plans/feature'), { recursive: true }); writeFileSync(path.join(second, 'pkg/plans/feature/plan.md'), '# Nested plan\n');
  let r = f.run('resolve', '--glob', '**/plans/*/plan.md'); assert.equal(r.status, 0, r.stderr); assert.equal(r.data.candidates.length, 3);
  r = f.run('resolve', '--path', 'plans/feature/plan.md'); assert.equal(r.status, 0); assert.equal(r.data.candidates.length, 1);
  r = f.run('discover-plan', '--branch', 'maruina/feature'); assert.equal(r.status, 0); assert.equal(r.data.status, 'ambiguous');
});

test('discover-plan supports branch slugs containing slashes', t => {
  const f = fixture(t);
  f.put('plans/feature/sub/plan.md', '# Nested slug\n');
  const r = f.run('discover-plan', '--branch', 'maruina/feature/sub');
  assert.equal(r.status, 0); assert.equal(r.data.matching.length, 1);
  assert.ok(r.data.matching[0].path.endsWith('/plans/feature/sub/plan.md'));
});

test('glob orders recent files first and prefers the current worktree within a second', t => {
  const f = fixture(t);
  f.put('plans/a/plan.md', '# Current\n'); f.commit('plan');
  const second = path.join(f.temp, 'second'); f.git('worktree', 'add', '-qb', 'other', second);
  const current = path.join(f.repo, 'plans/a/plan.md'); const other = path.join(second, 'plans/a/plan.md');
  utimesSync(current, 1700000000.1, 1700000000.1); utimesSync(other, 1700000000.9, 1700000000.9);
  let r = f.run('resolve', '--glob', '**/plans/*/plan.md'); assert.equal(r.status, 0); assert.equal(r.data.candidates[0].root, realpathSync(f.repo));
  utimesSync(other, 1700000003, 1700000003);
  r = f.run('resolve', '--glob', '**/plans/*/plan.md'); assert.equal(r.data.candidates[0].path.endsWith('/second/plans/a/plan.md'), true);
});

test('snapshot compares branch, commits, tracked diffs and untracked content', t => {
  const f = fixture(t); const base = f.git('rev-parse', 'HEAD');
  f.put('tracked', 'one'); f.commit('candidate');
  f.put('tracked', 'staged'); f.git('add', 'tracked'); f.put('tracked', 'unstaged'); f.put('untracked', 'one');
  let r = f.run('snapshot', '--base', base); assert.equal(r.status, 0, r.stderr);
  const first = path.join(f.temp, 'first.json'); writeFileSync(first, r.stdout);
  r = f.run('compare-snapshots', first, first); assert.equal(r.status, 0); assert.equal(r.data.match, true);
  f.put('untracked', 'two'); f.put('tracked', 'different unstaged'); r = f.run('snapshot', '--base', base); const second = path.join(f.temp, 'second.json'); writeFileSync(second, r.stdout);
  r = f.run('compare-snapshots', first, second); assert.equal(r.status, 1); assert.ok(r.data.deltas.includes('untrackedFiles')); assert.ok(r.data.deltas.includes('unstagedDiffHash'));
  f.git('add', 'tracked'); r = f.run('snapshot', '--base', base); const third = path.join(f.temp, 'third.json'); writeFileSync(third, r.stdout);
  r = f.run('compare-snapshots', second, third); assert.equal(r.status, 1); assert.ok(r.data.deltas.includes('stagedDiffHash'));
  f.git('commit', '-qm', 'another candidate'); f.git('checkout', '-qb', 'new-branch');
  r = f.run('snapshot', '--base', base); const fourth = path.join(f.temp, 'fourth.json'); writeFileSync(fourth, r.stdout);
  r = f.run('compare-snapshots', third, fourth); assert.equal(r.status, 1); assert.ok(r.data.deltas.includes('head')); assert.ok(r.data.deltas.includes('branch')); assert.ok(r.data.deltas.includes('candidateCommits'));
});

test('lint-plan validates task headings, Blocked by syntax, checkboxes, and relative paths', t => {
  const f = fixture(t);
  f.put('plans/ok/plan.md', [
    '# Ok Plan',
    '### Slice 1: First slice',
    '### Task 1: Do thing',
    '**Blocked by:** None',
    '**Files:** src/a.ts',
    '- [ ] Step one',
    '### Task 2: Next thing',
    '**Blocked by:** Task 1',
    '- [ ] Step two',
    '## Post-publication validation',
    '- Check metric after deploy',
  ].join('\n'));
  let r = f.run('lint-plan', 'plans/ok/plan.md');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.data.ok, true);
  assert.equal(r.data.tasks.length, 2);
  assert.equal(r.data.slices.length, 1);

  f.put('plans/bad/plan.md', [
    '# Bad Plan',
    '- [ ] Loose checkbox',
    '### Task 1: First',
    '**Blocked by:** Task 1 (note)',
    '**Files:** /abs/path.ts',
    '## Post-publication validation',
    '- [ ] Post-pub checkbox',
  ].join('\n'));
  r = f.run('lint-plan', 'plans/bad/plan.md');
  assert.equal(r.status, 1);
  assert.equal(r.data.ok, false);
  assert.equal(r.data.errors.length, 4);
});

test('preflight-design checks clean Git status and Status: Approved at HEAD', t => {
  const f = fixture(t);
  f.put('plans/demo/design.md', '# Demo\nStatus: Draft\n');
  f.commit('draft');
  let r = f.run('preflight-design', 'plans/demo/design.md');
  assert.equal(r.status, 1);
  assert.equal(r.data.clean, true);
  assert.equal(r.data.approved, false);

  f.put('plans/demo/design.md', '# Demo\nStatus: Approved\n');
  r = f.run('preflight-design', 'plans/demo/design.md');
  assert.equal(r.status, 1);
  assert.equal(r.data.clean, false);

  f.commit('approve');
  r = f.run('preflight-design', 'plans/demo/design.md');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.data.ok, true);
});

test('next-slice reports grouped slice progress and committed state', t => {
  const f = fixture(t);
  f.put('plans/demo/plan.md', [
    '# Demo',
    '### Slice 1: One',
    '### Task 1: Done',
    '- [x] done',
    '### Slice 2: Two',
    '### Task 2: Todo',
    '- [ ] todo',
  ].join('\n'));
  f.commit('plan');
  const r = f.run('next-slice', 'plans/demo/plan.md');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.data.committed, true);
  assert.equal(r.data.grouped, true);
  assert.deepEqual(r.data.nextSlice, { number: 2, title: 'Two' });
  assert.equal(r.data.remainingCount, 1);
});

test('resolve-base routes gh auth token by origin owner', t => {
  const f = fixture(t);
  f.git('remote', 'add', 'origin', 'git@ddoghq.github.com:ddoghq/compute.git');
  const bin = path.join(f.temp, 'bin');
  mkdirSync(bin);
  const gh = path.join(bin, 'gh');
  writeFileSync(gh, `#!${process.execPath}\nconst args = process.argv.slice(2);\nif (args[0] === 'auth' && args[1] === 'token') {\n  if (args.includes('matteo-ruina_ddog') && !process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) { console.log('work-token'); process.exit(0); }\n  process.exit(1);\n}\nif (args[0] === 'stack' && process.env.GH_TOKEN === 'work-token') { console.log('Parent branch: maruina/stack-parent'); process.exit(0); }\nprocess.exit(1);\n`);
  chmodSync(gh, 0o755);
  const result = spawnSync(process.execPath, [cli, 'resolve-base'], {
    cwd: f.repo,
    encoding: 'utf8',
    timeout: 15000,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GH_TOKEN: 'stale', GITHUB_TOKEN: 'stale2' },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { schemaVersion: 1, base: 'maruina/stack-parent', source: 'gh-stack' });
});
