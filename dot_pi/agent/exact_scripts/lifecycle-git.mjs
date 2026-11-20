#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, globSync, lstatSync, openSync, readFileSync, readlinkSync, readSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

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
function designApproval(root, input) {
  if (!input) throw new CliError('invalid_arguments', 'Expected design path', 2);
  const full = realpathSync(path.resolve(input));
  if (!full.startsWith(`${root}${path.sep}`)) throw new CliError('invalid_path', 'Design is outside the current worktree', 2);
  const rel = path.relative(root, full);
  const working = readFileSync(full, 'utf8');
  const handoffCommand = `/systematic-review ${JSON.stringify(full)}`;
  const reject = (reason, invalidApproval = true) => ({ schemaVersion: 1, approved: false, reason, alreadyApprovedWithoutValidCommit: invalidApproval && /^Status: Approved$/m.test(working), handoffCommand });
  try {
    const commit = git(root, 'log', '-1', '--first-parent', '--full-history', '--format=%H', '--', `:(literal)${rel}`).trim();
    if (!/^[0-9a-f]{40}$/.test(commit)) return reject('no_design_commit');
    const parents = git(root, 'rev-list', '--parents', '-n', '1', commit).trim().split(' ');
    if (parents.length !== 2) return reject('not_single_parent');
    const changed = git(root, 'diff-tree', '--no-commit-id', '--name-only', '-r', '-z', '--no-renames', parents[1], commit).split('\0').filter(Boolean);
    if (changed.length !== 1 || changed[0] !== rel) return reject('not_design_only');
    const entry = rev => git(root, 'ls-tree', '-z', rev, '--', `:(literal)${rel}`).split('\0')[0];
    const oldEntry = /^(\d+) blob ([0-9a-f]{40})\t/.exec(entry(parents[1]));
    const newEntry = /^(\d+) blob ([0-9a-f]{40})\t/.exec(entry(commit));
    if (!oldEntry || !newEntry || oldEntry[1] !== newEntry[1]) return reject('mode_or_file_change');
    const before = git(root, 'cat-file', 'blob', oldEntry[2]);
    const after = git(root, 'cat-file', 'blob', newEntry[2]);
    const header = before.split(/^##\s/m, 1)[0];
    if ((header.match(/^Status: Draft$/gm) ?? []).length !== 1 || before.replace(/^Status: Draft$/m, 'Status: Approved') !== after) return reject('not_status_only');
    const headBlob = git(root, 'rev-parse', '--verify', '--end-of-options', `HEAD:${rel}`).trim();
    const indexBlob = git(root, 'rev-parse', '--verify', '--end-of-options', `:${rel}`).trim();
    const workingBlob = git(root, 'hash-object', '--no-filters', '--', rel).trim();
    const staged = git(root, 'diff', '--cached', '--name-only', '-z', '--', `:(literal)${rel}`);
    const unstaged = git(root, 'diff', '--name-only', '-z', '--', `:(literal)${rel}`);
    if (staged || unstaged || [headBlob, indexBlob, workingBlob].some(blob => blob !== newEntry[2])) return reject('design_dirty_or_head_changed', false);
    return { schemaVersion: 1, approved: true, commit, blob: newEntry[2] };
  } catch { return reject('git_evidence_unavailable'); }
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
function main(args) {
  if (args.length === 1 && args[0] === '--help') { console.log('Usage: lifecycle-git.mjs verify-design-approval PATH | resolve --path PATH | resolve --glob GLOB | discover-plan [--branch BRANCH] | snapshot [--base REF] | compare-snapshots FILE FILE'); return; }
  const [op, ...rest] = args;
  let output;
  if (op === 'compare-snapshots' && rest.length === 2) output = compare(JSON.parse(readFileSync(rest[0], 'utf8')), JSON.parse(readFileSync(rest[1], 'utf8')));
  else {
    const root = rootAt(process.cwd());
    if (op === 'verify-design-approval' && rest.length === 1) output = designApproval(root, rest[0]);
    else if (op === 'resolve' && rest.length === 2) output = resolve(root, rest[0], rest[1]);
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
    else throw new CliError('invalid_arguments', 'Invalid command or arguments; use --help', 2);
  }
  console.log(JSON.stringify(output));
  if (output.approved === false || output.match === false) process.exitCode = 1;
}
try { main(process.argv.slice(2)); } catch (error) {
  const e = error instanceof CliError ? error : new CliError('operation_failed', 'Unable to read required evidence');
  console.log(JSON.stringify({ schemaVersion: 1, error: { code: e.code, message: e.message } }));
  console.error(`${e.code}: ${e.message}`); process.exitCode = e.exitCode;
}
