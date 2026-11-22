import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const env = process.env, args = process.argv.slice(2), prompt = args.at(-1), value = flag => args[args.indexOf(flag)+1];
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trimEnd();
const rel = 'plans/demo/design.md', plan = 'plans/demo/plan.md';
const stage = env.PI_DESIGN_STAGE ?? 'design-review';
const id = 'fixture-' + stage;
if (args.includes('--session')) {
  assert.equal(value('--model'),'reviewer');
  assert.equal(env.PI_DESIGN_HANDOFF,undefined);
  const saved = JSON.parse(fs.readFileSync(value('--session'),'utf8').split('\n')[0]);
  fs.appendFileSync(env.ARGV_LOG+'.resumed',saved.id+'\n');
  if (env.FAIL === 'blocker-cancel') await new Promise(resolve=>setTimeout(resolve,30000));
  process.exit(0);
}
if (args.includes('--session-dir')) {
  const rows = [{type:'session', id, cwd:process.cwd()}, {type:'model_change', provider:'p', modelId:env.FAIL === 'overlap' && stage === 'design-review' ? 'author' : value('--model')}];
  fs.writeFileSync(path.join(value('--session-dir'), id+'.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n')+'\n',{mode:0o600});
}
let result, out = env.PI_DESIGN_HANDOFF;
if (env.FAIL === 'switch' && stage === 'design-draft') fs.appendFileSync(path.join(value('--session-dir'), id+'.jsonl'),JSON.stringify({type:'model_change',provider:'p',modelId:'reviewer'})+'\n');
if (stage !== 'design-review') assert.match(prompt,/Stay in the current worktree and branch/);
fs.appendFileSync(env.ARGV_LOG, stage+'\n');
if (stage === 'design-draft') {
  if (!env.FAIL) {
    const release = env.ARGV_LOG+'.continue';
    await new Promise(resolve => {
      const watcher = fs.watch(path.dirname(release), () => { if (fs.existsSync(release)) { watcher.close(); resolve(); } });
      fs.writeFileSync(env.ARGV_LOG+'.first-turn','waiting for user');
    });
  }
  if (env.FAIL === 'early') process.exit(0);
  fs.mkdirSync('plans/demo',{recursive:true}); fs.writeFileSync(rel,'# Demo\nStatus: '+(env.FAIL === 'header' ? 'Approved' : 'Draft')+'\n');
  git('add',rel);git('commit','-qm','draft'); result = {designPath:env.FAIL === 'path' ? 'plans/demo with space/design.md' : rel,draftCommit:git('rev-parse','HEAD')};
} else if (stage === 'design-review') {
  const draftBlob = git('rev-parse','HEAD:'+rel);
  if (env.FAIL?.startsWith('corrected')) {
    fs.appendFileSync(rel,'See correct.md\n');
    if (env.FAIL === 'corrected-header') fs.writeFileSync(rel,'# Demo\nStatus: Approved\n');
    if (env.FAIL === 'corrected-other') fs.writeFileSync('other','unrelated');
    git('add','.');git('commit','-qm','Fix "reference"');
  }
  if (env.FAIL === 'dirty') fs.writeFileSync('unrelated','uncommitted');
  out = JSON.parse(prompt.match(/to (".*?") with schemaVersion/)[1]);
  console.log(JSON.stringify({type:'session',id:env.FAIL === 'blocker-session' ? 'wrong' : id}));
  result = {status:'clean',reviewedBlob:env.FAIL === 'corrected-stale' ? draftBlob : env.FAIL === 'stale' ? '1'.repeat(40) : git('rev-parse','HEAD:'+rel)};
  if (env.FAIL?.startsWith('blocker')) Object.assign(result,{status:'needs-human',questions:['Which behavior?']});
  console.log(JSON.stringify({type:'agent_settled',aborted:false}));
} else {
  assert.equal(git('status','--porcelain'),''); assert.equal(git('branch','--show-current'),'feature');
  assert.equal(fs.statSync(env.PI_DESIGN_INPUT).mode & 0o777,0o600);
  const data = JSON.parse(fs.readFileSync(env.PI_DESIGN_INPUT));
  assert.equal(data.designPath,path.join(process.cwd(),rel));
  if (env.FAIL === 'corrected') {
    assert.match(data.correctionSummary,/Fix "reference"\n[\s\S]*design\.md/);
    const {expandPromptTemplate} = await import('../../../node_modules/@earendil-works/pi-coding-agent/dist/core/prompt-templates.js');
    const content = fs.readFileSync(new URL('../../../exact_prompts/plan.md',import.meta.url),'utf8');
    const expanded = expandPromptTemplate(prompt,[{name:'plan',content}]);
    assert.ok(expanded.includes('PI_DESIGN_INPUT') && !expanded.includes(data.designPath) && !expanded.includes('Fix "reference"'));
  } else assert.equal(data.correctionSummary,'');
  if (env.FAIL === 'no-plan') process.exit(0);
  if (env.FAIL === 'reverted') { fs.writeFileSync('other','edit');git('add','other');git('commit','-qm','unrelated');git('revert','--no-edit','HEAD'); }
  fs.writeFileSync(plan,'# Plan\n');git('add',plan);git('commit','-qm','plan');result = {planPath:plan,planCommit:git('rev-parse','HEAD')};
}
fs.writeFileSync(out,env.FAIL === 'invalid' && stage === 'design-review' ? '{' : JSON.stringify({schemaVersion:1,stage,summary:'Fixture',...result}),{mode:0o600});
if (stage === 'design-review') fs.writeFileSync(env.ARGV_LOG+'.reviewed','1');
