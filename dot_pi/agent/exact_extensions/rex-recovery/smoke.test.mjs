import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { callRex, restore, readRecords, readProcessTable } from './core.mjs';

// All Rex state, its socket, and Pi's agent directory belong to this fixture.
test('save and restore Pi across private Rex sessions and return to Fish', { timeout: 90000 }, async t => {
  const root = mkdtempSync(join(tmpdir(), "rex-pi-'smoke-\\-"));
  const endpoint = `unix://${root}/rex.sock`;
  const agent = join(root, 'agent');
  mkdirSync(join(agent, 'extensions'), { recursive: true });
  symlinkSync(dirname(fileURLToPath(import.meta.url)), join(agent, 'extensions/rex-recovery'));
  writeFileSync(join(agent, 'settings.json'), '{}');
  writeFileSync(join(root, 'init.lua'), '');
  const env = { ...process.env, HOME: root, XDG_CONFIG_HOME: join(root, 'config'), REX_SERVER: endpoint, PI_CODING_AGENT_DIR: agent, PI_OFFLINE: '1', XDG_STATE_HOME: join(root, 'state') };
  delete env.REX_SESSION; delete env.REX_BLOCK; delete env.PI_REX_RECOVERY_ID;
  const log = openSync(join(root, 'server.log'), 'w');
  const server = spawn('rex', ['server', 'run', '--listen', endpoint, '--state-dir', join(root, 'rex'), '--config', join(root, 'init.lua')], { env, stdio: ['ignore', log, log] });
  closeSync(log);
  t.after(async () => {
    server.kill('SIGTERM');
    for (let i = 0; i < 50 && server.exitCode === null; i++) await delay(50);
    if (server.exitCode === null && server.signalCode === null) server.kill('SIGKILL');
    rmSync(root, { recursive: true, force: true });
  });
  function rex(args) {
    const keys = ['REX_SERVER', 'REX_SESSION', 'REX_BLOCK'];
    const previous = keys.map(key => process.env[key]);
    try {
      for (const key of keys) {
        if (env[key] === undefined) delete process.env[key];
        else process.env[key] = env[key];
      }
      return callRex(args);
    } finally {
      keys.forEach((key, i) => {
        if (previous[i] === undefined) delete process.env[key];
        else process.env[key] = previous[i];
      });
    }
  }
  for (let i = 0; ; i++) {
    try { rex(['whoami']); break; } catch (e) { if (i === 50) throw e; await delay(100); }
  }
  const dir = join(env.XDG_STATE_HOME, 'pi/rex-recovery');
  const files = Array.from({ length: 4 }, (_, i) => {
    const file = join(root, `conversation-${i}.jsonl`);
    writeFileSync(file, JSON.stringify({ type: 'session', version: 3, id: `12345678-1234-4234-8234-123456789ab${i}`, timestamp: new Date().toISOString(), cwd: root }) + '\n');
    return file;
  });
  const quote = s => `'${s.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
  const launch = file => ['fish', '-i', '--init-command', `pi --session ${quote(file)}`];
  const waitFor = async (predicate, message) => {
    for (let i = 0; i < 150; i++) { if (predicate()) return; await delay(100); }
    throw Error(message);
  };
  const first = rex(['new', 'First', '--window', 'One', '-c', root, '--', 'fish', '-i']);
  const firstBlock = first.initial_windows[0].block_ids[0];
  await waitFor(() => rex(['block', 'call', '-s', first.session_id, '-b', firstBlock, 'process']).foreground?.name === 'fish', 'Fish fixture did not start');
  rex(['send', '-s', first.session_id, '-b', firstBlock, `pi --session ${quote(files[0])}`]);
  rex(['send-key', '-s', first.session_id, '-b', firstBlock, 'enter']);
  const second = rex(['new', 'Second', '--window', 'Two', '-c', root, '--', ...launch(files[1])]);
  rex(['window', 'new', '-s', first.session_id, 'Three', '-c', root, '--', ...launch(files[2])]);
  const closed = rex(['window', 'new', '-s', first.session_id, 'Closed', '-c', root, '--', ...launch(files[3])]);
  await waitFor(() => readRecords(dir).length === 4, 'Pi fixtures did not checkpoint');
  execFileSync('rex', ['--server', endpoint, '--autostart=false', 'window', 'close', '-s', first.session_id, closed.window_id], { env, timeout: 5000 });
  const cli = join(dirname(fileURLToPath(import.meta.url)), 'cli.mjs');
  const saved = JSON.parse(execFileSync('node', [cli, '--save', '--json'], { env, encoding: 'utf8', timeout: 30000 }));
  assert.deepEqual(saved.results.map(r => r.file).sort(), files.slice(0, 3).sort());
  assert.ok(readRecords(dir).some(r => r.file === files[3]));
  for (const session of [first.session_id, second.session_id]) execFileSync('rex', ['--server', endpoint, '--autostart=false', 'kill', session], { env, timeout: 5000 });
  const preview = JSON.parse(execFileSync('node', [cli, '--json'], { env, encoding: 'utf8', timeout: 30000 }));
  assert.deepEqual(preview.results.map(r => r.action), ['create-tab', 'create-tab', 'create-tab']);
  assert.deepEqual((await restore({ dir, rex })).map(r => r.action), ['create-tab', 'create-tab', 'create-tab']);
  assert.deepEqual((await restore({ dir, rex, apply: true })).map(r => r.action), ['restored', 'restored', 'restored']);
  await waitFor(() => {
    const rows = readProcessTable();
    return readRecords(dir).filter(r => files.slice(0, 3).includes(r.file)).every(r => {
      const process = rex(['block', 'call', '-s', r.session, '-b', r.block, 'process']);
      const foreground = rows.find(p => p.pid === process.foreground?.pid);
      const pi = rows.find(p => p.pid === r.pid && p.startTime === r.startTime);
      return foreground && pi && pi.pgid === foreground.pgid && pi.tpgid === foreground.tpgid;
    });
  }, 'Restored Pi instances did not checkpoint');
  const restored = readRecords(dir).filter(r => files.slice(0, 3).includes(r.file));
  const sessionCounts = new Map();
  for (const r of restored) sessionCounts.set(r.session, (sessionCounts.get(r.session) || 0) + 1);
  assert.deepEqual([...sessionCounts.values()].sort(), [1, 2]);
  assert.deepEqual((await restore({ dir, rex, apply: true })).map(r => r.action), ['already-open', 'already-open', 'already-open']);
  assert.deepEqual([...sessionCounts.keys()].map(s => rex(['session', 'inspect', s]).windows.length).sort(), [1, 2]);
  const savedAgain = JSON.parse(execFileSync('node', [cli, '--save', '--json'], { env, encoding: 'utf8', timeout: 30000 }));
  assert.deepEqual(savedAgain.results.map(r => r.file).sort(), files.slice(0, 3).sort());
  const target = restored[0];
  rex(['send', '-s', target.session, '-b', target.block, '/quit']);
  rex(['send-key', '-s', target.session, '-b', target.block, 'enter']);
  await waitFor(() => !readProcessTable().some(p => p.pid === target.pid && p.startTime === target.startTime) && rex(['block', 'call', '-s', target.session, '-b', target.block, 'process']).foreground?.name === 'fish', 'Fish did not remain after Pi exited');
  rex(['send', '-s', target.session, '-b', target.block, 'echo REX_RECOVERY_FISH_OK']);
  rex(['send-key', '-s', target.session, '-b', target.block, 'enter']);
  await waitFor(() => /^REX_RECOVERY_FISH_OK\r?$/m.test(execFileSync('rex', ['--server', endpoint, '--autostart=false', 'capture', '-s', target.session, '-b', target.block, '--trim'], { env, encoding: 'utf8', timeout: 5000 })), 'Fish did not accept a command');
});
