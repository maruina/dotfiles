import { checkpoint, restore, stateDir } from './core.mjs';

const args = process.argv.slice(2);
const json = args.includes('--json') || !process.stdout.isTTY;
try {
  if (args[0] === '--checkpoint') {
    if (args.length !== 4 || !/^\d+$/.test(args[3])) throw Error('Invalid checkpoint arguments');
    checkpoint({ file: args[1], cwd: args[2], pid: Number(args[3]) });
  } else if (args.includes('--help')) {
    console.log('Usage: pi-restore [--apply] [--json]\nPreview saved Rex Pi sessions. --apply opens them without a model prompt.\nDo not use target panes during restore. Records: ' + stateDir());
  } else {
    if (args.some(a => !['--apply', '--json'].includes(a))) throw Error('Unknown argument; use --help');
    const results = await restore({ apply: args.includes('--apply') });
    console.log(json ? JSON.stringify({ schemaVersion: 1, results }) :
      results.map(r => `${r.action}: ${r.session} / ${r.tab} (${r.file})`).join('\n') || 'No saved Rex Pi sessions. Run /reload in Pi to enable checkpoints.');
  }
} catch (error) {
  const result = { schemaVersion: 1, error: { code: 'recovery_failed', message: error.message, retryable: false }, results: error.results || [] };
  if (json) console.log(JSON.stringify(result));
  else console.error(`pi-restore: ${error.message}`);
  process.exitCode = 1;
}
