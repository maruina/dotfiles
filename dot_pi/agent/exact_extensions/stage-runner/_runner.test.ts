import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { activeSlice, events, validate, preflight, prune, runDesign } from "./_runner.ts";

import { createServer } from "node:net";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import stageRunner, { phaseDisplay, rexActivity } from "./index.ts";
import { sessionInfo } from "./_recovery.ts";
import { arpTool, createDirectArpCaller, reviewPublished } from "./_arp.ts";

test("Rex activity writes only bounded child records on transitions", () => {
  const writes: string[] = [];
  const activity = rexActivity(sequence => writes.push(sequence));
  const prev = process.env.PI_PROGRAM_STATUS;
  try {
    process.env.PI_PROGRAM_STATUS = "0";
    activity.phase("publish");
    assert.deepEqual(writes, []);
    process.env.PI_PROGRAM_STATUS = "1";
    activity.permission("confirm");
    activity.phase("startup");
    activity.phase("execute");
    activity.phase("execute");
    const recoveryMessage = "Fix the Verify failure in the Recovery pane, then exit Pi to continue.";
    activity.recovery(recoveryMessage);
    activity.permission("approve");
    activity.phase("verify");
    for (const state of ["done", "error", "idle", "clear"] as const) activity.end(state);
    const expected = (state: string, message = "", kind = "") => `\x1b]7501;state=${state}:id=stage-runner:app=pi-stage-runner${kind && ":kind=" + kind}${message && ":msg=" + Buffer.from(message).toString("base64")}\x1b\\`;
    assert.deepEqual(writes, [expected("blocked", "confirm", "permission"), expected("working", "startup"), expected("working", "execute"),
      expected("blocked", recoveryMessage, "question"), expected("blocked", "approve", "permission"), expected("working", "verify"),
      ...["done", "error", "idle", "clear"].map(s => expected(s))]);
    activity.permission("a\x1bb" + "é".repeat(2048));
    assert.equal(writes.at(-1), expected("blocked", "a b" + "é".repeat(1022), "permission"));
  } finally {
    if (prev === undefined) delete process.env.PI_PROGRAM_STATUS;
    else process.env.PI_PROGRAM_STATUS = prev;
  }
});

test("shutdown clears the runner record after cancellation removes its widget", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rex-"));
  const server = createServer();
  const socket = path.join(dir, "r");
  await new Promise<void>((resolve, reject) => server.once("error", reject).listen(socket, resolve));
  t.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const endpoint = "unix://" + socket;
  const overrides = { REX_SERVER: endpoint, REX_SESSION: "session:test", REX_BLOCK: "block:test", PI_STAGE_RUNNER_CHILD: "0", PI_PROGRAM_STATUS: "1" };
  for (const [name, value] of Object.entries(overrides)) {
    const previous = process.env[name];
    process.env[name] = value;
    t.after(() => { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; });
  }
  const writes: string[] = [];
  let start!: (arg: string, ctx: unknown) => Promise<void>, shutdown!: () => Promise<void>;
  let removed!: () => void;
  const cleared = new Promise<void>(resolve => { removed = resolve; });
  stageRunner({
    registerEntryRenderer() {}, appendEntry() {},
    registerCommand(name: string, command: { handler: typeof start }) { if (name === "stage-runner") start = command.handler; },
    on(_event: string, handler: typeof shutdown) { shutdown = handler; },
    exec: async () => ({ code: 0, stdout: JSON.stringify({ endpoint, principal: { kind: "peer", transport: "unix", uid: process.getuid!() }, session_id: overrides.REX_SESSION, block_id: overrides.REX_BLOCK }) }),
  } as unknown as ExtensionAPI);
  await start("plan.md", { hasUI: true, scopedModels: [{ model: { provider: "p", id: "m" } }], ui: {
    select: async () => undefined, notify() {},
    setWidget(_key: string, factory?: (tui: unknown) => { render(): string[] }) {
      if (!factory) return removed();
      assert.deepEqual(factory({ terminal: { write: (value: string) => writes.push(value) } }).render(), []);
    },
  } });
  await cleared;
  assert.deepEqual(writes, ["\x1b]7501;state=idle:id=stage-runner:app=pi-stage-runner\x1b\\"]);
  await shutdown();
  assert.equal(writes.at(1), "\x1b]7501;state=clear:id=stage-runner:app=pi-stage-runner\x1b\\");
});

test("active slice follows committed progress within and across slices", () => {
  const first = "### Slice 1: First\n- [x] one\n- [ ] two\n";
  const second = "### Slice 2: Second\n- [ ] three\n";
  assert.deepEqual(activeSlice(first + second), { number: 1, title: "First" });
  assert.deepEqual(activeSlice(first.replace("[ ]", "[x]") + second), { number: 2, title: "Second" });
});

test("active slice ignores ungrouped tasks and fenced headings and tasks", () => {
  assert.equal(activeSlice("- [ ] ungrouped"), undefined);
  assert.equal(activeSlice("~~~md\n### Slice 1: Example\n- [ ] fake\n~~~\n- [ ] real"), undefined);
  assert.equal(activeSlice("### Slice 1: First\n````md\n```\n- [ ] fake\n````\n## Other\n- [ ] real"), undefined);
  assert.equal(activeSlice("### Slice 1: First\n### Slice 2\n- [ ] untitled"), undefined);
});

test("execute widget uses the plan slice and replaces control characters before capping the title", () => {
  let widget: string[] | undefined;
  const display = phaseDisplay(lines => { widget = lines; }, () => {}, () => {}, () => 0);
  try {
    display.onEvent({ type: "phase", phase: "execute", launch: 3, at: 0,
      slice: { number: 1, title: "First" } });
    assert.deepEqual(widget, ["execute slice 1: First · 00:00"]);
    display.onEvent({ type: "phase", phase: "execute", launch: 4, at: 0,
      slice: { number: 2, title: "A\x1b\x9b" + "é".repeat(58) } });
    assert.deepEqual(widget, ["execute slice 2: A??" + "é".repeat(56) + "… · 00:00 | execute 00:00"]);
  } finally {
    display.finish("complete");
  }
});

test("phase ticks update only the widget and exit freezes the total", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let now = 0;
  const lines: (string[] | undefined)[] = [], entries: string[] = [];
  const display = phaseDisplay(value => lines.push(value), value => entries.push(value), () => {}, () => now);
  assert.deepEqual(lines, []);
  display.onEvent({ type: "phase", phase: "startup", at: now });
  assert.deepEqual(lines.at(-1), ["startup · 00:00"]);
  now = 1000;
  display.onEvent({ type: "phase", phase: "execute", launch: 1, at: now });
  now += 2000;
  t.mock.timers.tick(1000);
  assert.deepEqual(lines.at(-1), ["execute slice 1 · 00:02 | startup 00:01"]);
  display.onEvent({ type: "phase", phase: "verify", launch: 2, at: now });
  now += 1000;
  t.mock.timers.tick(1000);
  assert.deepEqual(lines.at(-1), ["verify 2 of 3 · 00:01 | startup 00:01 · execute 00:02"]);
  assert.deepEqual(entries, []);
  display.finish("stopped");
  t.mock.timers.tick(1000);
  assert.equal(lines.at(-1), undefined);
  assert.deepEqual(entries, ["stopped | startup 00:01 · execute 00:02 · verify 00:01"]);
});

test("createDirectArpCaller initializes Streamable HTTP MCP, handles JSON/SSE, refreshes on 401, resets on 404, and redacts tokens", async () => {
  const seen: Array<{ method: string; auth: string | null; session: string | null; rawTool?: string }> = [];
  let tokenCount = 0;
  let expiredOnce = false;
  let resetOnce = false;
  const fetchImpl: typeof fetch = async (_url, init) => {
    const headers = init?.headers as Record<string, string>;
    const body = JSON.parse(String(init?.body ?? "{}"));
    seen.push({
      method: body.method,
      auth: headers.Authorization ?? null,
      session: headers["Mcp-Session-Id"] ?? null,
      rawTool: body.params?.name,
    });
    if (body.method === "initialize") {
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-03-26" } }),
        { status: 200, headers: { "Content-Type": "application/json", "Mcp-Session-Id": `sess-${seen.length}` } },
      );
    }
    if (body.method === "notifications/initialized") {
      return new Response(null, { status: 202 });
    }
    if (body.params?.name === "agentic_review_get_status" && !expiredOnce) {
      expiredOnce = true;
      return new Response("unauthorized", { status: 401 });
    }
    if (body.params?.name === "agentic_review_get_findings" && !resetOnce) {
      resetOnce = true;
      return new Response("not found", { status: 404 });
    }
    if (body.params?.name === "agentic_review_get_findings") {
      const sse = `event: message\ndata: ${JSON.stringify({
        jsonrpc: "2.0",
        id: body.id,
        result: { isError: false, structuredContent: { scope: "pull_request", findings: [], echo: "tok-2" } },
      })}\n\n`;
      return new Response(sse, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    }
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: body.id,
        result: { isError: false, structuredContent: { status: "REVIEW_STATUS_NO_ISSUES_FOUND", head_sha: "a".repeat(40) } },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  const callArp = createDirectArpCaller({
    endpoint: "https://arp.test/internal/mcp",
    fetchImpl,
    tokenProvider: async () => `tok-${++tokenCount}`,
  });
  const signal = new AbortController().signal;
  const status = await callArp(
    { name: arpTool("get_status"), head: "a".repeat(40), input: { owner: "ddoghq", repo: "demo", pull_number: 1 } },
    signal,
    5000,
  );
  assert.equal(status?.status, "REVIEW_STATUS_NO_ISSUES_FOUND");
  assert.equal(tokenCount, 2, "must refresh token once on 401");

  const findings = await callArp(
    { name: arpTool("get_findings"), head: "a".repeat(40), input: { owner: "ddoghq", repo: "demo", pull_number: 1, status: "open" } },
    signal,
    5000,
  );
  assert.equal(findings?.scope, "pull_request");
  assert.equal(findings?.echo, "[redacted]", "must redact bearer token from response text");
  assert.equal(seen.filter((s) => s.method === "initialize").length, 2, "must re-initialize once after 404");

  await assert.rejects(
    () => callArp(
      { name: arpTool("resolve_finding"), head: "a".repeat(40), input: { resolution: "invalid" } },
      signal,
      5000,
    ),
    /Invalid ARP operation/,
  );
  await assert.rejects(
    () => callArp(
      { name: "mcp__agentic_review__evil_tool", head: "a".repeat(40), input: {} },
      signal,
      5000,
    ),
    /Invalid ARP operation/,
  );
});

for (const outcome of ["matching", "dismissed", "wrong-sha", "drift"] as const) {
  test(`ARP settlement reconciles ${outcome} without an unauthorized write`, async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arp-settlement-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const target = { owner: "fixture", repo: "demo", pull_number: 1 };
    const head = "a".repeat(40), reviewedSha = "b".repeat(40);
    const operations: string[] = [];
    const result = reviewPublished({
      dir, repo: "fixture/demo", number: 1, url: "https://github.com/fixture/demo/pull/1", head,
      signal: new AbortController().signal, onEvent() {},
      fixes: [{ id: 42, fixSha: head, reviewedSha, changeSummary: "Keep the lock" }],
      async checkHead() {
        if (outcome === "drift") throw Error("Published PR changed");
      },
      async call({ name, input }) {
        operations.push(name);
        if (name === arpTool("get_status")) return { ...target, head_sha: head, status: "REVIEW_STATUS_NO_ISSUES_FOUND" };
        assert.equal(name, arpTool("get_findings"));
        const findings = input.status === "open" ? [] : [{ finding_id: 42, reviewed_sha: reviewedSha,
          status: outcome === "dismissed" ? "dismissed" : outcome === "drift" ? "open" : "addressed",
          settlement: outcome === "drift" ? undefined : {
            resolution: outcome === "dismissed" ? "invalid" : "addressed", fix_commit_sha: outcome === "wrong-sha" ? reviewedSha : head,
          },
        }];
        return { ...target, scope: "pull_request", status_filter: input.status, reviewed_sha: head,
          review_in_progress: false, finding_count: findings.length, findings };
      },
    });
    if (outcome === "matching") {
      assert.deepEqual(await result, []);
      assert.deepEqual(operations, [arpTool("get_findings"), arpTool("get_status"), arpTool("get_findings")]);
    } else {
      await assert.rejects(result, outcome === "drift" ? /Published PR changed/ : /conflicting permanent outcome/);
      assert.deepEqual(operations, [arpTool("get_findings")]);
    }
  });
}

test("record selected and actual assistant models; reject unknown provenance", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "session-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const rows = [
    { type: "session", id: "saved", cwd: dir },
    { type: "model_change", provider: "p", modelId: "p/a" },
    { type: "message", message: { role: "assistant", provider: "p", model: "b" } },
  ];
  const file = path.join(dir, "saved.jsonl");
  fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + "\n", { mode: 0o600 });
  assert.deepEqual(sessionInfo(dir, dir, "saved").models, ["p/a", "p/b"]);
  assert.throws(() => sessionInfo(dir, dir, "other"));
  fs.appendFileSync(file, '{"type":"model_change"}\n');
  assert.throws(() => sessionInfo(dir, dir, "saved"));
});

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

test("design refuses the shared worktree lock without opening a child", async (t) => {
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "design-lock-")));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const cwd = path.join(temp,"work"), root = path.join(temp,"runs");
  fs.mkdirSync(cwd); fs.mkdirSync(root,{mode:0o700});
  const env = { ...process.env, PI_STAGE_RUNNER_CHILD:"", GIT_CONFIG_GLOBAL:"/dev/null", GIT_CONFIG_NOSYSTEM:"1" };
  const git = (...args: string[]) => execFileSync("git",args,{cwd,env,stdio:"pipe"});
  git("init","-b","feature"); git("-c","user.name=Fixture","-c","user.email=fixture@example.org","commit","--allow-empty","-qm","base");
  const lock = path.join(root,"lock-"+createHash("sha256").update(cwd).digest("hex"));
  fs.writeFileSync(lock,"existing owner",{mode:0o600});
  const author = {provider:"p", id:"a", thinking:"off"};
  await assert.rejects(runDesign({cwd,root,env,author,reviewer:{...author,id:"b"},brief:"fixture",progress() {},signal:new AbortController().signal}), /EEXIST/);
  assert.equal(fs.readFileSync(lock,"utf8"),"existing owner");
});

test("design handoffs bind each stage to its revision fields", () => {
  const sha = "a".repeat(40);
  for (const [stage, fields] of [["design-draft", {designPath: "plans/demo/design.md", draftCommit: sha}], ["design-review", {status:"clean", reviewedBlob:sha}], ["design-plan", {planPath:"plans/demo/plan.md",planCommit:sha}]] as const) {
    const bytes = (extra: object) => Buffer.from(JSON.stringify({ schemaVersion:1,stage,summary:"done",...extra }));
    assert.equal(validate(bytes(fields),stage).stage,stage);
    assert.throws(() => validate(bytes({}),stage));
    if (stage === "design-review") {
      assert.throws(() => validate(bytes({...fields,status:"needs-human"}),stage));
      assert.equal(validate(bytes({...fields,status:"needs-human",questions:["Which scope?"]}),stage).status,"needs-human");
    }
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

test("preflight ignores checkboxes and ledger markers inside fenced code blocks", () => {
  const plan = [
    "### Slice 1: Example",
    "```md",
    "- [x] example completed",
    "- [ ] example pending",
    "**Execution writer:** p/a",
    "```",
    "- [ ] real task",
  ].join("\n");
  assert.doesNotThrow(() => preflight(plan, ["a", "a", "b"], false));
  assert.throws(() => preflight("```md\n- [ ] only fenced\n```", ["a", "a", "b"], false));
});
