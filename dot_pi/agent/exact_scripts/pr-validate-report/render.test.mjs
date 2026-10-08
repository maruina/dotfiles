import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { commentLink, diffAnchor, inline, render, validate, words } from "./render.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const example = () => JSON.parse(readFileSync(path.join(here, "example.json"), "utf8"));

test("example report is valid and renders sections in contract order", () => {
  const report = example();
  const gateItem = report.items.find((item) => item.id === "gate-blocks-repair");
  assert.match(gateItem.whyBad, /cannot repair the broken trust state\.$/);
  assert.match(gateItem.comment.text, /https:\/\/app\.datadoghq\.com\/monitors\/123/);
  assert.deepEqual(validate(report), []);
  const html = render(report);
  const order = ['class="hero', "PR summary.", 'id="review-gates"', 'class="nav"', 'id="walkthrough"', 'id="request-changes"', 'id="asks"', 'id="reference"'];
  const positions = order.map((marker) => html.indexOf(marker));
  positions.forEach((pos, i) => assert.ok(pos >= 0, `missing ${order[i]}`));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
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
  const html = render(report);
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /<img src=x/);
});

test("word limits reject long text", () => {
  assert.equal(words("Read [the long label](https://a.test) and `a b`"), 6);
  const report = example();
  report.lead = Array.from({ length: 26 }, () => "word").join(" ");
  report.walkthrough.systemToday[0] = Array.from({ length: 21 }, () => "word").join(" ");
  const errors = validate(report);
  assert.ok(errors.some((e) => e.startsWith("lead: 26 words, limit 25")), errors.join("\n"));
  assert.ok(errors.some((e) => e.startsWith("walkthrough.systemToday[0]: 21 words")), errors.join("\n"));
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

  writeFileSync(input, JSON.stringify(example()));
  const ok = spawnSync(process.execPath, [path.join(here, "render.mjs"), input], { encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.stdout.trim(), path.join(dir, "repo-1.html"));
  assert.ok(existsSync(path.join(dir, "repo-1.html")));
});
