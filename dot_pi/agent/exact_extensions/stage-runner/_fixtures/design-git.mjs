#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
const args = process.argv.slice(2), { REAL_GIT: git, FAIL, ARGV_LOG: log } = process.env;
const beforeCheck = FAIL === 'pre-check' && args[0] === 'status';
const duringCommit = FAIL === 'approval-race' && args[0] === 'commit' && args.includes('--only');
// Run the competing client to completion before forwarding the intercepted command.
if ((beforeCheck || duringCommit) && fs.existsSync(log+'.reviewed')) {
  fs.unlinkSync(log+'.reviewed');
  const rel = 'plans/demo/design.md';
  fs.writeFileSync(rel, '# Competing edit\nStatus: Draft\n');
  execFileSync(git,['commit','--only','-qm','competing edit','--',rel]);
  fs.writeFileSync(log+'.competing',execFileSync(git,['rev-parse','HEAD']));
}
process.exit(spawnSync(git,args,{stdio:'inherit'}).status ?? 1);
