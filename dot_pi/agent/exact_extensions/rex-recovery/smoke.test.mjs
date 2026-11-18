import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { callRex, checkpoint, restore, readRecords } from './core.mjs';

// All Rex state, its socket, and Pi's agent directory belong to this fixture.
test('real Rex and idle Pi checkpoint, restore, and skip an already-open conversation', { timeout: 45000 }, async t => {
  const root = mkdtempSync(join(tmpdir(), "rex-pi-'smoke-"));
  const endpoint = `unix://${root}/rex.sock`;
  const agent = join(root, 'agent');
  mkdirSync(join(agent, 'extensions'), { recursive: true });
  symlinkSync(dirname(fileURLToPath(import.meta.url)), join(agent, 'extensions/rex-recovery'));
  writeFileSync(join(agent, 'settings.json'), '{}');
  writeFileSync(join(root, 'init.lua'), '');
  const env = { ...process.env, REX_SERVER: endpoint, PI_CODING_AGENT_DIR: agent, XDG_STATE_HOME: join(root, 'state') };
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
  const created = rex(['new', 'Recovery smoke', '-c', root]);
  const session = created.session_id;
  const block = created.initial_windows[0].block_ids[0];
  env.REX_SESSION = session; env.REX_BLOCK = block;
  for (let i = 0; ; i++) {
    const process = rex(['block', 'call', '-s', session, '-b', block, 'process']);
    if (process.foreground?.name === 'fish') break;
    if (i === 50) throw Error('Fixture shell did not become ready: ' + JSON.stringify(process));
    await delay(100);
  }
  const file = join(root, 'conversation.jsonl');
  writeFileSync(file, JSON.stringify({ type: 'session', version: 3, id: '12345678-1234-4234-8234-123456789abc', timestamp: new Date().toISOString(), cwd: root }) + '\n');
  const dir = join(env.XDG_STATE_HOME, 'pi/rex-recovery');
  checkpoint({ dir, file, cwd: root, pid: 1, env, rex });
  assert.equal((await restore({ dir, rex }))[0].action, 'resume');
  assert.equal((await restore({ dir, rex, apply: true }))[0].action, 'restored');
  for (let i = 0; ; i++) {
    const record = readRecords(dir)[0];
    const process = rex(['block', 'call', '-s', session, '-b', block, 'process']);
    if (record.pid === process.foreground?.pid && record.pid !== 1) break;
    if (i === 100) throw Error('Pi did not checkpoint its restored session');
    await delay(100);
  }
  assert.equal(readRecords(dir)[0].file, file);
  assert.equal((await restore({ dir, rex, apply: true }))[0].action, 'already-open');
  const windows = rex(['session', 'inspect', session]).windows;
  assert.equal(windows.length, 1);
  // Destroy only this fixture's session, then prove missing-resource recreation too.
  execFileSync('rex', ['--server', endpoint, '--autostart=false', 'kill', session], { env, timeout: 5000 });
  assert.equal((await restore({ dir, rex, apply: true }))[0].action, 'restored');
  for (let i = 0; ; i++) {
    const record = readRecords(dir)[0];
    const process = rex(['block', 'call', '-s', record.session, '-b', record.block, 'process']);
    if (record.pid === process.foreground?.pid && record.session !== session) break;
    if (i === 100) throw Error('Recreated Pi did not checkpoint its new pane');
    await delay(100);
  }
  assert.equal((await restore({ dir, rex, apply: true }))[0].action, 'already-open');
});
