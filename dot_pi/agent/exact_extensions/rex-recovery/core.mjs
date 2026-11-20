import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

export const stateDir = () => join(process.env.XDG_STATE_HOME || join(homedir(), '.local/state'), 'pi', 'rex-recovery');
export function callRex(args) {
  const outputArgs = [...args];
  if (!['send', 'send-key'].includes(args[0]) && !(args[0] === 'block' && args[1] === 'call')) {
    const separator = outputArgs.indexOf('--');
    outputArgs.splice(separator < 0 ? outputArgs.length : separator, 0, '--json');
  }
  return JSON.parse(execFileSync('rex', ['--autostart=false', '--timeout', '5s', ...outputArgs], {
    encoding: 'utf8', timeout: 7000, maxBuffer: 1024 * 1024,
  }) || '{}');
}
const quote = value => `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
const recordPath = (dir, id) => join(dir, `${id}.json`);
const pendingPath = (dir, id) => join(dir, `${id}.pending`);
function prepare(dir) { mkdirSync(dir, { recursive: true, mode: 0o700 }); }
function writeRecord(dir, record) {
  prepare(dir);
  const path = recordPath(dir, record.id);
  if (!existsSync(path) && readdirSync(dir).filter(n => n.endsWith('.json')).length >= 1000) {
    throw Error('Checkpoint limit reached (1000); remove old records before saving new panes');
  }
  const tmp = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(record) + '\n', { mode: 0o600, flag: 'wx' });
    renameSync(tmp, path);
  } finally { if (existsSync(tmp)) unlinkSync(tmp); }
}
function valid(r) {
  return (r?.version === 1 || (r?.version === 2 && typeof r.startTime === 'string' && Number.isFinite(Date.parse(r.startTime)) && Number.isSafeInteger(r.uid) && typeof r.command === 'string' && r.command.length > 0 && r.command.length <= 4096 && !/[\x00-\x1f]/.test(r.command))) && /^[a-f0-9]{64}$/.test(r.id) &&
    ['host', 'endpoint', 'session', 'block', 'tab', 'sessionLabel', 'tabLabel', 'file', 'cwd'].every(k =>
      typeof r[k] === 'string' && r[k].length > 0 && r[k].length <= 4096 && !/[\x00-\x1f]/.test(r[k])) &&
    r.endpoint.startsWith('unix://') && r.session.startsWith('session:') && r.block.startsWith('block:') &&
    r.tab.startsWith('window:') && !r.sessionLabel.startsWith('-') && !r.tabLabel.startsWith('-') && isAbsolute(r.file) && isAbsolute(r.cwd) && Number.isSafeInteger(r.pid);
}
export function readRecords(dir = stateDir()) {
  if (!existsSync(dir)) return [];
  const names = readdirSync(dir).filter(n => n.endsWith('.json'));
  if (names.length > 1000) throw Error('Too many checkpoints (maximum 1000); remove old records before restoring');
  return names.map(name => {
    const path = join(dir, name);
    try {
      if (statSync(path).size > 16384) throw Error('too large');
      const r = JSON.parse(readFileSync(path, 'utf8'));
      if (!valid(r) || name !== `${r.id}.json`) throw Error('invalid schema');
      return r;
    } catch (error) { throw Error(`Invalid checkpoint ${path}: ${error.message}`); }
  });
}
export function readProcessTable() {
  if (process.platform !== 'darwin') throw Error('Rex recovery process inspection requires macOS');
  const output = execFileSync('ps', ['-axo', 'pid=,ppid=,pgid=,tpgid=,uid=,lstart=,comm='], {
    encoding: 'utf8', timeout: 5000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' },
  });
  const pattern = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(-?\d+)\s+(-?\d+)\s+(\w+)\s+(\w+)\s+(\d+)\s+(\d\d:\d\d:\d\d)\s+(\d{4})\s+(.+?)\s*$/;
  return output.trim().split('\n').map(line => {
    const m = line.match(pattern);
    if (!m) throw Error('Incomplete macOS process table');
    const start = Date.parse(`${m[6]} ${m[7]} ${m[8]} ${m[9]} ${m[10]} UTC`);
    if (!Number.isFinite(start)) throw Error('Invalid macOS process start time');
    return { pid: Number(m[1]), ppid: Number(m[2]), pgid: Number(m[3]), tpgid: Number(m[4]), uid: Number(m[5]), startTime: new Date(start).toISOString(), command: m[11] };
  });
}
function processIdentity(rows, pid) {
  const matches = rows.filter(row => row.pid === pid);
  if (matches.length !== 1 || matches[0].uid !== process.getuid() || !Number.isFinite(Date.parse(matches[0].startTime))) throw Error(`Cannot verify process ${pid}`);
  return matches[0];
}
function descendsFrom(row, ancestor, byPid) {
  const seen = new Set();
  while (row && !seen.has(row.pid)) {
    if (row.pid === ancestor) return true;
    seen.add(row.pid);
    row = byPid.get(row.ppid);
  }
  return false;
}
function classifyPane(pane, process, rows, records, who) {
  const fg = process?.foreground;
  if (!fg?.pid) throw Error(`Cannot inspect foreground process in ${pane.session} / ${pane.block_id}`);
  const root = processIdentity(rows, fg.pid);
  if (root.pgid <= 0 || root.pgid !== root.tpgid) throw Error(`Cannot inspect foreground group in ${pane.session} / ${pane.block_id}`);
  const byPid = new Map(rows.map(row => [row.pid, row]));
  if (byPid.size !== rows.length) throw Error('Duplicate process IDs in process table');
  const group = rows.filter(row => row.pgid === root.pgid && row.tpgid === root.tpgid);
  if (group.some(row => row.uid !== root.uid || !descendsFrom(row, root.pid, byPid))) throw Error(`Ambiguous foreground group in ${pane.session} / ${pane.block_id}`);
  const matched = records.filter(r => r.version === 2 && r.host === who.host_id && r.endpoint === who.endpoint && r.session === pane.session && r.block === pane.block_id && group.some(row => row.pid === r.pid && row.uid === r.uid && row.startTime === r.startTime && row.command === r.command));
  if (matched.length > 1) throw Error(`Multiple checkpoints in ${pane.session} / ${pane.block_id}`);
  const known = matched[0];
  const unknownPi = group.some(row => (row.command === 'pi' || row.command.endsWith('/pi')) && row.pid !== known?.pid);
  const ambiguousFish = fg.name === 'fish' && group.some(row => row.pid !== root.pid && (!known || !descendsFrom(row, known.pid, byPid)));
  return { fg, known, unknown: unknownPi || ambiguousFish, busy: fg.name !== 'fish' || group.length > 1 };
}
export function checkpoint({ dir = stateDir(), file, cwd, pid = process.pid, env = process.env, rex = callRex, processTable = readProcessTable }) {
  if (!env.REX_SESSION || !env.REX_BLOCK || !file) return;
  const who = rex(['whoami']);
  if (who.session_id !== env.REX_SESSION || who.block_id !== env.REX_BLOCK || !who.endpoint?.startsWith('unix://')) {
    throw Error('Rex identity does not match the inherited pane');
  }
  const view = rex(['session', 'inspect', who.session_id]);
  const tab = view.windows.find(w => w.layers.some(l => l.blocks.some(b => b.block_id === who.block_id)));
  if (!tab) throw Error('Rex pane is absent from its session');
  const id = env.PI_REX_RECOVERY_ID || createHash('sha256').update(`${who.host_id}\0${who.session_id}\0${who.block_id}`).digest('hex');
  const first = processIdentity(processTable(), pid);
  const delay = Date.parse(first.startTime) + 1000 - Date.now();
  if (delay > 1000) throw Error('Process start time is in the future');
  if (delay > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay);
  const current = processIdentity(processTable(), pid);
  if (current.startTime !== first.startTime || current.uid !== first.uid || current.command !== first.command || Date.now() < Date.parse(current.startTime) + 1000) throw Error('Pi process identity changed during checkpoint');
  const record = { version: 2, id, host: who.host_id, endpoint: who.endpoint, session: who.session_id,
    block: who.block_id, tab: tab.window_id, sessionLabel: view.label, tabLabel: tab.label,
    file, cwd, pid, uid: current.uid, startTime: current.startTime, command: current.command, updatedAt: new Date().toISOString() };
  if (!valid(record)) throw Error('Invalid checkpoint identity or session path');
  writeRecord(dir, record);
  if (existsSync(pendingPath(dir, id))) unlinkSync(pendingPath(dir, id));
  return record;
}
function inventory(rex) {
  const who = rex(['whoami']);
  const sessions = rex(['ls']).sessions.map(s => rex(['session', 'inspect', s.session_id]));
  const panes = sessions.flatMap(s => s.windows.flatMap(w => w.layers.flatMap(l => l.blocks.map(b => ({ ...b, session: s.session_id, sessionLabel: s.label, tab: w.window_id, tabLabel: w.label })))));
  const processes = new Map(panes.map(p => [p.block_id, rex(['block', 'call', '-s', p.session, '-b', p.block_id, 'process'])]));
  return { who, sessions, panes, processes };
}
function acquireLock(dir) {
  try { return openSync(join(dir, '.restore-lock'), 'wx', 0o600); }
  catch { throw Error(`Cannot acquire restore lock: ${join(dir, '.restore-lock')}. Check for another restore before removing it.`); }
}
function releaseLock(dir, lock) { closeSync(lock); unlinkSync(join(dir, '.restore-lock')); }
const snapshotPath = dir => join(dir, 'snapshot');
export async function saveSnapshot({ dir = stateDir(), rex = callRex, processTable = readProcessTable } = {}) {
  let lock;
  const tmp = `${snapshotPath(dir)}.${randomUUID()}.tmp`;
  try {
    prepare(dir);
    lock = acquireLock(dir);
    const records = readRecords(dir);
    const { who, panes, processes } = inventory(rex);
    if (!who.host_id || !who.endpoint?.startsWith('unix://')) throw Error('A local Rex server is required');
    const selected = [];
    const rows = processTable();
    for (const pane of panes) {
      const state = classifyPane(pane, processes.get(pane.block_id), rows, records, who);
      if (state.unknown) throw Error(`Unknown or ambiguous process in ${pane.session} / ${pane.tab} / ${pane.block_id}; inspect the pane and run /reload in Pi.`);
      if (state.known) selected.push({ ...state.known, sessionLabel: pane.sessionLabel, tab: pane.tab, tabLabel: pane.tabLabel });
    }
    const snapshot = { version: 1, host: who.host_id, endpoint: who.endpoint, records: selected };
    writeFileSync(tmp, JSON.stringify(snapshot) + '\n', { mode: 0o600, flag: 'wx' });
    renameSync(tmp, snapshotPath(dir));
    return selected;
  } catch (error) {
    error.message += ' Previous snapshot retained.';
    throw error;
  } finally {
    if (existsSync(tmp)) unlinkSync(tmp);
    if (lock !== undefined) releaseLock(dir, lock);
  }
}
function readSnapshot(dir) {
  const path = snapshotPath(dir);
  if (!existsSync(path)) throw Error('No recovery snapshot. Run pi-save before the Rex update.');
  try {
    if (statSync(path).size > 20 * 1024 * 1024) throw Error('too large');
    const snapshot = JSON.parse(readFileSync(path, 'utf8'));
    if (snapshot.version !== 1 || typeof snapshot.host !== 'string' || !snapshot.host || !snapshot.endpoint?.startsWith('unix://') || !Array.isArray(snapshot.records) || snapshot.records.length > 1000 || snapshot.records.some(r => !valid(r) || r.version !== 2 || r.host !== snapshot.host || r.endpoint !== snapshot.endpoint) || new Set(snapshot.records.map(r => r.id)).size !== snapshot.records.length) throw Error('invalid schema');
    return snapshot;
  } catch (error) { throw Error(`Invalid recovery snapshot ${path}: ${error.message}`); }
}

export async function restore({ dir = stateDir(), apply = false, rex = callRex, processTable = readProcessTable } = {}) {
  let lock;
  if (apply) { prepare(dir); lock = acquireLock(dir); }
  const results = [];
  try {
    const snapshot = readSnapshot(dir);
    const who = rex(['whoami']);
    if (snapshot.host !== who.host_id || snapshot.endpoint !== who.endpoint) throw Error('Recovery snapshot belongs to another Rex server');
    const records = snapshot.records;
    if (!records.length) return results;
    const checkpoints = readRecords(dir);
    const { sessions, panes, processes } = inventory(rex);
    const local = checkpoints.filter(r => r.host === who.host_id && r.endpoint === who.endpoint);
    const rows = processTable();
    const states = new Map(panes.map(p => [p.block_id, classifyPane(p, processes.get(p.block_id), rows, local, who)]));
    const active = new Set([...states.values()].filter(state => state.known).map(state => state.known.file));
    const unknown = [...states.values()].some(state => state.unknown);
    const groups = new Map();
    for (const r of records) {
      const current = local.find(c => c.id === r.id && c.file === r.file);
      if (current && current.session !== r.session && sessions.some(s => s.session_id === current.session)) groups.set(r.session, current.session);
    }
    // deliberate: unknown Pi instances block apply; Rex does not expose their session arguments.
    if (apply && unknown) throw Error('A running Pi has no matching checkpoint. Run /reload in existing Pi sessions, then retry.');
    for (const r of records) {
      const result = { id: r.id, session: r.sessionLabel, tab: r.tabLabel, file: r.file };
      const report = action => { result.action = action; results.push(result); };
      if (!existsSync(r.file)) { report('missing-file'); continue; }
      if (!existsSync(r.cwd)) { report('missing-cwd'); continue; }
      if (active.has(r.file)) { report('already-open'); continue; }
      if (records.some(v => v.file === r.file && existsSync(pendingPath(dir, v.id)))) { report('pending'); continue; }
      const pane = panes.find(p => p.block_id === r.block && p.session === r.session);
      const state = states.get(r.block);
      const fg = state?.fg;
      if (pane && state.busy) { report('occupied'); continue; }
      if (!apply) { report(pane ? 'resume' : 'create-tab'); continue; }
      if (!pane && !groups.has(r.session) && !sessions.some(s => s.session_id === r.session) && records.some(v => v.session === r.session && existsSync(pendingPath(dir, v.id)))) {
        throw Error(`A pending launch has an unknown session for ${r.session}; inspect Rex before retrying.`);
      }
      // Reserve before mutation. An uncertain result must never trigger an automatic second launch.
      writeFileSync(pendingPath(dir, r.id), JSON.stringify({ file: r.file, at: new Date().toISOString() }), { flag: 'wx', mode: 0o600 });
      if (pane) {
        const current = rex(['block', 'call', '-s', r.session, '-b', r.block, 'process']).foreground;
        if (current?.name !== 'fish' || current.pid !== fg.pid || classifyPane(pane, { foreground: current }, processTable(), local, who).busy) {
          unlinkSync(pendingPath(dir, r.id)); report('occupied'); continue;
        }
        // deliberate: Rex has no atomic run-if-idle. Do not interact with target panes during restore.
        const command = `cd -- ${quote(r.cwd)} && env PI_REX_RECOVERY_ID=${r.id} pi --session ${quote(r.file)}`;
        rex(['send', '-s', r.session, '-b', r.block, command]);
        rex(['send-key', '-s', r.session, '-b', r.block, 'enter']);
      } else {
        const targetSession = groups.get(r.session) || r.session;
        const exists = sessions.some(s => s.session_id === targetSession);
        const command = `env PI_REX_RECOVERY_ID=${r.id} pi --session ${quote(r.file)}`;
        const argv = ['fish', '-i', '--init-command', command];
        const created = exists
          ? rex(['window', 'new', '-s', targetSession, r.tabLabel, '--focus=false', '--shell=none', '-c', r.cwd, '--', ...argv])
          : rex(['new', r.sessionLabel, '--window', r.tabLabel, '--shell=none', '-c', r.cwd, '--', ...argv]);
        const session = created.session_id || targetSession;
        const block = created.block_ids?.[0] || created.initial_windows?.[0]?.block_ids?.[0];
        if (!block) throw Error('Rex created a terminal but returned no pane ID; inspect it before retrying');
        const view = rex(['session', 'inspect', session]);
        const tab = view.windows.find(w => w.layers.some(l => l.blocks.some(b => b.block_id === block)));
        if (!tab) throw Error('Created pane is not yet inspectable; inspect Rex before retrying');
        const latest = readRecords(dir).find(v => v.id === r.id) || r;
        writeRecord(dir, { ...latest, session, block, tab: tab.window_id });
        // Update sibling checkpoints to preserve grouping when the old session no longer exists.
        if (!exists) {
          groups.set(r.session, session);
          for (const sibling of records.filter(v => v.session === r.session && v.id !== r.id)) writeRecord(dir, { ...sibling, session });
          sessions.push(view);
        }
      }
      active.add(r.file);
      report('restored');
    }
    return results;
  } catch (error) {
    error.results = results;
    throw error;
  } finally {
    if (lock !== undefined) releaseLock(dir, lock);
  }
}
