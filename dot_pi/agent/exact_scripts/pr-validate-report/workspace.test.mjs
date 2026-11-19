import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { cleanup, preflight } from './workspace.mjs';

const url = 'https://github.com/DataDog/example/pull/17';
const head = 'a'.repeat(40);
const otherHead = 'b'.repeat(40);

function fixture(t, { fetched = head, owner = 'DataDog', dirty = false } = {}) {
  const temp = mkdtempSync(join(tmpdir(), 'pr-workspace-test-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const base = '/base';
  const worktree = join(temp, '.worktrees/example/pr-17-review');
  const calls = [];
  const git = async (cwd, ...args) => {
    calls.push([cwd, ...args]);
    switch (args[0]) {
      case 'remote': return args[1] === '-v'
        ? `origin\tgit@github.com:${owner}/example.git (fetch)\n`
        : `git@github.com:${owner}/example.git\n`;
      case 'fetch': return '';
      case 'rev-parse': return `${fetched}\n`;
      case 'update-ref': return '';
      case 'worktree':
        if (args[1] === 'list') return `worktree ${base}\0HEAD ${head}\0branch refs/heads/main\0\0worktree ${worktree}\0HEAD ${head}\0detached\0\0`;
        assert.deepEqual([cwd, ...args], [base, 'worktree', 'remove', '--', worktree]);
        return '';
      case 'status': return dirty ? '?? new-file\n' : '';
      default: throw new Error(`Unexpected Git command: ${args[0]}`);
    }
  };
  const collect = async () => ({ pr: { headRefOid: head } });
  return { git, collect, temp, base, worktree, calls };
}

test('preflight isolates overlapping runs and does not use FETCH_HEAD', async (t) => {
  const { git, collect, temp, base, calls } = fixture(t);
  const input = { url, base, remote: 'origin', git, collect, temp };
  const results = await Promise.all([preflight(input), preflight(input)]);
  assert.notEqual(results[0].evidenceFile, results[1].evidenceFile);
  for (const { evidenceFile, headOid, scratchDir } of results) {
    assert.equal(JSON.parse(readFileSync(evidenceFile, 'utf8')).pr.headRefOid, head);
    assert.equal(headOid, head);
    assert.equal(statSync(evidenceFile).mode & 0o777, 0o600);
    assert.equal(statSync(scratchDir).mode & 0o777, 0o700);
  }
  const fetches = calls.filter(([, command]) => command === 'fetch');
  assert.equal(fetches.length, 2);
  assert.notEqual(fetches[0].at(-1), fetches[1].at(-1));
  assert.ok(fetches.every((args) => args.includes('--no-write-fetch-head')));
  assert.doesNotMatch(JSON.stringify(calls), /FETCH_HEAD/);
});

test('preflight fetches a PR ref from a local fixture and leaves no temporary ref', async (t) => {
  const { temp } = fixture(t);
  const upstream = join(temp, 'upstream');
  const base = join(temp, 'base');
  const run = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  run(temp, 'init', '--quiet', upstream);
  run(upstream, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '--allow-empty', '-m', 'test');
  const headOid = run(upstream, 'rev-parse', 'HEAD').trim();
  run(upstream, 'update-ref', 'refs/pull/17/head', headOid);
  run(temp, 'init', '--quiet', base);
  run(base, 'remote', 'add', 'origin', upstream);
  const git = async (cwd, ...args) => args[0] === 'remote'
    ? 'https://github.com/DataDog/example.git\n'
    : run(cwd, ...args);
  const collect = async () => ({ pr: { headRefOid: headOid } });
  assert.equal((await preflight({ url, base, remote: 'origin', git, collect, temp })).headOid, headOid);
  assert.equal(run(base, 'cat-file', '-t', headOid).trim(), 'commit');
  assert.equal(run(base, 'for-each-ref', 'refs/pi-pr-validate'), '');
  assert.ok(!existsSync(join(base, '.git', 'FETCH_HEAD')));
});

test('preflight reports a moved head without accessing a review worktree', async (t) => {
  const { git, collect, temp, base, calls } = fixture(t, { fetched: otherHead });
  await assert.rejects(preflight({ url, base, remote: 'origin', git, collect, temp }), new RegExp(`${head}.*${otherHead}`));
  assert.ok(!calls.some(([, command]) => command === 'worktree'));
});

test('cleanup removes only a clean, detached review worktree from its base', async (t) => {
  const { temp, worktree } = fixture(t);
  const base = join(temp, 'base');
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
  git('init', '--quiet', base);
  git('-C', base, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '--allow-empty', '-m', 'test');
  git('-C', base, 'remote', 'add', 'origin', 'https://github.com/DataDog/example.git');
  git('-C', base, 'worktree', 'add', '--quiet', '--detach', worktree);
  assert.deepEqual(await cleanup({ url, root: join(temp, '.worktrees') }), { status: 'removed', worktree });
  assert.ok(existsSync(base));
  assert.ok(!existsSync(worktree));
});

for (const [name, options, error] of [
  ['same name under another owner', { owner: 'other' }, /does not match/],
  ['dirty worktree', { dirty: true }, /dirty/],
]) {
  test(`cleanup refuses ${name}`, async (t) => {
    const { git, temp, calls } = fixture(t, options);
    await assert.rejects(cleanup({ url, root: join(temp, '.worktrees'), git, physicalPath: (path) => path }), error);
    assert.ok(!calls.some(([, command, operation]) => command === 'worktree' && operation === 'remove'));
  });
}
