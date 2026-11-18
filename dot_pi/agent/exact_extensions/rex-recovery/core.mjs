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
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
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
  return r?.version === 1 && /^[a-f0-9]{64}$/.test(r.id) &&
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
export function checkpoint({ dir = stateDir(), file, cwd, pid = process.pid, env = process.env, rex = callRex }) {
  if (!env.REX_SESSION || !env.REX_BLOCK || !file) return;
  const who = rex(['whoami']);
  if (who.session_id !== env.REX_SESSION || who.block_id !== env.REX_BLOCK || !who.endpoint?.startsWith('unix://')) {
    throw Error('Rex identity does not match the inherited pane');
  }
  const view = rex(['session', 'inspect', who.session_id]);
  const tab = view.windows.find(w => w.layers.some(l => l.blocks.some(b => b.block_id === who.block_id)));
  if (!tab) throw Error('Rex pane is absent from its session');
  const id = env.PI_REX_RECOVERY_ID || createHash('sha256').update(`${who.host_id}\0${who.session_id}\0${who.block_id}`).digest('hex');
  const record = { version: 1, id, host: who.host_id, endpoint: who.endpoint, session: who.session_id,
    block: who.block_id, tab: tab.window_id, sessionLabel: view.label, tabLabel: tab.label,
    file, cwd, pid, updatedAt: new Date().toISOString() };
  if (!valid(record)) throw Error('Invalid checkpoint identity or session path');
  writeRecord(dir, record);
  if (existsSync(pendingPath(dir, id))) unlinkSync(pendingPath(dir, id));
  return record;
}
function panesIn(view) {
  return view.windows.flatMap(w => w.layers.flatMap(l => l.blocks.map(b => ({ ...b, tab: w.window_id }))));
}

export async function restore({ dir = stateDir(), apply = false, rex = callRex } = {}) {
  prepare(dir);
  let lock;
  if (apply) {
    try { lock = openSync(join(dir, '.restore-lock'), 'wx', 0o600); }
    catch { throw Error(`Cannot acquire restore lock: ${join(dir, '.restore-lock')}. Check for another restore before removing it.`); }
  }
  const results = [];
  try {
    const records = readRecords(dir);
    if (!records.length) return results;
    const who = rex(['whoami']);
    const sessions = rex(['ls']).sessions.map(s => rex(['session', 'inspect', s.session_id]));
    const panes = sessions.flatMap(s => panesIn(s).map(p => ({ ...p, session: s.session_id })));
    const processes = new Map(panes.map(p => [p.block_id, rex(['block', 'call', '-s', p.session, '-b', p.block_id, 'process'])]));
    const local = records.filter(r => r.host === who.host_id && r.endpoint === who.endpoint);
    const active = new Set(local.filter(r => processes.get(r.block)?.foreground?.pid === r.pid).map(r => r.file));
    const unknown = [...processes.values()].some(p => {
      const fg = p.foreground;
      return fg?.argv0 === 'pi' && !local.some(r => r.pid === fg.pid);
    });
    // deliberate: unknown Pi instances block apply; Rex does not expose their session arguments.
    if (apply && unknown) throw Error('A running Pi has no matching checkpoint. Run /reload in existing Pi sessions, then retry.');
    for (const r of records) {
      const result = { id: r.id, session: r.sessionLabel, tab: r.tabLabel, file: r.file };
      const report = action => { result.action = action; results.push(result); };
      if (!local.includes(r)) { report('other-server'); continue; }
      if (!existsSync(r.file) || !existsSync(r.cwd)) { report('missing-file'); continue; }
      if (active.has(r.file)) { report('already-open'); continue; }
      if (existsSync(pendingPath(dir, r.id))) { report('pending'); continue; }
      const pane = panes.find(p => p.block_id === r.block && p.session === r.session);
      const fg = processes.get(r.block)?.foreground;
      if (pane && fg?.name !== 'fish') { report('occupied'); continue; }
      if (!apply) { report(pane ? 'resume' : 'create-tab'); continue; }
      // Reserve before mutation. An uncertain result must never trigger an automatic second launch.
      writeFileSync(pendingPath(dir, r.id), JSON.stringify({ file: r.file, at: new Date().toISOString() }), { flag: 'wx', mode: 0o600 });
      if (pane) {
        const current = rex(['block', 'call', '-s', r.session, '-b', r.block, 'process']).foreground;
        if (current?.name !== 'fish' || current.pid !== fg.pid) {
          unlinkSync(pendingPath(dir, r.id)); report('occupied'); continue;
        }
        // deliberate: Rex has no atomic run-if-idle. Do not interact with target panes during restore.
        const command = `cd -- ${quote(r.cwd)} && env PI_REX_RECOVERY_ID=${r.id} pi --session ${quote(r.file)}`;
        rex(['send', '-s', r.session, '-b', r.block, command]);
        rex(['send-key', '-s', r.session, '-b', r.block, 'enter']);
      } else {
        const exists = sessions.some(s => s.session_id === r.session);
        const argv = ['env', `PI_REX_RECOVERY_ID=${r.id}`, 'pi', '--session', r.file];
        const created = exists
          ? rex(['window', 'new', '-s', r.session, r.tabLabel, '--focus=false', '-c', r.cwd, '--', ...argv])
          : rex(['new', r.sessionLabel, '--window', r.tabLabel, '-c', r.cwd, '--', ...argv]);
        const session = created.session_id || r.session;
        const block = created.block_ids?.[0] || created.initial_windows?.[0]?.block_ids?.[0];
        if (!block) throw Error('Rex created a terminal but returned no pane ID; inspect it before retrying');
        const view = rex(['session', 'inspect', session]);
        const tab = view.windows.find(w => w.layers.some(l => l.blocks.some(b => b.block_id === block)));
        if (!tab) throw Error('Created pane is not yet inspectable; inspect Rex before retrying');
        const latest = readRecords(dir).find(v => v.id === r.id) || r;
        writeRecord(dir, { ...latest, session, block, tab: tab.window_id });
        // Update sibling checkpoints to preserve grouping when the old session no longer exists.
        if (!exists) for (const sibling of records.filter(v => v.session === r.session && v.id !== r.id)) {
          sibling.session = session;
          writeRecord(dir, sibling);
        }
        if (!exists) sessions.push(view);
      }
      active.add(r.file);
      report('restored');
    }
    return results;
  } catch (error) {
    error.results = results;
    throw error;
  } finally {
    if (lock !== undefined) { closeSync(lock); unlinkSync(join(dir, '.restore-lock')); }
  }
}
