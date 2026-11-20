#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MAX_ENTRIES = 10000;
function command(program, args, { timeout = 30000, env = process.env } = {}) {
  const result = spawnSync(program, args, { encoding: 'utf8', env: { ...env, GIT_OPTIONAL_LOCKS: '0' }, timeout, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  return { ok: result.status === 0 && !result.error, status: result.status, output: result.status === 0 && !result.error ? result.stdout : '' };
}
function children(dir) {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  if (entries.length > MAX_ENTRIES) throw new Error('directory entry limit exceeded');
  return entries.map(entry => path.join(dir, entry.name));
}
function sizes(paths) {
  const present = paths.filter(p => existsSync(p));
  if (!present.length) return [];
  const result = command('du', ['-sk', '--', ...present], { timeout: 600000 });
  if (!result.ok) return present.map(p => ({ path: p, available: false }));
  const values = new Map(result.output.trim().split('\n').map(line => { const tab = line.indexOf('\t'); return [line.slice(tab + 1), Number(line.slice(0, tab))]; }));
  return present.map(p => ({ path: p, available: Number.isFinite(values.get(p)), sizeKiB: values.get(p) ?? null }));
}
function measure(home) {
  const df = command('df', ['-k', '/']);
  const docker = command('docker', ['system', 'df']);
  const bazel = command('pgrep', ['-fl', 'bzl (test|build)']);
  const cacheDir = path.join(home, 'Library/Caches');
  const caches = sizes(children(cacheDir)).sort((a, b) => (b.sizeKiB ?? -1) - (a.sizeKiB ?? -1)).slice(0, 10);
  const crashDumps = sizes(children(home).filter(p => p.endsWith('.hprof')));
  const consumers = sizes([path.join('/private/var/tmp', `_bazel_${os.userInfo().username}`), cacheDir, path.join(home, '.colima'), path.join(home, 'go/pkg/mod'), path.join(home, 'go/src'), path.join(home, '.npm'), path.join(home, 'go/src/github.com/DataDog/.worktrees'), path.join(home, '.Trash')]);
  return { schemaVersion: 1, df: { available: df.ok, output: df.ok ? df.output : null }, consumers, caches, crashDumps, dockerDf: { available: docker.ok, output: docker.ok ? docker.output : null }, bazelRunning: bazel.ok ? true : bazel.status === 1 ? false : null };
}
function canonical(p) { return existsSync(p) ? realpathSync(p) : path.resolve(p); }
function repoCandidates(home) {
  const bases = [path.join(home, 'go/src/github.com/DataDog'), path.join(home, 'src')];
  return [...bases.flatMap(children).filter(p => !path.basename(p).startsWith('.') && existsSync(path.join(p, '.git'))), path.join(home, '.local/share/chezmoi')].filter(p => existsSync(path.join(p, '.git')));
}
function jsonCommand(args, env) {
  const value = command('wt', args, { env });
  if (!value.ok) return null;
  try { return JSON.parse(value.output); } catch { return null; }
}
function scan(home, selectedRepos, selectedRoots, minAge) {
  const repos = [...new Set((selectedRepos.length ? selectedRepos : repoCandidates(home)).map(canonical))];
  const roots = selectedRoots.length ? selectedRoots : [path.join(home, 'go/src/github.com/DataDog/.worktrees'), path.join(home, 'src/.worktrees'), path.join(home, '.worktrees')];
  if (repos.length > 200) throw new Error('repository limit exceeded');
  const worktrees = [], branchCandidates = [], errors = [], registered = new Set();
  for (const repo of repos) {
    const configured = command('git', ['-C', repo, 'config', '--get', 'worktrunk.default-branch']);
    let branch = configured.ok ? configured.output.trim() : '';
    if (!branch && configured.status === 1) {
      const symbolic = command('git', ['-C', repo, 'symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']);
      if (symbolic.ok && symbolic.output.trim().startsWith('refs/remotes/origin/')) branch = symbolic.output.trim().slice('refs/remotes/origin/'.length);
    }
    if (!branch || branch.startsWith('-') || !command('git', ['-C', repo, 'check-ref-format', '--branch', branch]).ok) { errors.push({ repo, reason: 'default_branch_unavailable' }); continue; }
    const count = Number(process.env.GIT_CONFIG_COUNT ?? '0');
    if (!Number.isSafeInteger(count) || count < 0 || count > 256) { errors.push({ repo, reason: 'git_config_unavailable' }); continue; }
    const env = { ...process.env, GIT_CONFIG_COUNT: String(count + 1), [`GIT_CONFIG_KEY_${count}`]: 'worktrunk.default-branch', [`GIT_CONFIG_VALUE_${count}`]: branch };
    const list = jsonCommand(['-C', repo, '--config-set', 'list.full=false', '--config-set', 'list.json-schema=2', 'list', '--branches', '--format=json'], env);
    const preview = jsonCommand(['-C', repo, 'step', 'prune', '--dry-run', '--format=json', '--min-age', minAge], env);
    if (list?.schema !== 2 || !Array.isArray(list.items) || !Array.isArray(preview)) { errors.push({ repo, reason: 'worktrunk_evidence_unavailable' }); continue; }
    if (list.items.length + worktrees.length > MAX_ENTRIES || preview.length > MAX_ENTRIES) throw new Error('worktree limit exceeded');
    const candidates = new Map();
    for (const candidate of preview) {
      if (candidate?.kind === 'branch_only') branchCandidates.push({ repo, ...candidate });
      if (candidate?.kind !== 'worktree' || typeof candidate.path !== 'string') continue;
      const key = JSON.stringify([canonical(candidate.path), candidate.branch]);
      const matches = candidates.get(key) ?? [];
      matches.push(candidate); candidates.set(key, matches);
    }
    for (const row of list.items) {
      if (!row?.worktree?.path) continue;
      const wt = row.worktree, dir = canonical(wt.path);
      registered.add(dir);
      if (wt.main) continue;
      const matches = candidates.get(JSON.stringify([dir, row.branch])) ?? [];
      const changes = wt.changes;
      const item = { repo, path: dir, branch: row.branch ?? null, head: row.head?.sha ?? null, lastCommitDate: row.head?.committed_at ?? null, locked: Boolean(wt.locked), current: Boolean(wt.current), integration: row.default_branch?.integration?.reason ?? null, classification: 'flagged', reason: null };
      if (!item.branch || !item.branch.startsWith('maruina/')) item.reason = 'foreign_or_detached_branch';
      else if (item.locked || wt.prunable || !existsSync(dir)) item.reason = 'locked_or_missing';
      else if (!changes || ['staged', 'modified', 'untracked', 'renamed', 'deleted', 'conflicted'].some(key => typeof changes[key] !== 'boolean') || !/^[0-9a-f]{40}$/i.test(item.head ?? '')) item.reason = 'status_unavailable';
      else if (['staged', 'modified', 'untracked', 'renamed', 'deleted', 'conflicted'].some(key => changes[key])) item.classification = 'dirty';
      else if (matches.length > 1) item.reason = 'ambiguous_preview';
      else if (matches.length === 1) { item.classification = 'integrated_preview'; item.preview = matches[0]; }
      else item.classification = 'not_previewed';
      worktrees.push(item);
    }
  }
  for (const root of roots) {
    for (const group of children(root)) {
      if (!statSync(group).isDirectory()) continue;
      const owners = repos.filter(repo => path.basename(repo) === path.basename(group));
      for (const dir of children(group)) {
        if (!statSync(dir).isDirectory()) continue;
        const resolved = canonical(dir);
        if (registered.has(resolved)) continue;
        if (worktrees.length >= MAX_ENTRIES) throw new Error('worktree limit exceeded');
        const uncertain = errors.length > 0 || owners.length !== 1;
        worktrees.push({ path: resolved, classification: uncertain ? 'flagged' : 'orphaned', reason: uncertain ? 'registration_unavailable' : null });
      }
    }
  }
  return { schemaVersion: 1, minAge, repositories: repos, errors, worktrees, branchCandidates };
}
function main(args) {
  if (args.length === 1 && args[0] === '--help') { console.log('Usage: disk-cleanup.mjs measure [--home DIR] | scan-worktrees [--home DIR] [--repo DIR ...] [--worktrees-root DIR ...] [--min-age DURATION]'); return; }
  const op = args.shift(); let home = os.homedir(), minAge = '1d'; const repos = [], roots = [];
  while (args.length) {
    const flag = args.shift(), value = args.shift();
    if (!value || value.startsWith('--')) throw new Error('invalid arguments');
    if (flag === '--home') home = path.resolve(value);
    else if (op === 'scan-worktrees' && flag === '--repo') repos.push(path.resolve(value));
    else if (op === 'scan-worktrees' && flag === '--worktrees-root') roots.push(path.resolve(value));
    else if (op === 'scan-worktrees' && flag === '--min-age' && /^\d+(s|m|h|d|w)$/.test(value)) minAge = value;
    else throw new Error('invalid arguments');
  }
  if (!['measure', 'scan-worktrees'].includes(op)) throw new Error('invalid arguments');
  console.log(JSON.stringify(op === 'measure' ? measure(home) : scan(home, repos, roots, minAge)));
}
try { main(process.argv.slice(2)); } catch (error) {
  const message = error instanceof Error ? error.message : 'operation failed';
  const invalid = message === 'invalid arguments';
  console.log(JSON.stringify({ schemaVersion: 1, error: { code: invalid ? 'invalid_arguments' : 'operation_failed', message } }));
  console.error(invalid ? 'invalid arguments' : 'disk cleanup evidence unavailable'); process.exitCode = invalid ? 2 : 1;
}
