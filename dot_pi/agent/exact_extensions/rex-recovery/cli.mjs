import { checkpoint, restore, saveSnapshot, stateDir } from './core.mjs';

const args = process.argv.slice(2);
const json = args.includes('--json') || !process.stdout.isTTY;
const saving = args[0] === '--save';
try {
  if (args[0] === '--checkpoint') {
    if (args.length !== 4 || !/^\d+$/.test(args[3])) throw Error('Invalid checkpoint arguments');
    checkpoint({ file: args[1], cwd: args[2], pid: Number(args[3]) });
  } else if (args.includes('--help')) {
    console.log(saving
      ? 'Usage: pi-save [--json]\nSave the active Pi conversations across the local Rex server. Run before an update. State: ' + stateDir()
      : 'Usage: pi-restore [--apply] [--json]\nPreview the pi-save snapshot. --apply opens saved conversations without a model prompt.\nDo not use target panes during restore. State: ' + stateDir());
  } else if (saving) {
    if (args.slice(1).some(a => a !== '--json')) throw Error('Unknown argument; use --help');
    const results = await saveSnapshot();
    console.log(json ? JSON.stringify({ schemaVersion: 1, results }) : `Saved ${results.length} Pi conversation(s).`);
  } else {
    if (args.some(a => !['--apply', '--json'].includes(a))) throw Error('Unknown argument; use --help');
    const results = await restore({ apply: args.includes('--apply') });
    console.log(json ? JSON.stringify({ schemaVersion: 1, results }) :
      results.map(r => `${r.action}: ${r.session} / ${r.tab} (${r.file})`).join('\n') || 'The recovery snapshot is empty.');
  }
} catch (error) {
  const result = { schemaVersion: 1, error: { code: 'recovery_failed', message: error.message, retryable: false }, results: error.results || [] };
  if (json) console.log(JSON.stringify(result));
  else console.error(`${saving ? 'pi-save' : 'pi-restore'}: ${error.message}`);
  process.exitCode = 1;
}
