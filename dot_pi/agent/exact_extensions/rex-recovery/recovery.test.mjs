import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkpoint, restore, readRecords, saveSnapshot } from './core.mjs';

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
  const row = (pid, command) => ({ pid, ppid: 1, pgid: pid, tpgid: pid, uid: process.getuid(), startTime: '2020-01-01T00:00:00.000Z', command });
  const processTable = () => [...processes.values()].map(({ foreground }) => row(foreground.pid, foreground.argv0 || foreground.name));
  const save = () => checkpoint({ dir: join(dir, 'records'), file, cwd: dir, pid: 10, env, rex, processTable: () => [row(10, 'pi')] });
  return { dir: join(dir, 'records'), file, cwd: dir, rex, calls, save, who, view, processes, env, processTable };
}

test('save matches Pi under a foreground Fish process and rejects a reused PID', async t => {
  const f = fixture(t);
  const uid = process.getuid();
  const rows = [
    { pid: 42, ppid: 1, pgid: 42, tpgid: 42, uid, startTime: '2020-01-01T00:00:00.000Z', command: 'fish' },
    { pid: 10, ppid: 42, pgid: 42, tpgid: 42, uid, startTime: '2020-01-01T00:00:01.000Z', command: 'pi' },
  ];
  const processTable = () => rows;
  checkpoint({ dir: f.dir, file: f.file, cwd: f.cwd, pid: 10, env: f.env, rex: f.rex, processTable });
  assert.deepEqual((await saveSnapshot({ ...f, processTable })).map(r => r.file), [f.file]);
  rows[1].startTime = '2020-01-01T00:00:02.000Z';
  await assert.rejects(saveSnapshot({ ...f, processTable }), /block:one/);
});

test('legacy checkpoints and process-table failures preserve the previous snapshot', async t => {
  const f = fixture(t); const record = f.save(); await snapshotFixture(f);
  const before = readFileSync(join(f.dir, 'snapshot'), 'utf8');
  const legacy = { ...record, version: 1 };
  delete legacy.startTime; delete legacy.uid; delete legacy.command;
  writeFileSync(join(f.dir, `${legacy.id}.json`), JSON.stringify(legacy));
  f.processes.set('block:one', { foreground: { pid: 10, argv0: 'pi' } });
  await assert.rejects(saveSnapshot(f), /block:one/);
  await assert.rejects(saveSnapshot({ ...f, processTable: () => { throw Error('ps unavailable'); } }), /ps unavailable/);
  await assert.rejects(saveSnapshot({ ...f, processTable: () => [] }), /Cannot verify process/);
  assert.equal(readFileSync(join(f.dir, 'snapshot'), 'utf8'), before);
});

test('save reports that the previous snapshot is retained when the lock is unavailable', async t => {
  const f = fixture(t); f.save(); await snapshotFixture(f);
  const before = readFileSync(join(f.dir, 'snapshot'), 'utf8');
  writeFileSync(join(f.dir, '.restore-lock'), 'other');
  await assert.rejects(saveSnapshot(f), /previous snapshot retained/i);
  assert.equal(readFileSync(join(f.dir, 'snapshot'), 'utf8'), before);
});

test('checkpoint waits beyond the whole-second process start time', t => {
  const f = fixture(t); const uid = process.getuid();
  const start = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
  const processTable = () => [{ pid: 10, ppid: 1, pgid: 10, tpgid: 10, uid, startTime: start, command: 'pi' }];
  const record = checkpoint({ dir: f.dir, file: f.file, cwd: f.cwd, pid: 10, env: f.env, rex: f.rex, processTable });
  assert.ok(Date.parse(record.updatedAt) >= Date.parse(start) + 1000);
});

test('checkpoint refuses an identity that changes in the start-time precision window', t => {
  const f = fixture(t); const uid = process.getuid(); let samples = 0;
  const start = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
  const processTable = () => [{ pid: 10, ppid: 1, pgid: 10, tpgid: 10, uid, startTime: samples++ ? '2020-01-01T00:00:00.000Z' : start, command: 'pi' }];
  assert.throws(() => checkpoint({ dir: f.dir, file: f.file, cwd: f.cwd, pid: 10, env: f.env, rex: f.rex, processTable }), /identity changed/);
  assert.deepEqual(readRecords(f.dir), []);
});

test('checkpoint refuses a process command that changes between samples', t => {
  const f = fixture(t); const uid = process.getuid(); let samples = 0;
  const processTable = () => [{ pid: 10, ppid: 1, pgid: 10, tpgid: 10, uid, startTime: '2020-01-01T00:00:00.000Z', command: samples++ ? 'other' : 'pi' }];
  assert.throws(() => checkpoint({ dir: f.dir, file: f.file, cwd: f.cwd, pid: 10, env: f.env, rex: f.rex, processTable }), /identity changed/);
});

test('save selects live panes across sessions and replaces the snapshot', async t => {
  const f = fixture(t);
  const first = f.save();
  const otherFile = join(f.cwd, 'other.jsonl'); writeFileSync(otherFile, '{}');
  const other = { ...first, id: 'b'.repeat(64), file: otherFile, session: 'session:two', block: 'block:two', pid: 20 };
  writeFileSync(join(f.dir, `${other.id}.json`), JSON.stringify(other));
  const stale = { ...first, id: 'c'.repeat(64), block: 'block:closed', pid: 30 };
  writeFileSync(join(f.dir, `${stale.id}.json`), JSON.stringify(stale));
  const secondView = { session_id: 'session:two', label: 'Second', windows: [{ window_id: 'window:two', label: 'Current', layers: [{ blocks: [{ block_id: 'block:two' }] }] }] };
  f.view.label = 'Renamed';
  f.processes.set('block:one', { foreground: { pid: 10, argv0: 'pi' } });
  f.processes.set('block:two', { foreground: { pid: 20, argv0: 'pi' } });
  const rex = args => args[0] === 'ls' ? { sessions: [{ session_id: 'session:one' }, { session_id: 'session:two' }] } :
    args[0] === 'session' && args[2] === 'session:two' ? secondView : f.rex(args);
  const saved = await saveSnapshot({ dir: f.dir, rex, processTable: f.processTable });
  assert.deepEqual(saved.map(r => r.file).sort(), [f.file, otherFile].sort());
  assert.equal(saved.find(r => r.file === f.file).sessionLabel, 'Renamed');
  assert.equal(saved.find(r => r.file === otherFile).tabLabel, 'Current');
  f.processes.set('block:one', { foreground: { pid: 42, name: 'fish' } });
  f.processes.set('block:two', { foreground: { pid: 43, name: 'fish' } });
  assert.deepEqual(await saveSnapshot({ dir: f.dir, rex, processTable: f.processTable }), []);
  assert.deepEqual(await restore({ dir: f.dir, rex, processTable: f.processTable }), []);
});

test('failed inventory and unmatched Pi preserve the previous snapshot', async t => {
  const f = fixture(t); f.save();
  f.processes.set('block:one', { foreground: { pid: 10, argv0: 'pi' } });
  await saveSnapshot(f);
  const before = await restore(f);
  const failed = args => { if (args[0] === 'ls') throw Error('inventory failed'); return f.rex(args); };
  await assert.rejects(saveSnapshot({ ...f, rex: failed }), /inventory failed/);
  f.processes.set('block:one', { foreground: { pid: 11, argv0: 'pi' } });
  await assert.rejects(saveSnapshot(f), /block:one/);
  f.processes.set('block:one', { foreground: { pid: 10, argv0: 'pi' } });
  assert.deepEqual(await restore(f), before);
});

test('restore requires a snapshot and does not launch historical checkpoints', async t => {
  const f = fixture(t); f.save();
  await assert.rejects(restore({ ...f, apply: true }), /pi-save/);
  assert.equal(f.calls.some(a => ['send', 'new', 'window'].includes(a[0])), false);
  f.processes.set('block:one', { foreground: { pid: 10, argv0: 'pi' } });
  await saveSnapshot(f);
  const otherFile = join(f.cwd, 'stale.jsonl'); writeFileSync(otherFile, '{}');
  const stale = { ...readRecords(f.dir)[0], id: 'd'.repeat(64), file: otherFile, block: 'block:closed' };
  writeFileSync(join(f.dir, `${stale.id}.json`), JSON.stringify(stale));
  assert.deepEqual((await restore(f)).map(r => r.file), [f.file]);
});

test('a reused checkpoint PID with a non-Pi process is not a live Pi', async t => {
  const f = fixture(t); f.save();
  f.processes.set('block:one', { foreground: { pid: 10, name: 'fish', argv0: 'fish' } });
  assert.deepEqual(await saveSnapshot(f), []);
});

test('preview of a missing snapshot does not create state', async t => {
  const f = fixture(t);
  await assert.rejects(restore(f), /pi-save/);
  assert.throws(() => readFileSync(f.dir), { code: 'ENOENT' });
});

test('invalid snapshot and missing paths are reported before launch', async t => {
  const f = fixture(t); f.save(); await snapshotFixture(f);
  const path = join(f.dir, 'snapshot');
  const snapshot = JSON.parse(readFileSync(path, 'utf8'));
  snapshot.records[0].cwd = join(f.cwd, 'missing');
  writeFileSync(path, JSON.stringify(snapshot));
  assert.equal((await restore({ ...f, apply: true }))[0].action, 'missing-cwd');
  rmSync(f.file);
  assert.equal((await restore({ ...f, apply: true }))[0].action, 'missing-file');
  snapshot.records.push({ ...snapshot.records[0] });
  writeFileSync(path, JSON.stringify(snapshot));
  await assert.rejects(restore({ ...f, apply: true }), /Invalid recovery snapshot/);
  writeFileSync(path, '{');
  await assert.rejects(restore({ ...f, apply: true }), /Invalid recovery snapshot/);
  assert.equal(f.calls.some(a => ['send', 'new', 'window'].includes(a[0])), false);
});

test('duplicate saved conversations launch at most once and remain reserved across retries', async t => {
  const f = fixture(t); const first = f.save();
  const second = { ...first, id: 'b'.repeat(64), block: 'block:other', pid: 11 };
  writeFileSync(join(f.dir, `${second.id}.json`), JSON.stringify(second));
  f.view.windows.push({ window_id: 'window:other', label: 'Other', layers: [{ blocks: [{ block_id: 'block:other' }] }] });
  f.processes.set('block:one', { foreground: { pid: 10, argv0: 'pi' } });
  f.processes.set('block:other', { foreground: { pid: 11, argv0: 'pi' } });
  await saveSnapshot(f);
  f.processes.set('block:one', { foreground: { pid: 42, name: 'fish' } });
  f.processes.set('block:other', { foreground: { pid: 43, name: 'fish' } });
  f.calls.length = 0;
  assert.deepEqual((await restore({ ...f, apply: true })).map(r => r.action), ['restored', 'already-open']);
  assert.equal(f.calls.filter(a => a[0] === 'send').length, 1);
  assert.deepEqual((await restore({ ...f, apply: true })).map(r => r.action), ['pending', 'pending']);
});

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

async function snapshotFixture(f) {
  const previous = f.processes.get('block:one');
  f.processes.set('block:one', { foreground: { pid: 10, argv0: 'pi' } });
  await saveSnapshot(f);
  f.processes.set('block:one', previous);
  f.calls.length = 0;
}

test('preview does not send input; apply quotes exact paths and retry skips the launched conversation', async t => {
  const f = fixture(t); f.save(); await snapshotFixture(f);
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
  const f = fixture(t); f.save(); await snapshotFixture(f);
  f.processes.set('block:one', { foreground: { pid: 99, name: 'vim' } });
  assert.equal((await restore({ ...f, apply: true }))[0].action, 'occupied');
  assert.equal(f.calls.some(a => a[0] === 'send'), false);
  rmSync(f.file);
  assert.equal((await restore({ ...f, apply: true }))[0].action, 'missing-file');
});

test('missing panes are recreated as tabs and progress is retained', async t => {
  const f = fixture(t); f.save(); await snapshotFixture(f); f.view.windows = [];
  const result = await restore({ ...f, apply: true });
  assert.equal(result[0].action, 'restored');
  const create = f.calls.find(a => a[0] === 'window');
  assert.ok(create.includes('Task'));
  assert.ok(create.includes('--shell=none'));
  assert.deepEqual(create.slice(-4, -1), ['fish', '-i', '--init-command']);
  assert.ok(create.at(-1).includes(`pi --session '${f.file}'`));
  assert.equal(readRecords(f.dir)[0].block, 'block:new');
});

test('corrupt records and concurrent apply fail closed', async t => {
  const f = fixture(t); f.save(); await snapshotFixture(f);
  writeFileSync(join(f.dir, 'broken.json'), '{}');
  await assert.rejects(restore({ ...f, apply: true }), /Invalid checkpoint/);
  rmSync(join(f.dir, 'broken.json'));
  writeFileSync(join(f.dir, '.restore-lock'), 'other restore');
  await assert.rejects(restore({ ...f, apply: true }), /restore lock/);
});

test('an uncertain launch remains reserved rather than being retried', async t => {
  const f = fixture(t); f.save(); await snapshotFixture(f);
  const rex = args => { if (args[0] === 'send-key') throw Error('timeout'); return f.rex(args); };
  await assert.rejects(restore({ ...f, rex, apply: true }), /timeout/);
  assert.equal((await restore({ ...f, apply: true }))[0].action, 'pending');
});

test('running checkpoints are skipped and unknown Pi instances block apply', async t => {
  const f = fixture(t); f.save(); await snapshotFixture(f);
  f.processes.set('block:one', { foreground: { pid: 10, name: 'node', argv0: 'pi' } });
  assert.equal((await restore({ ...f, apply: true }))[0].action, 'already-open');
  f.processes.set('block:one', { foreground: { pid: 11, name: 'node', argv0: 'pi' } });
  await assert.rejects(restore({ ...f, apply: true }), /no matching checkpoint/);
  assert.equal(f.calls.some(a => a[0] === 'send'), false);
});

test('snapshots from another server are not restored', async t => {
  const f = fixture(t); f.save(); await snapshotFixture(f); f.who.host_id = 'other-host';
  await assert.rejects(restore({ ...f, apply: true }), /another Rex server/);
  assert.equal(f.calls.some(a => a[0] === 'send'), false);
});

test('an uncheckpointed Pi beneath foreground Fish blocks save and apply', async t => {
  const f = fixture(t); f.save(); await snapshotFixture(f);
  const uid = process.getuid();
  const processTable = () => [
    { pid: 42, ppid: 1, pgid: 42, tpgid: 42, uid, startTime: '2020-01-01T00:00:00.000Z', command: 'fish' },
    { pid: 11, ppid: 42, pgid: 42, tpgid: 42, uid, startTime: '2020-01-01T00:00:00.000Z', command: 'pi' },
  ];
  await assert.rejects(saveSnapshot({ ...f, processTable }), /block:one/);
  await assert.rejects(restore({ ...f, processTable, apply: true }), /no matching checkpoint/);
  assert.equal(f.calls.some(a => a[0] === 'send'), false);
});

test('a Fish pane with a running Pi child is occupied for a different conversation', async t => {
  const f = fixture(t); f.save(); await snapshotFixture(f);
  const other = join(f.cwd, 'other.jsonl'); writeFileSync(other, '{}');
  const path = join(f.dir, 'snapshot'); const snapshot = JSON.parse(readFileSync(path, 'utf8'));
  snapshot.records[0].file = other; writeFileSync(path, JSON.stringify(snapshot));
  const uid = process.getuid();
  const processTable = () => [
    { pid: 42, ppid: 1, pgid: 42, tpgid: 42, uid, startTime: '2020-01-01T00:00:00.000Z', command: 'fish' },
    { pid: 10, ppid: 42, pgid: 42, tpgid: 42, uid, startTime: '2020-01-01T00:00:00.000Z', command: 'pi' },
  ];
  assert.equal((await restore({ ...f, processTable, apply: true }))[0].action, 'occupied');
  assert.equal(f.calls.some(a => a[0] === 'send'), false);
});

test('a foreground child appearing before input prevents reuse', async t => {
  const f = fixture(t); f.save(); await snapshotFixture(f); let checks = 0;
  const uid = process.getuid();
  const processTable = () => {
    const rows = f.processTable();
    if (++checks > 1) rows.push({ pid: 99, ppid: 42, pgid: 42, tpgid: 42, uid, startTime: '2020-01-01T00:00:00.000Z', command: 'vim' });
    return rows;
  };
  assert.equal((await restore({ ...f, processTable, apply: true }))[0].action, 'occupied');
  assert.equal(f.calls.some(a => a[0] === 'send'), false);
});

test('foreground changes between preview and input are refused', async t => {
  const f = fixture(t); f.save(); await snapshotFixture(f); let checks = 0;
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

test('an uncertain session creation blocks siblings until its location is known', async t => {
  const f = fixture(t); const first = f.save();
  const second = { ...first, id: 'b'.repeat(64), file: join(f.cwd, 'other.jsonl'), block: 'block:other', pid: 11 };
  writeFileSync(second.file, '{}');
  writeFileSync(join(f.dir, `${second.id}.json`), JSON.stringify(second));
  f.view.windows.push({ window_id: 'window:other', label: 'Other', layers: [{ blocks: [{ block_id: 'block:other' }] }] });
  f.processes.set('block:one', { foreground: { pid: 10, argv0: 'pi' } });
  f.processes.set('block:other', { foreground: { pid: 11, argv0: 'pi' } });
  await saveSnapshot(f);
  const rex = args => {
    if (args[0] === 'ls') return { sessions: [] };
    if (args[0] === 'new') throw Error('creation timed out');
    return f.rex(args);
  };
  await assert.rejects(restore({ ...f, rex, apply: true }), /creation timed out/);
  await assert.rejects(restore({ ...f, rex, apply: true }), /pending.*session/i);
});

test('a retry keeps the recreated session after a partial failure', async t => {
  const f = fixture(t); const first = f.save();
  const second = { ...first, id: 'b'.repeat(64), file: join(f.cwd, 'other.jsonl'), block: 'block:other', pid: 11 };
  writeFileSync(second.file, '{}'); writeFileSync(join(f.dir, `${second.id}.json`), JSON.stringify(second));
  f.view.windows.push({ window_id: 'window:other', label: 'Other', layers: [{ blocks: [{ block_id: 'block:other' }] }] });
  f.processes.set('block:one', { foreground: { pid: 10, argv0: 'pi' } });
  f.processes.set('block:other', { foreground: { pid: 11, argv0: 'pi' } });
  await saveSnapshot(f);
  const snapshot = readFileSync(join(f.dir, 'snapshot'), 'utf8');
  f.view.windows = []; let created = false; let failWindow = true;
  const rex = args => {
    if (args[0] === 'ls') return { sessions: created ? [{ session_id: 'session:new' }] : [] };
    if (args[0] === 'new') {
      created = true; f.view.session_id = 'session:new';
      f.processes.set('block:new', { foreground: { pid: 42, name: 'fish' } });
    }
    if (args[0] === 'window' && failWindow) { failWindow = false; throw Error('window not created'); }
    return f.rex(args);
  };
  await assert.rejects(restore({ ...f, rex, apply: true }), /window not created/);
  rmSync(join(f.dir, `${second.id}.pending`));
  assert.deepEqual((await restore({ ...f, rex, apply: true })).map(r => r.action), ['pending', 'restored']);
  const window = f.calls.find(a => a[0] === 'window');
  assert.equal(window[window.indexOf('-s') + 1], 'session:new');
  assert.equal(f.calls.filter(a => a[0] === 'new').length, 1);
  assert.equal(readFileSync(join(f.dir, 'snapshot'), 'utf8'), snapshot);
});

test('lost session grouping is recreated once for sibling records', async t => {
  const f = fixture(t); const record = f.save();
  const otherFile = join(f.cwd, 'other.jsonl'); writeFileSync(otherFile, '{}');
  writeFileSync(join(f.dir, 'b'.repeat(64) + '.json'), JSON.stringify({ ...record, id: 'b'.repeat(64), file: otherFile, block: 'block:other', pid: 11 }));
  f.view.windows.push({ window_id: 'window:other', label: 'Other', layers: [{ blocks: [{ block_id: 'block:other' }] }] });
  f.processes.set('block:one', { foreground: { pid: 10, argv0: 'pi' } });
  f.processes.set('block:other', { foreground: { pid: 11, argv0: 'pi' } });
  await saveSnapshot(f);
  f.calls.length = 0; f.view.windows = [];
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
