import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const sourceFunctions = new URL("../../../dot_config/private_fish/exact_functions/", import.meta.url).pathname;
const functions = existsSync(sourceFunctions) ? sourceFunctions : `${os.homedir()}/.config/fish/functions/`;
const window = (id, blocks) => ({ window_id: id, label: "existing", layers: [{ blocks: blocks.map(block_id => ({ block_id, label: "shell" })) }] });

function run(command, { label = "random-name", windows = [window("w", ["b"])], remote, git = true, fail = false, ignoreRename = false, missingEnv = false } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "rex-naming-"));
  try {
    if (git) {
      execFileSync("git", ["init", "-q", dir]);
      if (remote) execFileSync("git", ["-C", dir, "remote", "add", "origin", remote]);
    }
    const state = path.join(dir, "state.json");
    writeFileSync(state, JSON.stringify({ label, windows, calls: [] }));
    writeFileSync(path.join(dir, "rex"), `#!${process.execPath}
const fs = require('node:fs');
const p = process.env.STATE;
const s = JSON.parse(fs.readFileSync(p));
const a = process.argv.slice(2);
if (process.env.FAIL === 'true') process.exit(1);
if (a[1] === 'inspect') {
  console.log(JSON.stringify(a[0] === 'session' ? s : {block: {window_id: s.windows.find(w => w.layers.some(l => l.blocks.some(b => b.block_id === 'b')))?.window_id}}));
} else if (a[1] === 'rename') {
  s.calls.push(a);
  if (process.env.IGNORE_RENAME !== 'true') {
    if (a[0] === 'session') s.label = a.at(-1);
    if (a[0] === 'window') s.windows.find(w => w.window_id === a.at(-2)).label = a.at(-1);
    if (a[0] === 'block') s.windows.flatMap(w => w.layers.flatMap(l => l.blocks)).find(b => b.block_id === a.at(-2)).label = a.at(-1);
  }
  fs.writeFileSync(p, JSON.stringify(s));
} else process.exit(2);
`, { mode: 0o755 });
    const result = spawnSync("fish", ["--no-config", "-c", `source '${functions}rex-name-session.fish'; source '${functions}rex-name-task.fish'; ${command}`], {
      cwd: dir, encoding: "utf8", env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, STATE: state, REX_SESSION: "", REX_BLOCK: missingEnv ? "" : "b", FAIL: String(fail), IGNORE_RENAME: String(ignoreRename) },
    });
    return { ...result, state: JSON.parse(readFileSync(state)), basename: path.basename(dir) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("session names use remote basenames for SSH, HTTPS, and trailing slashes", () => {
  for (const remote of ["git@github.com:owner/dotfiles.git", "https://github.com/owner/dotfiles.git", "ssh://git@github.com/owner/dotfiles.git/"]) {
    const r = run("rex-name-session", { remote });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.state.label, "dotfiles");
  }
});
test("session names fall back to Git root or current directory", () => {
  for (const git of [true, false]) {
    const r = run("rex-name-session", { git });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.state.label, r.basename);
  }
});
test("keep: names, shared layouts, and matching names are unchanged", () => {
  for (const options of [{ label: "keep:incident" }, { windows: [window("w", ["b", "other"])] }, { windows: [window("w", ["b"]), window("other", ["other"])] }, { label: "dotfiles", remote: "git@github.com:owner/dotfiles.git" }]) {
    const r = run("rex-name-session", options);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.state.calls, []);
  }
});
test("task label targets the containing tab, not another tab", () => {
  const r = run("rex-name-task π-test-task", { windows: [window("other", ["other"]), window("w", ["b"])] });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.state.windows[0].label, "existing");
  assert.equal(r.state.windows[1].label, "π-test-task");
});
test("split tabs get pane labels without changing the tab", () => {
  const r = run("rex-name-task π-test-task", { windows: [window("w", ["b", "other"])] });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.state.windows[0].label, "existing");
  assert.equal(r.state.windows[0].layers[0].blocks[0].label, "π-test-task");
});
test("task labels preserve numeric IDs and alphanumeric segments", () => {
  const r = run("rex-name-task π-review-s3-pr-123");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.state.windows[0].label, "π-review-s3-pr-123");
});
test("invalid arguments fail before mutation", () => {
  for (const command of ["rex-name-session extra", "rex-name-task", "rex-name-task invalid", "rex-name-task π-one", "rex-name-task π-too-many-words-in-label", "rex-name-task π-review-PR-123", "rex-name-task π-review-#123"]) {
    const r = run(command);
    assert.equal(r.status, 2, command);
    assert.deepEqual(r.state.calls, []);
  }
});
test("missing environment, inspection errors, and failed verification return failure", () => {
  for (const command of ["rex-name-session", "rex-name-task π-test-task"]) {
    for (const options of [{ missingEnv: true }, { fail: true }, { ignoreRename: true }]) {
      const r = run(command, options);
      assert.notEqual(r.status, 0, `${command}: ${JSON.stringify(options)}`);
    }
  }
});
