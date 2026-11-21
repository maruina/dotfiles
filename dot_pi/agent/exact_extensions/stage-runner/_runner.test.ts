import assert from "node:assert/strict";
import test from "node:test";
import * as fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { events, validate, preflight, prune } from "./_runner.ts";

test("frame on LF bytes, not Unicode separators or transport boundaries", async () => {
  const row = Buffer.from(JSON.stringify({ value: "a\u2028💡" }) + "\n");
  const got: unknown[] = [];
  for await (const event of events(Array.from(row, (b) => Buffer.from([b])))) got.push(event);
  assert.deepEqual(got, [{ value: "a\u2028💡" }]);
});

test("handoff requires matching stage, status, UTF-8 and complete blocker", () => {
  const row = { schemaVersion: 1, stage: "execute", status: "success", summary: "done" };
  assert.equal(validate(Buffer.from(JSON.stringify(row)), "execute").status, "success");
  for (const bytes of [
    Buffer.from([255]),
    Buffer.alloc(65537),
    ...[{ stage: "verify" }, { status: "blocked" }, { summary: " " }, { schemaVersion: 2 }].map((change) =>
      Buffer.from(JSON.stringify({ ...row, ...change })),
    ),
  ]) {
    assert.throws(() => validate(bytes, "execute"));
  }
});

test("prune completed runs only, keeping the newest 100", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prune-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (let i = 100; i <= 201; i++) {
    const dir = path.join(root, "run-" + i + "-abc");
    fs.mkdirSync(dir);
    if (i !== 100) fs.writeFileSync(path.join(dir, "completed"), "ok");
  }
  prune(root);
  assert.equal(fs.readdirSync(root).length, 101);
  assert.ok(fs.existsSync(path.join(root, "run-100-abc")));
  assert.ok(!fs.existsSync(path.join(root, "run-101-abc")));
});

test("reject nested runs, dependent verifier, and already-started plans", () => {
  for (const [plan, ids, nested] of [
    ["- [x] old\n- [ ] new", ["a", "a", "b"], false],
    ["- [ ] new", ["a", "b", "b"], false],
    ["- [ ] new", ["a", "a", "b"], true],
  ] as const) {
    assert.throws(() => preflight(plan, ids, nested));
  }
});
