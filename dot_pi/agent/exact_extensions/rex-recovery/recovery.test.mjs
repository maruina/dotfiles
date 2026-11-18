import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkpoint, restore, readRecords } from './core.mjs';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'pi-recovery-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'conversation.jsonl');
  writeFileSync(file, JSON.stringify({ type: 'session', id: 'conversation', cwd: dir }) + '\n');
  const pane = { block_id: 'block:one' };
  const view = { session_id: 'session:one', label: 'Project', windows: [{ window_id: 'window:one', label: 'Task', layers: [{ blocks: [pane] }] }] };
  const who = { host_id: 'host', endpoint: 'unix:///local', session_id: 'session:one', block_id: 'block:one' };
  const calls = [];
  const processes = new Map([['block:one', { foreground: { pid: 42, name: 'fish' } }]]);
  const rex = (args) => {
    calls.push(args);
    if (args[0] === 'whoami') return who;
    if (args[0] === 'ls') return { sessions: [{ session_id: view.session_id }] };
    if (args[0] === 'session') return view;
    if (args[0] === 'block') return processes.get(args[args.indexOf('-b') + 1]) ?? {};
    if (args[0] === 'capture') return 'prompt\n➜';
    if (args[0] === 'new' || args[0] === 'window') {
      view.windows.push({ window_id: 'window:new', label: 'Task', layers: [{ blocks: [{ block_id: 'block:new' }] }] });
      return { session_id: view.session_id, block_ids: ['block:new'] };
    }
    return {};
  };
  const env = { REX_SESSION: who.session_id, REX_BLOCK: who.block_id };
  const save = () => checkpoint({ dir: join(dir, 'records'), file, cwd: dir, pid: 10, env, rex });
  return { dir: join(dir, 'records'), file, cwd: dir, rex, calls, save, who, view, processes, env };
}

test('checkpoint stores exact reference, replaces one record, and rejects stale inherited identity', t => {
  const f = fixture(t);
  f.save(); f.save();
  const records = readRecords(f.dir);
  assert.equal(records.length, 1);
  assert.equal(records[0].file, f.file);
  assert.equal(records[0].tabLabel, 'Task');
  f.who.block_id = 'block:elsewhere';
  assert.throws(f.save, /identity/);
  assert.equal(readRecords(f.dir)[0].block, 'block:one');
});

test('preview does not send input; apply quotes exact paths and retry skips the launched conversation', async t => {
  const f = fixture(t); f.save();
  assert.equal((await restore({ ...f, apply: false }))[0].action, 'resume');
  assert.equal(f.calls.some(a => a[0] === 'send'), false);
  const result = await restore({ ...f, apply: true });
  assert.equal(result[0].action, 'restored');
  const send = f.calls.find(a => a[0] === 'send');
  assert.ok(send.at(-1).includes(`--session '${f.file}'`));
  // A launch reservation prevents a duplicate even before Pi has checkpointed.
  assert.equal((await restore({ ...f, apply: true }))[0].action, 'pending');
});

test('occupied panes are not disturbed and missing sessions are reported', async t => {
  const f = fixture(t); f.save();
  f.processes.set('block:one', { foreground: { pid: 99, name: 'vim' } });
  assert.equal((await restore({ ...f, apply: true }))[0].action, 'occupied');
  assert.equal(f.calls.some(a => a[0] === 'send'), false);
  rmSync(f.file);
  assert.equal((await restore({ ...f, apply: true }))[0].action, 'missing-file');
});

test('missing panes are recreated as tabs and progress is retained', async t => {
  const f = fixture(t); f.save(); f.view.windows = [];
  const result = await restore({ ...f, apply: true });
  assert.equal(result[0].action, 'restored');
  const create = f.calls.find(a => a[0] === 'window');
  assert.ok(create.includes('Task'));
  assert.deepEqual(create.slice(-3), ['pi', '--session', f.file]);
  assert.equal(readRecords(f.dir)[0].block, 'block:new');
});

test('corrupt records and concurrent apply fail closed', async t => {
  const f = fixture(t); f.save();
  writeFileSync(join(f.dir, 'broken.json'), '{}');
  await assert.rejects(restore({ ...f, apply: true }), /Invalid checkpoint/);
  rmSync(join(f.dir, 'broken.json'));
  writeFileSync(join(f.dir, '.restore-lock'), 'other restore');
  await assert.rejects(restore({ ...f, apply: true }), /restore lock/);
});

test('an uncertain launch remains reserved rather than being retried', async t => {
  const f = fixture(t); f.save();
  const rex = args => { if (args[0] === 'send-key') throw Error('timeout'); return f.rex(args); };
  await assert.rejects(restore({ ...f, rex, apply: true }), /timeout/);
  assert.equal((await restore({ ...f, apply: true }))[0].action, 'pending');
});

test('running checkpoints are skipped and unknown Pi instances block apply', async t => {
  const f = fixture(t); f.save();
  f.processes.set('block:one', { foreground: { pid: 10, name: 'node', argv0: 'pi' } });
  assert.equal((await restore({ ...f, apply: true }))[0].action, 'already-open');
  f.processes.set('block:one', { foreground: { pid: 11, name: 'node', argv0: 'pi' } });
  await assert.rejects(restore({ ...f, apply: true }), /no matching checkpoint/);
  assert.equal(f.calls.some(a => a[0] === 'send'), false);
});

test('records from another server are not restored', async t => {
  const f = fixture(t); f.save(); f.who.host_id = 'other-host';
  assert.equal((await restore({ ...f, apply: true }))[0].action, 'other-server');
  assert.equal(f.calls.some(a => a[0] === 'send'), false);
});

test('foreground changes between preview and input are refused', async t => {
  const f = fixture(t); f.save(); let checks = 0;
  const rex = args => {
    if (args[0] === 'block' && ++checks === 2) return { foreground: { name: 'vim', pid: 88 } };
    return f.rex(args);
  };
  assert.equal((await restore({ ...f, rex, apply: true }))[0].action, 'occupied');
  assert.equal(f.calls.some(a => a[0] === 'send'), false);
});

test('headless Pi hooks never invoke the checkpoint worker', async () => {
  const { default: extension } = await import('./index.ts');
  const handlers = [];
  extension({ on: (_name, handler) => handlers.push(handler), exec: () => { throw Error('must not run'); } });
  for (const handler of handlers) await handler({}, { mode: 'rpc' });
});

test('lost session grouping is recreated once for sibling records', async t => {
  const f = fixture(t); const record = f.save(); f.view.windows = [];
  const otherFile = join(f.cwd, 'other.jsonl'); writeFileSync(otherFile, '{}');
  writeFileSync(join(f.dir, 'b'.repeat(64) + '.json'), JSON.stringify({ ...record, id: 'b'.repeat(64), file: otherFile, block: 'block:other' }));
  const rex = args => {
    if (args[0] === 'ls') return { sessions: [] };
    if (args[0] === 'new') f.view.session_id = 'session:new';
    return f.rex(args);
  };
  assert.deepEqual((await restore({ ...f, rex, apply: true })).map(r => r.action), ['restored', 'restored']);
  assert.equal(f.calls.filter(a => a[0] === 'new').length, 1);
  assert.equal(f.calls.filter(a => a[0] === 'window').length, 1);
  assert.ok(readRecords(f.dir).every(r => r.session === 'session:new'));
});
