import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { commentLink, diffAnchor, inline, render, validate, words } from "./render.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const example = () => JSON.parse(readFileSync(path.join(here, "example.json"), "utf8"));
const REVIEWER_QUESTION_IDS = [
  "change-purpose",
  "necessity",
  "changed-files",
  "hard-to-reverse-contracts",
  "go-interfaces",
  "bootstrap-cycles",
  "failure-observability",
  "manual-inspection",
];
const PR_URL = "https://github.com/example-org/example-service/pull/42";
const PR_HEAD_SHA = "0123456789abcdef0123456789abcdef01234567";

// One uncovered addition hunk, a deletion-only hunk, a replacement hunk, and three
// files without usable line data: binary, pure rename, and metadata-only.
const THREE_PART_DIFF = [
  "diff --git a/src/app.js b/src/app.js",
  "index 1111111..2222222 100644",
  "--- a/src/app.js",
  "+++ b/src/app.js",
  "@@ -1,3 +1,4 @@",
  " one",
  " two",
  "+three",
  " four",
  "@@ -20,2 +21,3 @@",
  " twenty",
  "+twenty-one",
  " twenty-two",
  "diff --git a/src/old.js b/src/old.js",
  "deleted file mode 100644",
  "--- a/src/old.js",
  "+++ /dev/null",
  "@@ -1,2 +0,0 @@",
  "-gone-one",
  "-gone-two",
  "diff --git a/docs/notes.md b/docs/notes.md",
  "index 3333333..4444444 100644",
  "--- a/docs/notes.md",
  "+++ b/docs/notes.md",
  "@@ -5 +5 @@",
  "-old note",
  "+new note",
  "diff --git a/assets/logo.png b/assets/logo.png",
  "index 5555555..6666666 100644",
  "Binary files a/assets/logo.png and b/assets/logo.png differ",
  "diff --git a/src/legacy.js b/src/renamed.js",
  "similarity index 100%",
  "rename from src/legacy.js",
  "rename to src/renamed.js",
].join(String.fromCharCode(10));

function evidenceFixture(mutate = () => {}) {
  const value = {
    schemaVersion: 1,
    collection: {
      status: "complete",
      sources: { metadata: { status: "complete" }, diff: { status: "complete" } },
    },
    pr: {
      url: PR_URL,
      headRefOid: PR_HEAD_SHA,
      changedFiles: 6,
      additions: 4,
      deletions: 3,
      files: [
        { path: "src/app.js", additions: 2, deletions: 0, changeType: "MODIFIED" },
        { path: "src/old.js", additions: 0, deletions: 2, changeType: "DELETED" },
        { path: "docs/notes.md", additions: 1, deletions: 1, changeType: "MODIFIED" },
        { path: "assets/logo.png", additions: 0, deletions: 0, changeType: "MODIFIED" },
        { path: "src/renamed.js", additions: 0, deletions: 0, changeType: "RENAMED" },
        { path: "src/config.yaml", additions: 1, deletions: 0, changeType: "MODIFIED" },
      ],
    },
    diff: THREE_PART_DIFF,
  };
  mutate(value);
  return value;
}

function coverageHtml(html) {
  const start = html.indexOf('id="line-coverage"');
  return start < 0 ? "" : html.slice(start, html.indexOf("</details>", start));
}

function runCli(t, report, evidence) {
  const dir = mkdtempSync(path.join(tmpdir(), "prv-render-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const input = path.join(dir, "report.json");
  const output = path.join(dir, "report.html");
  writeFileSync(input, JSON.stringify(report));
  const args = [path.join(here, "render.mjs"), input, "--out", output];
  if (evidence === null) {
    args.push("--evidence", path.join(dir, "missing-evidence.json"));
  } else if (evidence !== undefined) {
    const evidencePath = path.join(dir, "evidence.json");
    writeFileSync(evidencePath, typeof evidence === "string" ? evidence : JSON.stringify(evidence));
    args.push("--evidence", evidencePath);
  }
  const result = spawnSync(process.execPath, args, { encoding: "utf8" });
  return { result, html: existsSync(output) ? readFileSync(output, "utf8") : null };
}

test("line coverage shows uncovered added lines, deletions, and unmeasured files", (t) => {
  const report = example();
  report.walkthrough.steps[0].refs = [{ path: "src/app.js", side: "R", start: 3, end: 3 }];
  report.items[0].refs = [{ path: "docs/notes.md", side: "R", start: 5, end: 5 }];

  const { result, html } = runCli(t, report, evidenceFixture());
  assert.equal(result.status, 0, result.stderr);
  assert.ok(html, "report HTML was written");
  assert.match(html, /<h1>Request changes<\/h1>/);
  const coverage = coverageHtml(html);
  assert.match(coverage, /Observed added lines: <strong>3<\/strong>/);
  assert.match(coverage, /Covered: <strong>2<\/strong>/);
  assert.match(coverage, /Uncovered: <strong>1<\/strong>/);
  assert.match(coverage, /<td>Uncovered<\/td><td><code>src\/app\.js<\/code><\/td><td><a [^>]*>22<\/a><\/td>/);
  assert.doesNotMatch(coverage, /<code>src\/app\.js<\/code><\/td><td><a [^>]*>3<\/a>/);
  assert.match(coverage, /<td>Deleted<\/td><td><code>src\/old\.js<\/code><\/td><td>1-2<\/td>/);
  assert.match(coverage, /<td>Deleted<\/td><td><code>docs\/notes\.md<\/code><\/td><td>5<\/td>/);
  assert.match(coverage, /<code>assets\/logo\.png<\/code>/);
  assert.match(coverage, /<code>src\/renamed\.js<\/code>/);
  assert.match(coverage, /<code>src\/config\.yaml<\/code>/);
});

test("overlapping refs across steps, items, claims, and mechanical groups count each line once", (t) => {
  const report = example();
  report.walkthrough.steps[0].refs = [{ path: "src/app.js", side: "R", start: 1, end: 22 }];
  report.items[0].refs = [{ path: "src/app.js", side: "R", start: 22, end: 22 }];
  report.claims[0].refs = [{ path: "src/app.js", side: "R", start: 3, end: 22 }];
  report.mechanical = [{
    summary: "Routine app and notes changes.",
    refs: [
      { path: "src/app.js", side: "R", start: 3, end: 3 },
      { path: "docs/notes.md", side: "R", start: 5, end: 5 },
    ],
  }];

  assert.deepEqual(validate(report), []);
  const { result, html } = runCli(t, report, evidenceFixture());
  assert.equal(result.status, 0, result.stderr);
  const coverage = coverageHtml(html);
  assert.match(coverage, /Covered: <strong>3<\/strong>/);
  assert.match(coverage, /Uncovered: <strong>0<\/strong> in 0 ranges/);
});

test("unknown, context-only, and L-side refs give no false credit", (t) => {
  const report = example();
  report.walkthrough.steps[0].refs = [
    { path: "src/missing.js" },
    { path: "src/app.js", side: "R", start: 4, end: 4 },
    { path: "src/app.js", side: "L", start: 3, end: 3 },
  ];

  const { result, html } = runCli(t, report, evidenceFixture());
  assert.equal(result.status, 0, result.stderr);
  const coverage = coverageHtml(html);
  assert.match(coverage, /Covered: <strong>0<\/strong>/);
  assert.match(coverage, /Uncovered: <strong>3<\/strong>/);
  assert.match(coverage, /no observed changed lines for src\/missing\.js/);
  assert.match(coverage, /no observed added lines in src\/app\.js:4-4/);
  assert.match(coverage, /no observed deleted lines in src\/app\.js:3-3/);
});

test("referenced deletions stay visible and never count as covered additions", (t) => {
  const report = example();
  report.items[0].refs = [{ path: "src/old.js", side: "L", start: 1, end: 2 }];

  const { result, html } = runCli(t, report, evidenceFixture());
  assert.equal(result.status, 0, result.stderr);
  const coverage = coverageHtml(html);
  assert.match(coverage, /Covered: <strong>0<\/strong>/);
  assert.match(coverage, /<td>Deleted<\/td><td><code>src\/old\.js<\/code><\/td><td>1-2<\/td>/);
  assert.doesNotMatch(coverage, /no observed deleted lines/);
});

test("rename refs use the destination for additions and the old path for deletions", (t) => {
  const report = example();
  report.walkthrough.steps[0].refs = [{ path: "src/new.js", side: "R", start: 1, end: 1 }];
  report.items[0].refs = [
    { path: "src/old.js", side: "L", start: 1, end: 1 },
    { path: "src/old.js", side: "R", start: 1, end: 1 },
  ];
  const evidence = evidenceFixture((value) => {
    value.diff = [
      "diff --git a/src/old.js b/src/new.js",
      "similarity index 90%",
      "rename from src/old.js",
      "rename to src/new.js",
      "--- a/src/old.js",
      "+++ b/src/new.js",
      "@@ -1,2 +1,2 @@",
      "-old line",
      "+new line",
      " context",
    ].join(String.fromCharCode(10));
    value.pr.changedFiles = 1;
    value.pr.additions = 1;
    value.pr.deletions = 1;
    value.pr.files = [{ path: "src/new.js", additions: 1, deletions: 1, changeType: "RENAMED" }];
  });

  const { result, html } = runCli(t, report, evidence);
  assert.equal(result.status, 0, result.stderr);
  const coverage = coverageHtml(html);
  assert.match(coverage, /Observed added lines: <strong>1<\/strong>/);
  assert.match(coverage, /Covered: <strong>1<\/strong>/);
  assert.match(coverage, /<td>Deleted<\/td><td><code>src\/old\.js<\/code><\/td><td>1<\/td>/);
  assert.match(coverage, /no observed added lines in src\/old\.js:1-1/);
  assert.doesNotMatch(coverage, /no observed deleted lines/);
  assert.match(coverage, /Measurement: complete/);
});

test("whole-file refs do not measure binary, pure-rename, or metadata-only files", (t) => {
  const report = example();
  report.mechanical = [{
    summary: "Routine asset and rename bookkeeping.",
    refs: [{ path: "assets/logo.png" }, { path: "src/renamed.js" }, { path: "src/config.yaml" }],
  }];

  const { result, html } = runCli(t, report, evidenceFixture());
  assert.equal(result.status, 0, result.stderr);
  const coverage = coverageHtml(html);
  assert.match(coverage, /Covered: <strong>0<\/strong>/);
  assert.match(coverage, /Unmeasured files: <strong>3<\/strong>/);
  assert.match(coverage, /<td>Unmeasured<\/td><td><code>assets\/logo\.png<\/code><\/td><td>binary file; no line data<\/td>/);
  assert.match(coverage, /<td>Unmeasured<\/td><td><code>src\/renamed\.js<\/code><\/td><td>pure rename; no line changes<\/td>/);
  assert.match(coverage, /<td>Unmeasured<\/td><td><code>src\/config\.yaml<\/code><\/td><td>no diff content in collected evidence<\/td>/);
  assert.match(coverage, /no observed changed lines for assets\/logo\.png/);
});

test("an old report without refs or evidence renders with unavailable coverage", () => {
  const report = example();
  delete report.mechanical;
  report.walkthrough.steps.forEach((step) => delete step.refs);
  report.items.forEach((item) => delete item.refs);
  report.claims.forEach((claim) => delete claim.refs);
  assert.deepEqual(validate(report), []);

  const html = render(report);
  assert.match(html, /<h1>Request changes<\/h1>/);
  assert.match(html, /Line coverage unavailable\.<\/strong> no evidence file was supplied/);
  assert.match(html, /<span class="chip pass">6 Pass<\/span>/);
  assert.match(html, /<span class="chip fail">3 Fail<\/span>/);
  assert.match(html, /<span class="chip open">1 Open<\/span>/);
});

test("unsafe or incomplete evidence renders unavailable coverage without changing the verdict", (t) => {
  const cases = [
    ["unreadable file", null, /evidence file cannot be read/],
    ["invalid JSON", "{not json", /evidence file is not valid JSON/],
    ["wrong schema", evidenceFixture((value) => { value.schemaVersion = 2; }), /evidence schemaVersion is not 1/],
    ["wrong head", evidenceFixture((value) => { value.pr.headRefOid = "f".repeat(40); }), /head SHA does not match/],
    ["wrong PR", evidenceFixture((value) => { value.pr.url = "https://github.com/example-org/example-service/pull/43"; }), /different pull request/],
    ["metadata unavailable", evidenceFixture((value) => { value.collection.sources.metadata = { status: "unavailable", error: "gh_exit_1" }; }), /metadata source is unavailable/],
    ["diff unavailable", evidenceFixture((value) => { value.collection.sources.diff = { status: "unavailable", error: "gh_exit_1" }; }), /diff source is unavailable/],
    ["empty diff", evidenceFixture((value) => { value.diff = ""; }), /collected diff has no content/],
  ];

  for (const [name, evidence, reason] of cases) {
    const { result, html } = runCli(t, example(), evidence);
    assert.equal(result.status, 0, `${name}: ${result.stderr}`);
    assert.match(html, /<h1>Request changes<\/h1>/, name);
    assert.match(html, /Line coverage unavailable/, name);
    assert.match(coverageHtml(html), reason, name);
    assert.match(html, /<span class="chip fail">3 Fail<\/span>/, name);
  }
});

test("an unrelated source failure keeps usable diff coverage", (t) => {
  const evidence = evidenceFixture((value) => {
    value.collection.status = "partial";
    value.collection.sources.inlineComments = { status: "unavailable", error: "gh_exit_1" };
  });
  const report = example();
  report.items[0].refs = [{ path: "src/app.js", side: "R", start: 3, end: 3 }];

  const { result, html } = runCli(t, report, evidence);
  assert.equal(result.status, 0, result.stderr);
  assert.match(coverageHtml(html), /Observed added lines: <strong>3<\/strong>/);
  assert.doesNotMatch(coverageHtml(html), /Line coverage unavailable/);
});

test("invalid refs and mechanical groups fail validation with field-specific errors", () => {
  const cases = [
    [(r) => { r.items[0].refs = {}; }, /items\[0\]\.refs: must be an array/],
    [(r) => { r.items[0].refs = [{ path: "src/app.js", side: "R", start: 1 }]; }, /a line ref needs side, start, and end/],
    [(r) => { r.items[0].refs = [{ path: "src/app.js", side: "X", start: 1, end: 1 }]; }, /items\[0\]\.refs\[0\]\.side: must be one of/],
    [(r) => { r.items[0].refs = [{ path: "src/app.js", side: "R", start: 2, end: 1 }]; }, /items\[0\]\.refs\[0\]\.end: must be a safe integer >= start/],
    [(r) => { r.walkthrough.steps[0].refs = [{ side: "R", start: 1, end: 1 }]; }, /walkthrough\.steps\[0\]\.refs\[0\]\.path: required text/],
    [(r) => { r.claims[0].refs = [{ path: "src/app.js", side: "R", start: 1, end: Number.MAX_SAFE_INTEGER + 2 }]; }, /claims\[0\]\.refs\[0\]\.end: must be a safe integer/],
    [(r) => { r.mechanical = {}; }, /mechanical: must be an array/],
    [(r) => { r.mechanical = [{ summary: "Routine.", refs: [] }]; }, /mechanical\[0\]\.refs: must be a nonempty array/],
    [(r) => { r.mechanical = [{ summary: Array.from({ length: 41 }, () => "word").join(" "), refs: [{ path: "src/app.js" }] }]; }, /mechanical\[0\]\.summary: 41 words, limit 40/],
  ];

  for (const [mutate, expected] of cases) {
    const report = example();
    mutate(report);
    assert.ok(validate(report).some((error) => expected.test(error)), validate(report).join(String.fromCharCode(10)));
  }
});

test("the CLI writes nothing for an invalid ref", (t) => {
  const report = example();
  report.items[0].refs = [{ path: "src/app.js", side: "R", start: 1 }];
  const { result, html } = runCli(t, report, evidenceFixture());
  assert.equal(result.status, 1);
  assert.match(result.stderr, /a line ref needs side, start, and end/);
  assert.equal(html, null);
});

test("coverage details stop at 50 entries while totals stay complete", (t) => {
  const diff = Array.from({ length: 60 }, (_, i) => {
    const name = `src/f${String(i).padStart(2, "0")}.txt`;
    return [`diff --git a/${name} b/${name}`, `--- a/${name}`, `+++ b/${name}`, "@@ -0,0 +1 @@", `+line ${i}`].join(String.fromCharCode(10));
  }).join(String.fromCharCode(10));
  const evidence = evidenceFixture((value) => {
    value.diff = diff;
    value.pr.changedFiles = 60;
    value.pr.additions = 60;
    value.pr.deletions = 0;
    value.pr.files = Array.from({ length: 60 }, (_, i) => ({ path: `src/f${String(i).padStart(2, "0")}.txt`, additions: 1, deletions: 0, changeType: "ADDED" }));
  });

  const { result, html } = runCli(t, example(), evidence);
  assert.equal(result.status, 0, result.stderr);
  const coverage = coverageHtml(html);
  assert.match(coverage, /Observed added lines: <strong>60<\/strong>/);
  assert.match(coverage, /Uncovered: <strong>60<\/strong> in 60 ranges/);
  assert.equal((coverage.match(/<td>Uncovered<\/td>/g) ?? []).length, 50);
  assert.match(coverage, /Detail entries: 50 shown, 10 omitted\./);
});

test("hostile paths stay inert and enormous ranges do not expand", (t) => {
  const report = example();
  report.items[0].refs = [{ path: "src/app.js", side: "R", start: 1, end: Number.MAX_SAFE_INTEGER }];
  report.mechanical = [{ summary: "<script>alert(1)</script>", refs: [{ path: "src/app.js" }] }];
  const evidence = evidenceFixture((value) => {
    value.diff = [
      "diff --git a/src/app.js b/src/app.js",
      "--- a/src/app.js",
      "+++ b/src/app.js",
      "@@ -0,0 +1 @@",
      "+payload",
      'diff --git "a/<img src=x>.txt" "b/<img src=x>.txt"',
      '"--- a/<img src=x>.txt"',
      '"+++ b/<img src=x>.txt"',
      "@@ -0,0 +1 @@",
      "+payload",
    ].join(String.fromCharCode(10));
    value.pr.changedFiles = 2;
    value.pr.additions = 2;
    value.pr.deletions = 0;
    value.pr.files = [
      { path: "src/app.js", additions: 1, deletions: 0, changeType: "ADDED" },
      { path: "<img src=x>.txt", additions: 1, deletions: 0, changeType: "ADDED" },
    ];
  });

  assert.deepEqual(validate(report), []);
  const { result, html } = runCli(t, report, evidence);
  assert.equal(result.status, 0, result.stderr);
  const coverage = coverageHtml(html);
  assert.doesNotMatch(html, /<img src=x>/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(coverage, /&lt;img src=x&gt;\.txt/);
  assert.match(coverage, /Covered: <strong>1<\/strong>/);
  assert.match(coverage, /Covered: <strong>1<\/strong>[^]*Uncovered: <strong>1<\/strong> in 1 range/);
});

test("empty-side hunks, no-newline markers, and quoted paths parse correctly", (t) => {
  const report = example();
  report.mechanical = [{
    summary: "Routine file additions and deletions.",
    refs: [{ path: "src/new.js" }, { path: "src/sp ace.js", side: "R", start: 1, end: 1 }, { path: "src/gone.js", side: "L", start: 1, end: 2 }],
  }];
  const evidence = evidenceFixture((value) => {
    value.diff = [
      "diff --git a/src/new.js b/src/new.js",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/src/new.js",
      "@@ -0,0 +1,2 @@",
      "+first",
      "+second",
      "\\ No newline at end of file",
      "diff --git a/src/gone.js b/src/gone.js",
      "deleted file mode 100644",
      "--- a/src/gone.js",
      "+++ /dev/null",
      "@@ -1,2 +0,0 @@",
      "-first",
      "-second",
      'diff --git "a/src/sp ace.js" "b/src/sp ace.js"',
      '"--- a/src/sp ace.js"',
      '"+++ b/src/sp ace.js"',
      "@@ -1 +1 @@",
      "-old",
      "+new",
    ].join(String.fromCharCode(10));
    value.pr.changedFiles = 3;
    value.pr.additions = 3;
    value.pr.deletions = 3;
    value.pr.files = [
      { path: "src/new.js", additions: 2, deletions: 0, changeType: "ADDED" },
      { path: "src/gone.js", additions: 0, deletions: 2, changeType: "DELETED" },
      { path: "src/sp ace.js", additions: 1, deletions: 1, changeType: "MODIFIED" },
    ];
  });

  const { result, html } = runCli(t, report, evidence);
  assert.equal(result.status, 0, result.stderr);
  const coverage = coverageHtml(html);
  assert.match(coverage, /Observed added lines: <strong>3<\/strong>/);
  assert.match(coverage, /Covered: <strong>3<\/strong>/);
  assert.match(coverage, /Deleted lines: <strong>3<\/strong> in 2 ranges/);
  assert.match(coverage, /Unmeasured files: <strong>0<\/strong>/);
  assert.match(coverage, /Measurement: complete/);
});

test("a truncated hunk is unmeasured and cannot earn coverage credit", (t) => {
  const report = example();
  report.mechanical = [{ summary: "Routine change.", refs: [{ path: "src/bad.js" }] }];
  const evidence = evidenceFixture((value) => {
    value.diff = [
      "diff --git a/src/bad.js b/src/bad.js",
      "--- a/src/bad.js",
      "+++ b/src/bad.js",
      "@@ -1,3 +1,4 @@",
      " one",
      "+two",
    ].join(String.fromCharCode(10));
    value.pr.changedFiles = 1;
    value.pr.additions = 1;
    value.pr.deletions = 0;
    value.pr.files = [{ path: "src/bad.js", additions: 1, deletions: 0, changeType: "MODIFIED" }];
  });

  const { result, html } = runCli(t, report, evidence);
  assert.equal(result.status, 0, result.stderr);
  const coverage = coverageHtml(html);
  assert.match(coverage, /Observed added lines: <strong>0<\/strong>/);
  assert.match(coverage, /Covered: <strong>0<\/strong>/);
  assert.match(coverage, /<td>Unmeasured<\/td><td><code>src\/bad\.js<\/code><\/td><td>hunk counts do not match the patch body<\/td>/);
  assert.match(coverage, /Measurement: partial/);
  assert.match(coverage, /no observed changed lines for src\/bad\.js/);
});

test("a deletion-only diff reports zero observed additions without a complete claim", (t) => {
  const report = example();
  report.mechanical = [{ summary: "Routine removal.", refs: [{ path: "src/gone.js", side: "L", start: 1, end: 2 }] }];
  const evidence = evidenceFixture((value) => {
    value.diff = [
      "diff --git a/src/gone.js b/src/gone.js",
      "deleted file mode 100644",
      "--- a/src/gone.js",
      "+++ /dev/null",
      "@@ -1,2 +0,0 @@",
      "-first",
      "-second",
    ].join(String.fromCharCode(10));
    value.pr.changedFiles = 1;
    value.pr.additions = 0;
    value.pr.deletions = 2;
    value.pr.files = [{ path: "src/gone.js", additions: 0, deletions: 2, changeType: "DELETED" }];
  });

  const { result, html } = runCli(t, report, evidence);
  assert.equal(result.status, 0, result.stderr);
  const coverage = coverageHtml(html);
  assert.match(coverage, /Observed added lines: <strong>0<\/strong>/);
  assert.match(coverage, /Covered: <strong>0<\/strong>/);
  assert.match(coverage, /Uncovered: <strong>0<\/strong> in 0 ranges/);
  assert.match(coverage, /Deleted lines: <strong>2<\/strong> in 1 range/);
  assert.match(coverage, /Measurement: complete/);
});

test("an incomplete inventory reports the unlisted remainder without fabricating paths", (t) => {
  const evidence = evidenceFixture((value) => { value.pr.changedFiles = 3001; });
  const { result, html } = runCli(t, example(), evidence);
  assert.equal(result.status, 0, result.stderr);
  const coverage = coverageHtml(html);
  assert.match(coverage, /Inventory: incomplete \(6 of 3001 changed files listed; 2995 unlisted files remain unmeasured\)/);
  assert.match(coverage, /Measurement: partial/);
  assert.doesNotMatch(coverage, /Measurement: complete/);
  assert.doesNotMatch(coverage, /complete PR coverage/i);
});

test("example report is valid and renders the new walkthrough in contract order", () => {
  const report = example();
  assert.equal(report.schemaVersion, 2);
  const gateItem = report.items.find((item) => item.id === "gate-blocks-repair");
  assert.match(gateItem.whyBad, /cannot repair the broken trust state\.$/);
  assert.match(gateItem.comment.text, /https:\/\/app\.datadoghq\.com\/monitors\/123/);
  assert.deepEqual(validate(report), []);
  const html = render(report);
  assert.match(html, /Already raised by @reviewer/);
  assert.match(html, /Already raised by bot <code>review-bot<\/code>/);
  assert.match(html, /Not raised before/);
  const order = [
    'class="hero', "PR summary.", 'id="review-gates"', 'class="nav"', 'id="walkthrough"',
    "<h3>System today</h3>", "The CLI signals", "Direct deploy", "<h3>Proposed system</h3>",
    "checks the trust monitor before deploying", "Monitor gate", "Step 1.", 'id="reviewer-questions"',
    'id="request-changes"', 'id="asks"', 'id="reference"',
  ];
  const positions = order.map((marker) => html.indexOf(marker));
  positions.forEach((pos, i) => assert.ok(pos >= 0, `missing ${order[i]}`));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  assert.deepEqual(report.reviewerQuestions.map((row) => row.id), REVIEWER_QUESTION_IDS);
  assert.match(html, /<a href="#reviewer-questions">Reviewer questions<\/a>/);
  const walkthrough = html.slice(html.indexOf('id="walkthrough"'), html.indexOf('id="reviewer-questions"'));
  assert.equal(walkthrough.match(/class="mermaid"/g)?.length, 2);
  const reviewerQuestions = html.slice(html.indexOf('id="reviewer-questions"'), html.indexOf('id="request-changes"'));
  assert.match(reviewerQuestions, /<th>Question<\/th><th>What the review found<\/th><th>Your decision<\/th>/);
  assert.equal(reviewerQuestions.match(/<tbody>/)?.length, 1);
  assert.equal(reviewerQuestions.match(/<tr>/g)?.length, REVIEWER_QUESTION_IDS.length + 1);
  assert.match(html, /<a href="#step-rotate">Walkthrough step 2<\/a>/);
  assert.match(html, /Related: <a href="#gate-blocks-repair">Request changes:/);
  assert.doesNotMatch(walkthrough, /<h3>(?:Problem|Core intuition|Solution map|Map)<\/h3>/);
  // The PR summary sits inside the hero box.
  assert.ok(html.indexOf("PR summary.") < html.indexOf("</header>"));
  assert.match(html, /securityLevel:"strict"/);
  assert.match(html, /Copy comment/);
});

test("template keeps tables and diagrams inside the page width", () => {
  const template = readFileSync(path.join(here, "template.html"), "utf8");
  assert.match(template, /table-layout:fixed/);
  assert.doesNotMatch(template, /min-width:\s*[1-9]\d{2,}px/);
  assert.doesNotMatch(template, /grid-template-columns:1fr 1\.5fr/);
});

test("PR-derived text is inert", () => {
  assert.equal(inline("<script>alert(1)</script>"), "&lt;script&gt;alert(1)&lt;/script&gt;");
  assert.equal(inline("[x](javascript:alert(1))"), "[x](javascript:alert(1))");
  assert.equal(inline("[x](https://a.test/?q=\"><b>)"), '<a href="https://a.test/?q=&quot;&gt;&lt;b&gt;">x</a>');
  assert.equal(inline("`<b>` and [Step](#step-1)"), '<code>&lt;b&gt;</code> and <a href="#step-1">Step</a>');

  const report = example();
  report.title = "</title><script>alert(1)</script>";
  report.items[0].comment.text = "</textarea><script>alert(1)</script>";
  report.items[0].code.excerpt = "<img src=x onerror=alert(1)>";
  report.walkthrough.systemToday.diagram = "flowchart TD\n  A[<iframe src=x>]";
  report.reviewerQuestions[0].finding = "<iframe src=checklist>";
  const html = render(report);
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /<iframe src=x>/);
  assert.doesNotMatch(html, /<iframe src=checklist>/);
  assert.match(html, /&lt;iframe src=x&gt;/);
  assert.match(html, /&lt;iframe src=checklist&gt;/);
});

test("word limits reject long text", () => {
  assert.equal(words("Read [the long label](https://a.test) and `a b`"), 6);
  const report = example();
  report.lead = Array.from({ length: 26 }, () => "word").join(" ");
  report.walkthrough.systemToday.explanation = Array.from({ length: 61 }, () => "word").join(" ");
  report.reviewerQuestions[0].question = Array.from({ length: 41 }, () => "word").join(" ");
  report.reviewerQuestions[0].finding = Array.from({ length: 41 }, () => "word").join(" ");
  report.reviewerQuestions[0].decision = Array.from({ length: 41 }, () => "word").join(" ");
  const errors = validate(report);
  assert.ok(errors.some((e) => e.startsWith("lead: 26 words, limit 25")), errors.join("\n"));
  assert.ok(errors.some((e) => e.startsWith("walkthrough.systemToday.explanation: 61 words, limit 60")), errors.join("\n"));
  assert.ok(errors.some((e) => e.startsWith("reviewerQuestions[0].question: 41 words, limit 40")), errors.join("\n"));
  assert.ok(errors.some((e) => e.startsWith("reviewerQuestions[0].finding: 41 words, limit 40")), errors.join("\n"));
  assert.ok(errors.some((e) => e.startsWith("reviewerQuestions[0].decision: 41 words, limit 40")), errors.join("\n"));
});

test("prior comments render as escaped bot and human links before item slots", () => {
  const report = example();
  report.items[0].priorComments = [{
    author: "<img src=x>",
    kind: "bot",
    url: "https://github.com/example-org/example-service/pull/42#discussion_r1",
  }];
  report.items[1].priorComments = [{
    author: "octocat",
    kind: "human",
    url: "https://github.com/example-org/example-service/pull/42#issuecomment-2",
  }];
  report.items[2].priorComments = [];

  const html = render(report);
  assert.match(html, /href="https:\/\/github\.com\/example-org\/example-service\/pull\/42#discussion_r1">Already raised by bot <code>&lt;img src=x&gt;<\/code><\/a>/);
  assert.match(html, /href="https:\/\/github\.com\/example-org\/example-service\/pull\/42#issuecomment-2">Already raised by @octocat<\/a>/);
  assert.match(html, /<span class="chip">Not raised before<\/span>/);
  assert.ok(html.indexOf("Already raised by bot") < html.indexOf("<h4>Where this fits</h4>"));
  assert.doesNotMatch(html, /<img src=x>/);
});

test("priorComments is required as an array on every item", () => {
  const missing = example();
  missing.items.forEach((item) => delete item.priorComments);
  const missingErrors = validate(missing);
  missing.items.forEach((_, i) => {
    assert.ok(missingErrors.some((error) => error.startsWith(`items[${i}].priorComments: required array`)), missingErrors.join("\n"));
  });

  const notArray = example();
  notArray.items[0].priorComments = {};
  const notArrayErrors = validate(notArray);
  assert.ok(notArrayErrors.some((error) => error.startsWith("items[0].priorComments: required array")), notArrayErrors.join("\n"));
});

test("prior comment URLs must belong to the report PR and use supported fragments", () => {
  const otherPR = example();
  otherPR.items[0].priorComments = [{
    author: "review-bot",
    kind: "bot",
    url: "https://github.com/example-org/example-service/pull/43#discussion_r1",
  }];
  assert.ok(validate(otherPR).some((error) => error.startsWith("items[0].priorComments[0].url:")));

  const badFragment = example();
  badFragment.items[0].priorComments = [{
    author: "review-bot",
    kind: "bot",
    url: "https://github.com/example-org/example-service/pull/42#discussion_rnope",
  }];
  assert.ok(validate(badFragment).some((error) => error.startsWith("items[0].priorComments[0].url:")));

  const reviewBody = example();
  reviewBody.items[0].priorComments = [{
    author: "reviewer",
    kind: "human",
    url: "https://github.com/example-org/example-service/pull/42#pullrequestreview-3",
  }];
  assert.deepEqual(validate(reviewBody), []);
});

test("prior comment kind and escaped repository matching are validated", () => {
  const badKind = example();
  badKind.items[0].priorComments = [{
    author: "review-bot",
    kind: "robot",
    url: "https://github.com/example-org/example-service/pull/42#discussion_r1",
  }];
  assert.ok(validate(badKind).some((error) => error.startsWith("items[0].priorComments[0].kind:")));

  const dottedRepo = example();
  dottedRepo.repo = "example.org/example-service";
  dottedRepo.items[0].priorComments = [{
    author: "review-bot",
    kind: "bot",
    url: "https://github.com/example.org/example-service/pull/42#discussion_r1",
  }];
  dottedRepo.items[1].priorComments = [];
  assert.deepEqual(validate(dottedRepo), []);
  dottedRepo.items[0].priorComments[0].url = "https://github.com/exampleXorg/example-service/pull/42#discussion_r1";
  assert.ok(validate(dottedRepo).some((error) => error.startsWith("items[0].priorComments[0].url:")));
});

test("reviewer questions use all fixed categories and describe absent evidence safely", () => {
  const report = example();
  assert.deepEqual(report.reviewerQuestions.map((row) => row.id), REVIEWER_QUESTION_IDS);
  assert.match(report.reviewerQuestions[0].finding, /No OpenSpec or proposal artifact was found/);
  assert.match(report.reviewerQuestions[3].finding, /No public contract or database schema change was found/);
  assert.match(report.reviewerQuestions[4].finding, /No Go interface was found/);
  assert.match(report.reviewerQuestions[5].finding, /No bootstrap cycle was found/);
  assert.deepEqual(validate(report), []);

  const missingCategory = example();
  missingCategory.reviewerQuestions.pop();
  assert.ok(validate(missingCategory).some((error) => error.startsWith("reviewerQuestions: must list all 8 fixed questions")));

  const wrongOrder = example();
  [wrongOrder.reviewerQuestions[0], wrongOrder.reviewerQuestions[1]] = [wrongOrder.reviewerQuestions[1], wrongOrder.reviewerQuestions[0]];
  assert.ok(validate(wrongOrder).some((error) => error.startsWith('reviewerQuestions[0].id: must be "change-purpose"')));

  const wrongQuestion = example();
  wrongQuestion.reviewerQuestions[0].question = "A different question for this category?";
  assert.ok(validate(wrongQuestion).some((error) => error.startsWith("reviewerQuestions[0].question: must match the fixed question")));
});

test("manual inspection is skipped only when the description and tests are clear", () => {
  const clear = example();
  const html = render(clear);
  assert.match(html, /You can skip manual inspection while the description and associated tests remain clear/);

  const unclear = example();
  unclear.reviewerQuestions[7].finding = "The description is unclear, and no associated test covers this behavior.";
  unclear.reviewerQuestions[7].decision = "Manually inspect the relevant UI, functions, and algorithms.";
  const unclearHtml = render(unclear);
  assert.match(unclearHtml, /Manually inspect the relevant UI, functions, and algorithms/);
  assert.doesNotMatch(unclearHtml, /You can skip manual inspection/);
});

test("reviewer questions do not change gate or verdict validation", () => {
  const report = example();
  report.reviewerQuestions[0].finding = "A different supported explanation.";
  assert.deepEqual(validate(report), []);
  report.verdict = "Approve";
  assert.ok(validate(report).some((error) => error.startsWith('verdict: gates require "Request changes"')));
});

test("whyBad has a 90-word limit", () => {
  const tooLong = example();
  tooLong.items[0].whyBad = Array.from({ length: 91 }, () => "word").join(" ");
  const errors = validate(tooLong);
  assert.ok(errors.some((e) => e.startsWith("items[0].whyBad: 91 words, limit 90")), errors.join("\n"));

  const withinLimit = example();
  withinLimit.items[0].whyBad = Array.from({ length: 75 }, () => "word").join(" ");
  assert.deepEqual(validate(withinLimit), []);
});

test("gates must be complete, ordered, linked, and agree with the verdict", () => {
  const report = example();
  report.gates[7].link = undefined;
  report.verdict = "Ask";
  report.gates = report.gates.slice(0, 9);
  const errors = validate(report);
  assert.ok(errors.some((e) => e.startsWith("gates: must list all 10")));
  assert.ok(errors.some((e) => e.startsWith("gates[7].link")));
  assert.ok(errors.some((e) => e.startsWith('verdict: gates require "Request changes"')));
  assert.ok(errors.some((e) => e.startsWith("items: request items need")));
});

test("items must reference walkthrough steps and carry comments", () => {
  const report = example();
  report.items[0].step = "missing";
  delete report.items[1].comment;
  const errors = validate(report);
  assert.ok(errors.some((e) => e.startsWith("items[0].step")));
  assert.ok(errors.some((e) => e.startsWith("items[1].comment")));
});

test("comment links use the sha256 diff anchor", () => {
  const report = example();
  const c = report.items[0].comment;
  // Same value as: printf %s worker/rotate_ca.go | shasum -a 256
  const anchor = "5784e8f4f53bff6bde31aaa82534b5ba2f635282ff44f1e046afdc7a7f2045bb";
  assert.equal(diffAnchor(c.path), anchor);
  assert.equal(commentLink(report, c), `https://github.com/example-org/example-service/pull/42/files#diff-${anchor}R38-R44`);
});

test("CLI help lists the whyBad limit and priorComments field", () => {
  const result = spawnSync(process.execPath, [path.join(here, "render.mjs"), "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /whyBad=90/);
  assert.match(result.stdout, /priorComments/);
  assert.match(result.stdout, /--evidence/);
  assert.match(result.stdout, /\{path\}/);
  assert.match(result.stdout, /mechanical/);
});

test("the example documents optional refs and mechanical groups", () => {
  const report = example();
  assert.ok(report.walkthrough.steps[0].refs.length > 0);
  assert.ok(report.walkthrough.steps[1].refs.length > 0);
  assert.ok(report.items[0].refs.length > 0);
  assert.ok(report.claims[0].refs.length > 0);
  assert.ok(report.mechanical.length > 0);
  assert.deepEqual(validate(report), []);
});

test("CLI writes nothing when validation fails", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "prv-"));
  const input = path.join(dir, "repo-1.json");
  const report = example();
  report.lead = "";
  writeFileSync(input, JSON.stringify(report));
  const result = spawnSync(process.execPath, [path.join(here, "render.mjs"), input], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /lead: required text/);
  assert.equal(existsSync(path.join(dir, "repo-1.html")), false);

  const missingPriorComments = example();
  delete missingPriorComments.items[0].priorComments;
  writeFileSync(input, JSON.stringify(missingPriorComments));
  const invalidPriorComments = spawnSync(process.execPath, [path.join(here, "render.mjs"), input], { encoding: "utf8" });
  assert.equal(invalidPriorComments.status, 1);
  assert.match(invalidPriorComments.stderr, /items\[0\]\.priorComments: required array/);
  assert.equal(existsSync(path.join(dir, "repo-1.html")), false);

  const missingReviewerQuestions = example();
  delete missingReviewerQuestions.reviewerQuestions;
  writeFileSync(input, JSON.stringify(missingReviewerQuestions));
  const invalidReviewerQuestions = spawnSync(process.execPath, [path.join(here, "render.mjs"), input], { encoding: "utf8" });
  assert.equal(invalidReviewerQuestions.status, 1);
  assert.match(invalidReviewerQuestions.stderr, /reviewerQuestions: must be an array/);
  assert.equal(existsSync(path.join(dir, "repo-1.html")), false);

  const staleVersion = example();
  staleVersion.schemaVersion = 1;
  writeFileSync(input, JSON.stringify(staleVersion));
  const stale = spawnSync(process.execPath, [path.join(here, "render.mjs"), input], { encoding: "utf8" });
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /schemaVersion: must be 2/);
  assert.equal(existsSync(path.join(dir, "repo-1.html")), false);

  writeFileSync(input, JSON.stringify(example()));
  const ok = spawnSync(process.execPath, [path.join(here, "render.mjs"), input], { encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.stdout.trim(), path.join(dir, "repo-1.html"));
  assert.ok(existsSync(path.join(dir, "repo-1.html")));
});
