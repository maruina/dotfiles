#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, globSync, lstatSync, openSync, readFileSync, readlinkSync, readSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { getGhTokenSync, parseGitHubOwnerRepo, scrubbedGhEnv, selectGitHubLogin } from './_github.mjs';

class CliError extends Error {
  constructor(code, message, exitCode = 1) { super(message); this.code = code; this.exitCode = exitCode; }
}
function git(root, ...args) {
  try { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 120000, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }); }
  catch { throw new CliError('git_failed', `Git command failed: ${args[0]}`); }
}
function rootAt(dir) { return realpathSync(git(dir, 'rev-parse', '--show-toplevel').trim()); }
function worktrees(root) {
  return git(root, 'worktree', 'list', '--porcelain', '-z').split('\0\0').filter(Boolean).map(record => {
    const fields = record.split('\0');
    const dir = fields.find(x => x.startsWith('worktree '))?.slice(9);
    const branch = fields.find(x => x.startsWith('branch refs/heads/'))?.slice(18) ?? null;
    return { root: dir && existsSync(dir) ? realpathSync(dir) : dir, branch };
  }).filter(item => item.root && existsSync(item.root));
}
function candidate(file, worktree) {
  const full = realpathSync(file);
  const stat = statSync(full);
  if (!stat.isFile()) return null;
  const heading = readFileSync(full, 'utf8').split('\n').find(line => /^#\s+/.test(line)) ?? null;
  return { path: full, root: worktree.root, branch: worktree.branch, mtimeMs: stat.mtimeMs, heading };
}
function resolve(root, mode, value) {
  if (!value || !['--path', '--glob'].includes(mode)) throw new CliError('invalid_arguments', 'Expected --path PATH or --glob PATTERN', 2);
  const trees = worktrees(root);
  const candidates = [];
  if (mode === '--path' && existsSync(path.resolve(value))) {
    const full = realpathSync(path.resolve(value));
    const owner = rootAt(path.dirname(full));
    const tree = trees.find(item => item.root === owner) ?? { root: owner, branch: git(owner, 'branch', '--show-current').trim() || null };
    const item = candidate(full, tree); if (item) candidates.push(item);
  } else {
    if (mode === '--glob' && (path.isAbsolute(value) || value.split('/').includes('..'))) throw new CliError('invalid_arguments', 'Glob must be worktree-relative', 2);
    for (const tree of trees) {
      const files = mode === '--path' ? [path.resolve(tree.root, value)] : globSync(value, { cwd: tree.root, exclude: ['**/.git/**'] }).map(file => path.resolve(tree.root, file));
      for (const file of files) {
        if (!existsSync(file)) continue;
        const item = candidate(file, tree);
        if (item && (item.path === tree.root || item.path.startsWith(`${tree.root}${path.sep}`))) candidates.push(item);
        if (candidates.length > 10000) throw new CliError('candidate_limit', 'Too many candidate files');
      }
    }
  }
  candidates.sort((a, b) => Math.floor(b.mtimeMs / 1000) - Math.floor(a.mtimeMs / 1000) || Number(b.root === root) - Number(a.root === root) || b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path));
  return { schemaVersion: 1, status: candidates.length === 0 ? 'none' : candidates.length === 1 ? 'unique' : 'ambiguous', candidates };
}
function sha(data) { return createHash('sha256').update(data).digest('hex'); }
function fileHash(file) {
  const stat = lstatSync(file);
  if (stat.isSymbolicLink()) return { type: 'symlink', mode: stat.mode & 0o777, hash: sha(readlinkSync(file)) };
  if (!stat.isFile()) throw new CliError('unsupported_untracked', `Unsupported untracked path: ${file}`);
  const hash = createHash('sha256'); const buffer = Buffer.alloc(65536); const fd = openSync(file, 'r');
  try { let n; while ((n = readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, n)); }
  finally { closeSync(fd); }
  return { type: 'file', mode: stat.mode & 0o777, hash: hash.digest('hex') };
}
function snapshot(root, base) {
  const head = git(root, 'rev-parse', '--verify', '--end-of-options', 'HEAD^{commit}').trim();
  const baseCommit = base ? git(root, 'rev-parse', '--verify', '--end-of-options', `${base}^{commit}`).trim() : head;
  const untracked = git(root, 'ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean).sort();
  return { schemaVersion: 1, worktree: root, branch: git(root, 'branch', '--show-current').trim(), head, base: baseCommit,
    candidateCommits: git(root, 'rev-list', '--reverse', `${baseCommit}..${head}`).trim().split('\n').filter(Boolean),
    statusPorcelain: git(root, 'status', '--porcelain=v1', '-z', '--untracked-files=all'),
    stagedDiffHash: sha(git(root, 'diff', '--binary', '--no-ext-diff', '--no-textconv', '--cached', '--')),
    unstagedDiffHash: sha(git(root, 'diff', '--binary', '--no-ext-diff', '--no-textconv', '--')),
    untrackedFiles: untracked.map(file => ({ path: file, ...fileHash(path.join(root, file)) })) };
}
function compare(a, b) {
  const fields = ['worktree', 'branch', 'head', 'base', 'candidateCommits', 'statusPorcelain', 'stagedDiffHash', 'unstagedDiffHash', 'untrackedFiles'];
  if ([a, b].some(value => !value || value.schemaVersion !== 1 || fields.some(field => !(field in value)))) throw new CliError('invalid_snapshot', 'Invalid snapshot');
  const deltas = fields.filter(field => JSON.stringify(a[field]) !== JSON.stringify(b[field]));
  return { schemaVersion: 1, match: deltas.length === 0, deltas };
}
function unfencedLines(content) {
  const result = [];
  let fence = null;
  const raw = content.split(/\r?\n/);
  for (let i = 0; i < raw.length; i++) {
    const line = raw[i];
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (marker && marker[1].startsWith(fence) && !marker[2].trim()) fence = null;
      continue;
    }
    if (marker && (marker[1][0] === '~' || !marker[2].includes('`'))) {
      fence = marker[1];
      continue;
    }
    result.push({ line, lineNumber: i + 1 });
  }
  return result;
}
function lintPlan(file) {
  if (!existsSync(file)) throw new CliError('missing_file', `Plan not found: ${file}`);
  const content = readFileSync(file, 'utf8');
  const lines = unfencedLines(content);
  const errors = [];
  const tasks = [];
  const slices = [];
  let inTask = false;
  let inPostPub = false;
  const blockedByRe = /^(?:None|(?:Tasks? \d+(?:-\d+)?)(?:(?:,\s*|\s+and\s+)Tasks? \d+(?:-\d+)?)*)$/;
  for (const { line, lineNumber } of lines) {
    if (/^## /.test(line)) {
      inTask = false;
      inPostPub = /^## Post-publication validation\b/i.test(line);
      continue;
    }
    if (/^### Slice\b/.test(line)) {
      inTask = false;
      const m = /^### Slice (\d+):\s*(.+)$/.exec(line);
      if (!m) errors.push(`line ${lineNumber}: malformed slice heading: ${line}`);
      else slices.push({ number: Number(m[1]), title: m[2].trim() });
      continue;
    }
    if (/^### Task\b/.test(line)) {
      const m = /^### Task (\d+):\s*(.+)$/.exec(line);
      if (!m) {
        errors.push(`line ${lineNumber}: malformed task heading: ${line}`);
        inTask = false;
      } else {
        tasks.push({ number: Number(m[1]), title: m[2].trim() });
        inTask = true;
      }
      continue;
    }
    if (/^### /.test(line)) {
      inTask = false;
      continue;
    }
    const blockedMatch = /^\*\*Blocked by:\*\*\s*(.+)$/.exec(line);
    if (blockedMatch) {
      const val = blockedMatch[1].trim();
      if (!blockedByRe.test(val)) {
        errors.push(`line ${lineNumber}: invalid Blocked by format (use Task N, Tasks N-M, or None; no parenthetical notes): ${val}`);
      }
      continue;
    }
    const filesMatch = /^\*\*Files:\*\*\s*(.+)$/.exec(line);
    if (filesMatch && /(?:^|[\s`,"'(])(?:\/|~\/)[^\s`,"')]+/.test(filesMatch[1])) {
      errors.push(`line ${lineNumber}: **Files:** must use repo-relative paths, not absolute paths`);
    }
    if (/^\s*- \[[ xX]\] /.test(line)) {
      if (inPostPub) errors.push(`line ${lineNumber}: Post-publication validation must use plain bullets, not checkboxes`);
      else if (!inTask) errors.push(`line ${lineNumber}: checkbox must appear inside a numbered ### Task N: section`);
    }
  }
  return { schemaVersion: 1, ok: errors.length === 0, errors, tasks, slices };
}
function preflightDesign(root, file) {
  const full = realpathSync(path.resolve(file));
  const rel = path.relative(root, full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new CliError('outside_worktree', `Design is outside worktree: ${file}`);
  const status = git(root, 'status', '--porcelain=v1', '--untracked-files=all', '--', rel).trim();
  const clean = status === '';
  let statusLine = null;
  let head = null;
  try {
    head = git(root, 'rev-parse', '--verify', 'HEAD^{commit}').trim();
    const committed = git(root, 'show', `HEAD:${rel}`);
    statusLine = committed.split(/\r?\n/)[1] ?? null;
  } catch {
    statusLine = null;
  }
  const approved = statusLine === 'Status: Approved';
  return { schemaVersion: 1, ok: clean && approved, clean, approved, statusLine, head, path: full };
}
function nextSlice(root, file) {
  const full = realpathSync(path.resolve(file));
  const rel = path.relative(root, full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new CliError('outside_worktree', `Plan is outside worktree: ${file}`);
  const status = git(root, 'status', '--porcelain=v1', '--untracked-files=all', '--', rel).trim();
  let committed = false;
  try {
    git(root, 'cat-file', '-e', `HEAD:${rel}`);
    committed = status === '';
  } catch {
    committed = false;
  }
  const lines = unfencedLines(readFileSync(full, 'utf8'));
  let grouped = false;
  let currentSlice = null;
  let nextSliceInfo = null;
  let remainingCount = 0;
  for (const { line } of lines) {
    if (/^## /.test(line)) {
      currentSlice = null;
    } else if (/^### Slice (\d+):\s*(.+)$/.test(line)) {
      grouped = true;
      const m = /^### Slice (\d+):\s*(.+)$/.exec(line);
      currentSlice = { number: Number(m[1]), title: m[2].trim() };
    } else if (/^\s*- \[ \] .+$/.test(line)) {
      remainingCount++;
      if (!nextSliceInfo && currentSlice) nextSliceInfo = currentSlice;
    }
  }
  return { schemaVersion: 1, path: full, committed, grouped, nextSlice: nextSliceInfo, remainingCount };
}
function resolveGhEnv(root) {
  try {
    const remote = git(root, 'remote', 'get-url', 'origin').trim();
    const parsed = parseGitHubOwnerRepo(remote);
    if (parsed) {
      const token = getGhTokenSync(selectGitHubLogin(parsed.owner), { cwd: root });
      if (token) return scrubbedGhEnv(process.env, token);
    }
  } catch { /* fall through */ }
  return scrubbedGhEnv(process.env);
}
function resolveBase(root) {
  const ghEnv = resolveGhEnv(root);
  try {
    const stackOut = execFileSync('gh', ['stack', 'status'], { cwd: root, env: ghEnv, encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] });
    const match = /parent(?: branch)?:\s*([^\s]+)/i.exec(stackOut);
    if (match?.[1]) return { schemaVersion: 1, base: match[1], source: 'gh-stack' };
  } catch { /* fall through */ }
  try {
    const prBase = execFileSync('gh', ['pr', 'view', '--json', 'baseRefName', '-q', '.baseRefName'], { cwd: root, env: ghEnv, encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (prBase) return { schemaVersion: 1, base: prBase, source: 'gh-pr' };
  } catch { /* fall through */ }
  try {
    const originHead = git(root, 'symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD').trim();
    if (originHead.startsWith('origin/')) return { schemaVersion: 1, base: originHead.slice('origin/'.length), source: 'origin-head' };
  } catch { /* fall through */ }
  return { schemaVersion: 1, base: 'main', source: 'fallback' };
}
function main(args) {
  if (args.length === 1 && args[0] === '--help') { console.log('Usage: lifecycle-git.mjs resolve --path PATH | resolve --glob GLOB | discover-plan [--branch BRANCH] | snapshot [--base REF] | compare-snapshots FILE FILE | lint-plan PATH | preflight-design PATH | next-slice PATH | resolve-base'); return; }
  const [op, ...rest] = args;
  let output;
  if (op === 'compare-snapshots' && rest.length === 2) output = compare(JSON.parse(readFileSync(rest[0], 'utf8')), JSON.parse(readFileSync(rest[1], 'utf8')));
  else if (op === 'lint-plan' && rest.length === 1) output = lintPlan(rest[0]);
  else {
    const root = rootAt(process.cwd());
    if (op === 'resolve' && rest.length === 2) output = resolve(root, rest[0], rest[1]);
    else if (op === 'discover-plan' && (rest.length === 0 || (rest.length === 2 && rest[0] === '--branch'))) {
      const branch = rest[1] ?? git(root, 'branch', '--show-current').trim();
      const slug = branch.replace(/^[^/]+\//, '');
      const discovered = resolve(root, '--glob', '**/plans/**/plan.md').candidates;
      const plans = discovered.filter(item => /(?:^|\/)plans\/[^/]+\/plan\.md$/.test(path.relative(item.root, item.path)));
      const matching = slug ? discovered.filter(item => (`/${path.relative(item.root, item.path)}`).endsWith(`/plans/${slug}/plan.md`)) : [];
      const designs = plans.length ? [] : resolve(root, '--glob', '**/plans/*/design.md').candidates;
      const candidates = matching.length ? matching : plans.length ? plans : designs;
      output = { schemaVersion: 1, status: candidates.length === 0 ? 'none' : candidates.length === 1 ? 'unique' : 'ambiguous', branch, slug, matching, plans, designs, candidates };
    } else if (op === 'snapshot' && (rest.length === 0 || (rest.length === 2 && rest[0] === '--base'))) output = snapshot(root, rest[1]);
    else if (op === 'preflight-design' && rest.length === 1) output = preflightDesign(root, rest[0]);
    else if (op === 'next-slice' && rest.length === 1) output = nextSlice(root, rest[0]);
    else if (op === 'resolve-base' && rest.length === 0) output = resolveBase(root);
    else throw new CliError('invalid_arguments', 'Invalid command or arguments; use --help', 2);
  }
  console.log(JSON.stringify(output));
  if (output.match === false || output.ok === false) process.exitCode = 1;
}
try { main(process.argv.slice(2)); } catch (error) {
  const e = error instanceof CliError ? error : new CliError('operation_failed', 'Unable to read required evidence');
  console.log(JSON.stringify({ schemaVersion: 1, error: { code: e.code, message: e.message } }));
  console.error(`${e.code}: ${e.message}`); process.exitCode = e.exitCode;
}
