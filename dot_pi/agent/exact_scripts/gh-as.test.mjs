import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const sourceHelper = fileURLToPath(new URL('../../../dot_config/private_fish/exact_functions/gh-as.fish', import.meta.url));
const helper = existsSync(sourceHelper) ? sourceHelper : path.join(process.env.HOME, '.config/fish/functions/gh-as.fish');
function run(t, args, fail = false) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gh-as-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const gh = path.join(dir, 'gh');
  const log = path.join(dir, 'calls');
  writeFileSync(gh, `#!${process.execPath}\nconst fs = require('fs'); const args = process.argv.slice(2); fs.appendFileSync(process.env.LOG, JSON.stringify({args, token: process.env.GH_TOKEN === 'fixture-token', noTokens: !process.env.GH_TOKEN && !process.env.GITHUB_TOKEN, repo: process.env.GH_REPO, host: process.env.GH_HOST})+'\\n'); if(args[0]==='auth') { if(process.env.FAIL) { console.error('fixture-secret'); process.exit(1); } console.log('fixture-token'); } else { console.log('wrapped output'); process.exit(7); }\n`);
  chmodSync(gh, 0o755);
  const result = spawnSync('fish', ['--no-config', '-c', 'source $argv[1]; gh-as $argv[2..-1]', '--', helper, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, LOG: log, GH_TOKEN: 'ambient', GITHUB_TOKEN: 'ambient2', GH_REPO: 'unrelated/repo', ...(fail ? { FAIL: '1' } : {}) } });
  return { result, calls: existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse) : [] };
}

test('routes repository and explicit login forms without global auth mutation', t => {
  for (const [target, command, login, repo] of [
    ['ddoghq/dd-source', ['pr', 'view', '1'], 'matteo-ruina_ddog', 'github.com/ddoghq/dd-source'],
    ['https://github.com/DDOGHQ-SANDBOX/example', ['pr', 'list'], 'matteo-ruina_ddog', 'github.com/DDOGHQ-SANDBOX/example'],
    ['DataDog/dd-go', ['pr', 'list'], 'maruina', 'github.com/DataDog/dd-go'],
    ['matteo-ruina_ddog', ['api', 'user'], 'matteo-ruina_ddog', null],
  ]) {
    const {result, calls} = run(t, [target, ...command]);
    assert.equal(result.status, 7, result.stderr);
    assert.equal(result.stdout.trim(), 'wrapped output');
    assert.deepEqual(calls[0].args, ['auth', 'token', '--hostname', 'github.com', '--user', login]);
    assert.equal(calls[0].noTokens, true);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].token, true);
    assert.equal(calls[1].host, 'github.com');
    if (repo) assert.equal(calls[1].repo, repo);
    assert.doesNotMatch(result.stdout + result.stderr, /fixture-token|fixture-secret/);
  }
});

test('rejects overrides and unsupported commands before token lookup', t => {
  for (const args of [['ddoghq/repo', 'pr', 'view', 'https://github.com/other/repo/pull/1'], ['ddoghq/repo', 'pr', 'list', '--repo=other/repo'], ['ddoghq/repo', 'pr', 'list', '-Rother/repo'], ['ddoghq/repo', 'pr', 'list', '--hostname', 'other'], ['ddoghq/repo', 'api', 'user'], ['maruina', 'api', 'user', '--hostname', 'other']]) {
    const {result, calls} = run(t, args);
    assert.notEqual(result.status, 0);
    assert.deepEqual(calls, []);
  }
});

test('token failure stops without leaking credentials', t => {
  const {result, calls} = run(t, ['ddoghq/repo', 'pr', 'list'], true);
  assert.notEqual(result.status, 0);
  assert.equal(calls.length, 1);
  assert.doesNotMatch(result.stdout + result.stderr, /fixture-secret|ambient/);
});
