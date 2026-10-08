#!/usr/bin/env node
// Renders /pr-validate report data (JSON) into the standard single-file HTML report.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const GATES = [
  "Correctness",
  "Meaningful tests",
  "Human validation provided",
  "Why recorded",
  "Fixable",
  "Best practices",
  "Necessity",
  "Observability",
  "Dependencies",
  "Docs",
];
const VERDICTS = ["Approve", "Ask", "Request changes"];
const STATUSES = ["Pass", "Fail", "Open"];
const KINDS = ["request", "ask", "attention"];
const KIND_LABEL = { request: "Request changes", ask: "Ask", attention: "Attention" };
const KIND_CHAPTER = { request: "request-changes", ask: "asks", attention: "attention" };
const FILE_CLASSES = {
  generated: "generated",
  build: "build wiring",
  behavior: "behavior",
  test: "test",
  docs: "docs or guidance",
  schema: "schema/API",
};
const EXPOSURES = ["real", "none now", "unknown"];
const FIX_COSTS = ["small", "large"];
const SKILL_SOURCES = ["skill-loader", "prompt-required", "user-requested", "agent-selected"];
const THREAD_STATES = ["Applies", "Does not apply", "Fixed", "Open"];

// Word limits per text field. Links count as their label; a code span counts as one word.
export const LIMITS = {
  lead: 25,
  whatItDoes: 30,
  why: 30,
  gateEvidence: 30,
  problem: 40,
  systemTodayStep: 20,
  systemTodaySteps: 7,
  coreIntuition: 40,
  solves: 20,
  stepTitle: 10,
  stepPart: 30,
  itemTitle: 12,
  slot: 60,
  whyBad: 90,
  exposureDetail: 8,
  comment: 120,
  excerptLines: 12,
  attentionItems: 5,
  short: 40,
};

const LINK = /\[([^\]\n]+)\]\(((?:https:\/\/|#)[^\s()]+)\)/g;
const CODE = /(`[^`\n]+`)/;

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// Text fields support only `code` spans and [label](https://...) or [label](#id) links. Everything else is escaped.
export function inline(text) {
  return String(text)
    .split(CODE)
    .map((part) => {
      if (/^`[^`\n]+`$/.test(part)) return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      let out = "";
      let last = 0;
      for (const match of part.matchAll(LINK)) {
        out += escapeHtml(part.slice(last, match.index));
        out += `<a href="${escapeHtml(match[2])}">${escapeHtml(match[1])}</a>`;
        last = match.index + match[0].length;
      }
      return out + escapeHtml(part.slice(last));
    })
    .join("");
}

export function words(text) {
  return String(text)
    .replace(LINK, "$1")
    .replace(/`[^`\n]+`/g, "x")
    .split(/\s+/)
    .filter(Boolean).length;
}

export function diffAnchor(file) {
  return createHash("sha256").update(file).digest("hex");
}

function lines(start, end, prefix) {
  return start === end ? `${prefix}${start}` : `${prefix}${start}-${prefix}${end}`;
}

export function permalink(r, file, start, end) {
  return `https://github.com/${r.repo}/blob/${r.headSha}/${file}#${lines(start, end, "L")}`;
}

export function commentLink(r, c) {
  return `https://github.com/${r.repo}/pull/${r.number}/files#diff-${diffAnchor(c.path)}${lines(c.start, c.end, c.side)}`;
}

export function validate(r) {
  const errors = [];
  const fail = (where, message) => errors.push(`${where}: ${message}`);
  const isText = (v) => typeof v === "string" && v.trim() !== "";
  const text = (v, where, limit) => {
    if (!isText(v)) return fail(where, "required text");
    const n = words(v);
    if (limit && n > limit) fail(where, `${n} words, limit ${limit}; shorten it`);
  };
  const oneOf = (v, allowed, where) => {
    if (!allowed.includes(v)) fail(where, `must be one of ${allowed.map((a) => JSON.stringify(a)).join(", ")}`);
  };
  const count = (v, where) => {
    if (!Number.isInteger(v) || v < 0) fail(where, "must be a non-negative integer");
  };
  const list = (v, where, min = 1) => {
    if (!Array.isArray(v) || v.length < min) {
      fail(where, `must be an array with at least ${min} entr${min === 1 ? "y" : "ies"}`);
      return [];
    }
    return v;
  };
  const range = (v, where) => {
    if (!v || typeof v !== "object") return fail(where, "required object");
    text(v.path, `${where}.path`);
    if (!Number.isInteger(v.start) || v.start < 1) fail(`${where}.start`, "must be a positive line number");
    if (!Number.isInteger(v.end) || v.end < v.start) fail(`${where}.end`, "must be a line number >= start");
  };
  const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  if (!r || typeof r !== "object") return ["report: must be a JSON object"];
  if (r.schemaVersion !== 1) fail("schemaVersion", "must be 1");
  if (typeof r.repo !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(r.repo)) fail("repo", "must be ORG/REPO");
  if (!Number.isInteger(r.number) || r.number < 1) fail("number", "must be the PR number");
  for (const key of ["title", "author", "baseRef", "headRef", "model", "thinking"]) text(r[key], key);
  if (typeof r.headSha !== "string" || !/^[0-9a-f]{40}$/.test(r.headSha)) fail("headSha", "must be the 40-character head SHA");
  const priorCommentUrl = typeof r.repo === "string" && Number.isInteger(r.number)
    ? new RegExp(`^https://github\\.com/${escapeRegExp(r.repo)}/pull/${r.number}#(discussion_r|issuecomment-|pullrequestreview-)\\d+$`)
    : null;
  oneOf(r.verdict, VERDICTS, "verdict");
  text(r.lead, "lead", LIMITS.lead);

  const s = r.summary ?? {};
  text(s.whatItDoes, "summary.whatItDoes", LIMITS.whatItDoes);
  text(s.why, "summary.why", LIMITS.why);
  for (const key of ["files", "additions", "deletions"]) count(s.size?.[key], `summary.size.${key}`);
  if (!s.filesByClass || typeof s.filesByClass !== "object") fail("summary.filesByClass", "required object");
  for (const [key, value] of Object.entries(s.filesByClass ?? {})) {
    if (!(key in FILE_CLASSES)) fail(`summary.filesByClass.${key}`, `unknown class; use ${Object.keys(FILE_CLASSES).join(", ")}`);
    count(value, `summary.filesByClass.${key}`);
  }

  const items = Array.isArray(r.items) ? r.items : [];
  if (!Array.isArray(r.items)) fail("items", "must be an array (empty for Approve)");
  const itemIds = new Set();
  const w = r.walkthrough ?? {};
  const stepIds = new Set(Array.isArray(w.steps) ? w.steps.map((st) => st?.id) : []);

  items.forEach((item, i) => {
    const at = `items[${i}]`;
    if (typeof item?.id !== "string" || !/^[a-z0-9-]+$/.test(item.id)) fail(`${at}.id`, "must match [a-z0-9-]+");
    else if (itemIds.has(item.id)) fail(`${at}.id`, `duplicate id ${item.id}`);
    else itemIds.add(item.id);
    oneOf(item?.kind, KINDS, `${at}.kind`);
    text(item?.title, `${at}.title`, LIMITS.itemTitle);
    if (!stepIds.has(item?.step)) fail(`${at}.step`, "must name a walkthrough step id");
    if (!Array.isArray(item?.priorComments)) {
      fail(`${at}.priorComments`, "required array");
    } else {
      item.priorComments.forEach((comment, j) => {
        const commentAt = `${at}.priorComments[${j}]`;
        if (!comment || typeof comment !== "object" || Array.isArray(comment)) {
          fail(commentAt, "required object");
          return;
        }
        text(comment.author, `${commentAt}.author`, LIMITS.short);
        oneOf(comment.kind, ["bot", "human"], `${commentAt}.kind`);
        if (typeof comment.url !== "string" || !priorCommentUrl?.test(comment.url)) {
          fail(`${commentAt}.url`, `must be a comment permalink for ${r.repo}#${r.number}`);
        }
      });
    }
    text(item?.whereThisFits, `${at}.whereThisFits`, LIMITS.slot);
    text(item?.whyBad, `${at}.whyBad`, LIMITS.whyBad);
    if (item?.kind === "attention") {
      text(item.whyJudgment, `${at}.whyJudgment`, LIMITS.slot);
      if (item.code) range(item.code, `${at}.code`);
      else text(item.where, `${at}.where`, LIMITS.slot);
      list(item.options, `${at}.options`, 2).forEach((o, j) => {
        text(o?.option, `${at}.options[${j}].option`, LIMITS.short);
        text(o?.consequence, `${at}.options[${j}].consequence`, LIMITS.short);
      });
      text(item.recommendation, `${at}.recommendation`, LIMITS.short);
    } else {
      text(item?.whyItMatters, `${at}.whyItMatters`, LIMITS.slot);
      range(item?.code, `${at}.code`);
      text(item?.fix, `${at}.fix`, LIMITS.slot);
      const c = item?.comment;
      if (!c || typeof c !== "object") fail(`${at}.comment`, "required object");
      else if (c.unavailable !== undefined) text(c.unavailable, `${at}.comment.unavailable`, LIMITS.short);
      else {
        range(c, `${at}.comment`);
        oneOf(c.side, ["R", "L"], `${at}.comment.side`);
        text(c.text, `${at}.comment.text`, LIMITS.comment);
        if (c.placement !== undefined) text(c.placement, `${at}.comment.placement`, LIMITS.short);
      }
    }
    if (item?.code && typeof item.code.excerpt === "string") {
      if (item.code.excerpt.split("\n").length > LIMITS.excerptLines) fail(`${at}.code.excerpt`, `more than ${LIMITS.excerptLines} lines`);
    } else if (item?.kind !== "attention" || item?.code) fail(`${at}.code.excerpt`, "required text");
    const real = item?.real ?? {};
    oneOf(real.exposure, EXPOSURES, `${at}.real.exposure`);
    if (real.detail !== undefined) text(real.detail, `${at}.real.detail`, LIMITS.exposureDetail);
    oneOf(real.fixCost, FIX_COSTS, `${at}.real.fixCost`);
    text(real.evidence, `${at}.real.evidence`, LIMITS.slot);
    if (item?.diagram !== undefined) text(item.diagram, `${at}.diagram`);
  });

  const gates = list(r.gates, "gates");
  if (gates.length !== GATES.length) fail("gates", `must list all ${GATES.length} gates in order`);
  gates.forEach((g, i) => {
    const at = `gates[${i}]`;
    if (g?.gate !== GATES[i]) fail(`${at}.gate`, `must be ${JSON.stringify(GATES[i])}`);
    oneOf(g?.status, STATUSES, `${at}.status`);
    text(g?.evidence, `${at}.evidence`, LIMITS.gateEvidence);
    if (g?.status !== "Pass" && g?.link !== "coverage" && !itemIds.has(g?.link)) {
      fail(`${at}.link`, "a Fail or Open gate must link to an item id or \"coverage\"");
    }
  });

  const statuses = gates.map((g) => g?.status);
  const expected = statuses.includes("Fail") ? "Request changes" : statuses.includes("Open") ? "Ask" : "Approve";
  if (VERDICTS.includes(r.verdict) && r.verdict !== expected) fail("verdict", `gates require ${JSON.stringify(expected)}`);
  const kinds = items.map((item) => item?.kind);
  if (r.verdict === "Request changes" && !kinds.includes("request")) fail("items", "Request changes needs at least one request item");
  if (r.verdict !== "Request changes" && kinds.includes("request")) fail("items", "request items need the Request changes verdict");
  if (r.verdict === "Approve" && kinds.includes("ask")) fail("items", "Approve cannot have ask items");
  if (kinds.filter((k) => k === "attention").length > LIMITS.attentionItems) {
    fail("items", `at most ${LIMITS.attentionItems} attention items; recommend splitting the PR`);
  }

  text(w.problem, "walkthrough.problem", LIMITS.problem);
  const today = list(w.systemToday, "walkthrough.systemToday");
  if (today.length > LIMITS.systemTodaySteps) fail("walkthrough.systemToday", `at most ${LIMITS.systemTodaySteps} steps`);
  today.forEach((step, i) => text(step, `walkthrough.systemToday[${i}]`, LIMITS.systemTodayStep));
  text(w.coreIntuition, "walkthrough.coreIntuition", LIMITS.coreIntuition);
  list(w.solutionMap, "walkthrough.solutionMap").forEach((row, i) => {
    text(row?.component, `walkthrough.solutionMap[${i}].component`, LIMITS.short);
    text(row?.solves, `walkthrough.solutionMap[${i}].solves`, LIMITS.solves);
  });
  text(w.flowchart, "walkthrough.flowchart");
  const seenSteps = new Set();
  list(w.steps, "walkthrough.steps").forEach((step, i) => {
    const at = `walkthrough.steps[${i}]`;
    if (typeof step?.id !== "string" || !/^[a-z0-9-]+$/.test(step.id)) fail(`${at}.id`, "must match [a-z0-9-]+");
    else if (seenSteps.has(step.id) || itemIds.has(step.id)) fail(`${at}.id`, `duplicate id ${step.id}`);
    else seenSteps.add(step.id);
    text(step?.title, `${at}.title`, LIMITS.stepTitle);
    for (const key of ["today", "changed", "effect"]) text(step?.[key], `${at}.${key}`, LIMITS.stepPart);
  });

  if (r.question !== undefined) {
    text(r.question?.question, "question.question", LIMITS.short);
    text(r.question?.answer, "question.answer", LIMITS.slot);
    (r.question?.rows ?? []).forEach((row, i) => {
      text(row?.thread, `question.rows[${i}].thread`, LIMITS.short);
      oneOf(row?.state, THREAD_STATES, `question.rows[${i}].state`);
      text(row?.evidence, `question.rows[${i}].evidence`, LIMITS.gateEvidence);
    });
  }

  const cov = r.coverage ?? {};
  list(cov.checked, "coverage.checked").forEach((v, i) => text(v, `coverage.checked[${i}]`, LIMITS.short));
  if (!Array.isArray(cov.gaps)) fail("coverage.gaps", "must be an array (empty when nothing is missing)");
  (cov.gaps ?? []).forEach((v, i) => text(v, `coverage.gaps[${i}]`, LIMITS.short));
  (r.claims ?? []).forEach((c, i) => {
    text(c?.claim, `claims[${i}].claim`, LIMITS.short);
    text(c?.source, `claims[${i}].source`, LIMITS.short);
    text(c?.result, `claims[${i}].result`, LIMITS.gateEvidence);
  });
  list(r.skills, "skills").forEach((sk, i) => {
    text(sk?.skill, `skills[${i}].skill`);
    oneOf(sk?.source, SKILL_SOURCES, `skills[${i}].source`);
    text(sk?.why, `skills[${i}].why`, LIMITS.short);
    text(sk?.how, `skills[${i}].how`, LIMITS.short);
  });
  if (r.marketplace !== undefined) text(r.marketplace, "marketplace", LIMITS.short);
  return errors;
}

const statusClass = (status) => ({ Pass: "pass", Fail: "fail", Open: "open" })[status];
const verdictClass = (verdict) => ({ Approve: "pass", Ask: "open", "Request changes": "fail" })[verdict];

function table(headers, rows, widths) {
  const cols = widths ? `<colgroup>${widths.map((wd) => `<col style="width:${wd}">`).join("")}</colgroup>` : "";
  const head = `<thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>`;
  const body = rows.map((cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("\n");
  return `<table>${cols}${head}<tbody>\n${body}\n</tbody></table>`;
}

function mermaid(source, highlight) {
  let src = source.trim();
  // Agents mark nodes with :::rc (Request changes) or :::ask (Ask or attention); the renderer owns the colors.
  if (highlight && /^(flowchart|graph)\b/.test(src)) {
    src += "\nclassDef rc fill:#fff1f0,stroke:#b42318,color:#17202a\nclassDef ask fill:#fff8e6,stroke:#9a6700,color:#17202a";
  }
  return `<div class="mermaid-wrap"><pre class="mermaid">\n${escapeHtml(src)}\n</pre></div>`;
}

function slot(title, html) {
  return `<div class="slot"><h4>${escapeHtml(title)}</h4>${html}</div>`;
}

function excerpt(r, code) {
  const label = `${path.posix.basename(code.path)}:${code.start === code.end ? code.start : `${code.start}-${code.end}`}`;
  return `<pre class="excerpt"><a href="${escapeHtml(permalink(r, code.path, code.start, code.end))}">${escapeHtml(label)}</a>\n${escapeHtml(code.excerpt)}</pre>`;
}

function renderItem(r, item, n, steps) {
  const attention = item.kind === "attention";
  const step = steps.findIndex((st) => st.id === item.step);
  const real = item.real;
  const exposureChip = `<span class="chip ${real.exposure === "real" ? "fail" : real.exposure === "unknown" ? "open" : ""}">Exposure: ${escapeHtml(real.exposure)}${real.detail ? ` · ${escapeHtml(real.detail)}` : ""}</span>`;
  const priorCommentChips = item.priorComments.length > 0
    ? item.priorComments.map((comment) => {
        const label = comment.kind === "bot"
          ? `Already raised by bot <code>${escapeHtml(comment.author)}</code>`
          : `Already raised by @${escapeHtml(comment.author)}`;
        return `<a class="chip" href="${escapeHtml(comment.url)}">${label}</a>`;
      }).join(" ")
    : '<span class="chip">Not raised before</span>';
  const parts = [
    `<div class="prior-comments">${priorCommentChips}</div>`,
    slot("Where this fits", `<p>${inline(item.whereThisFits)} See <a href="#${escapeHtml(item.step)}">Walkthrough step ${step + 1}</a>.</p>`),
    attention
      ? slot("Why it needs your judgment", `<p>${inline(item.whyJudgment)}</p>`)
      : slot("Why it matters", `<p>${inline(item.whyItMatters)}</p>`),
    attention
      ? slot("Where", item.code ? excerpt(r, item.code) : `<p>${inline(item.where)}</p>`)
      : slot("What the code does now", excerpt(r, item.code)),
    slot(attention ? "Context" : "Why that is bad", `<p>${inline(item.whyBad)}</p>${item.diagram ? mermaid(item.diagram, false) : ""}`),
    slot("Is it real?", `<p>${exposureChip} <span class="chip">Fix cost: ${escapeHtml(real.fixCost)}</span> ${inline(real.evidence)}</p>`),
    attention
      ? slot(
          "Options",
          `<ul>${item.options.map((o) => `<li><strong>${inline(o.option)}</strong> ${inline(o.consequence)}</li>`).join("")}</ul><p><strong>Recommendation:</strong> ${inline(item.recommendation)}</p>`,
        )
      : slot("Fix shape", `<p>${inline(item.fix)}</p>`),
  ];
  if (!attention) {
    const c = item.comment;
    if (c.unavailable !== undefined) {
      parts.push(`<div class="copybox"><p><strong>Inline comment unavailable.</strong> ${inline(c.unavailable)}</p></div>`);
    } else {
      const id = `comment-${item.id}`;
      const target = `${path.posix.basename(c.path)}:${c.start === c.end ? c.start : `${c.start}-${c.end}`}`;
      parts.push(
        `<div class="copybox"><label for="${id}">Leave this comment · <a href="${escapeHtml(commentLink(r, c))}">inline target: ${escapeHtml(target)}</a></label>` +
          (c.placement ? `<p class="small muted">${inline(c.placement)}</p>` : "") +
          `<div class="copyrow"><textarea id="${id}" readonly>${escapeHtml(c.text)}</textarea><button type="button" data-copy="${id}" data-status="${id}-status">Copy comment</button></div>` +
          `<p class="copy-status" id="${id}-status" aria-live="polite">Copy status appears here.</p></div>`,
      );
    }
  }
  return `<article class="card" id="${escapeHtml(item.id)}">\n<h3>${n}. ${inline(item.title)}</h3>\n${parts.join("\n")}\n</article>`;
}

export function render(r, template = readFileSync(path.join(HERE, "template.html"), "utf8")) {
  const items = r.items;
  const steps = r.walkthrough.steps;
  const byKind = (kind) => items.filter((item) => item.kind === kind);
  const counts = Object.fromEntries(STATUSES.map((st) => [st, r.gates.filter((g) => g.status === st).length]));
  const s = r.summary;
  const prUrl = `https://github.com/${r.repo}/pull/${r.number}`;
  const itemCounts = [`${byKind("request").length} request changes`, `${byKind("ask").length} ask`, `${byKind("attention").length} attention`];

  const summaryRows = [
    ["What it does", inline(s.whatItDoes)],
    ["Why", inline(s.why)],
    ["PR", `<a href="${escapeHtml(prUrl)}">#${r.number} · ${escapeHtml(r.title)}</a> · author ${escapeHtml(r.author)} · <code>${escapeHtml(r.baseRef)}</code> ← <code>${escapeHtml(r.headRef)}</code>`],
    ["Head", `<a href="https://github.com/${escapeHtml(r.repo)}/commit/${r.headSha}"><code>${r.headSha}</code></a>`],
    ["Size", `${s.size.files} files · ${s.size.additions} additions · ${s.size.deletions} deletions`],
    ["Files by class", Object.entries(s.filesByClass).map(([key, n]) => `${n} ${FILE_CLASSES[key]}`).join(" · ")],
    ["Verdict", `<strong>${escapeHtml(r.verdict)}</strong> · ${itemCounts.join(" · ")}`],
    ["Gates", STATUSES.map((st) => `<span class="status ${statusClass(st)}">${counts[st]} ${st}</span>`).join(" · ")],
    ["Reviewed by", `${escapeHtml(r.model)} · thinking ${escapeHtml(r.thinking)}`],
  ];
  const hero = `<header class="hero ${verdictClass(r.verdict)}" id="top">
<div class="eyebrow">Pull request review · ${escapeHtml(r.repo)}</div>
<h1>${escapeHtml(r.verdict)}</h1>
<p class="lead">${inline(r.lead)}</p>
<div class="chips">${STATUSES.map((st) => `<span class="chip ${statusClass(st)}">${counts[st]} ${st}</span>`).join("")}${itemCounts.map((label) => `<span class="chip">${escapeHtml(label)}</span>`).join("")}</div>
<h2>PR summary.</h2>
${table(["Field", "Details"], summaryRows.map(([k, v]) => [escapeHtml(k), v]), ["22%", "78%"])}
</header>`;

  const itemLabel = Object.fromEntries(KINDS.flatMap((kind) => byKind(kind).map((item, i) => [item.id, `${KIND_LABEL[kind]} ${i + 1}`])));
  const gateRows = r.gates.map((g) => {
    const link = g.status === "Pass" ? "" : ` → <a href="#${g.link}">${g.link === "coverage" ? "Coverage" : escapeHtml(itemLabel[g.link])}</a>`;
    return [escapeHtml(g.gate), `<span class="status ${statusClass(g.status)}">${g.status}</span>`, `${inline(g.evidence)}${link}`];
  });
  const gatesCard = `<section class="table-card" id="review-gates"><h2>Review gates.</h2>\n${table(["Gate", "Status", "Evidence"], gateRows, ["22%", "10%", "68%"])}\n</section>`;

  const chapters = KINDS.filter((kind) => byKind(kind).length > 0);
  const nav = [
    ["review-gates", "Review gates"],
    ["walkthrough", "Walkthrough"],
    ...chapters.flatMap((kind) => byKind(kind).map((item) => [item.id, itemLabel[item.id]])),
    ...(r.question ? [["your-question", "Your question"]] : []),
    ["reference", "Reference"],
  ];
  const navHtml = `<nav class="nav" aria-label="Report sections">${nav.map(([id, label]) => `<a href="#${escapeHtml(id)}">${escapeHtml(label)}</a>`).join("")}</nav>`;

  const w = r.walkthrough;
  const stepHtml = steps
    .map((step, i) => {
      const related = items.filter((item) => item.step === step.id);
      const cls = related.some((item) => item.kind === "request") ? " issue" : related.length ? " question" : "";
      const links = related.length
        ? `<p class="small">Related: ${related.map((item) => `<a href="#${escapeHtml(item.id)}">${escapeHtml(KIND_LABEL[item.kind])}: ${inline(item.title)}</a>`).join(" · ")}</p>`
        : "";
      return `<section class="card walk-step${cls}" id="${escapeHtml(step.id)}"><h3>Step ${i + 1}. ${inline(step.title)}</h3>
<dl class="parts"><dt>How it works today</dt><dd>${inline(step.today)}</dd><dt>What changed and why</dt><dd>${inline(step.changed)}</dd><dt>Downstream effect</dt><dd>${inline(step.effect)}</dd></dl>${links}</section>`;
    })
    .join("\n");
  const walkthrough = `<section class="chapter" id="walkthrough"><h2>Walkthrough</h2>
<article class="card">
<h3>Problem</h3><p>${inline(w.problem)}</p>
<h3>System today</h3><ol class="flow">${w.systemToday.map((st) => `<li>${inline(st)}</li>`).join("")}</ol>
<h3>Core intuition</h3><p>${inline(w.coreIntuition)}</p>
<h3>Solution map</h3>${table(["Component", "Problem it solves"], w.solutionMap.map((row) => [inline(row.component), inline(row.solves)]), ["35%", "65%"])}
<h3>Map</h3>${mermaid(w.flowchart, true)}
</article>
${stepHtml}
</section>`;

  const itemChapters = chapters
    .map((kind) => `<section class="chapter" id="${KIND_CHAPTER[kind]}"><h2>${escapeHtml(KIND_LABEL[kind])}</h2>\n${byKind(kind).map((item, i) => renderItem(r, item, i + 1, steps)).join("\n")}\n</section>`)
    .join("\n");

  const question = r.question
    ? `<section class="chapter" id="your-question"><h2>Your question</h2><article class="card"><h3>${inline(r.question.question)}</h3><p>${inline(r.question.answer)}</p>${
        r.question.rows?.length
          ? table(["Thread", "State", "Evidence"], r.question.rows.map((row) => [inline(row.thread), escapeHtml(row.state), inline(row.evidence)]), ["35%", "15%", "50%"])
          : ""
      }</article></section>`
    : "";

  const cov = r.coverage;
  const reference = `<section class="chapter" id="reference"><h2>Reference</h2>
<details id="coverage" open><summary>Coverage</summary>
<h4>Checked</h4><ul>${cov.checked.map((v) => `<li>${inline(v)}</li>`).join("")}</ul>
<h4>Evidence gaps</h4>${cov.gaps.length ? `<ul>${cov.gaps.map((v) => `<li>${inline(v)}</li>`).join("")}</ul>` : "<p>None.</p>"}
</details>
${r.claims?.length ? `<details><summary>Claims ledger</summary>${table(["Claim", "Source", "Result"], r.claims.map((c) => [inline(c.claim), inline(c.source), inline(c.result)]), ["40%", "20%", "40%"])}</details>` : ""}
<details><summary>Skills loaded and used</summary>${table(["Skill", "Source", "Why loaded", "How used"], r.skills.map((sk) => [`<code>${escapeHtml(sk.skill)}</code>`, escapeHtml(sk.source), inline(sk.why), inline(sk.how)]), ["20%", "15%", "30%", "35%"])}${
    r.marketplace ? `<p class="small">${inline(r.marketplace)}</p>` : ""
  }</details>
</section>`;

  const body = [
    hero,
    gatesCard,
    navHtml,
    "<main>",
    walkthrough,
    itemChapters,
    question,
    reference,
    "</main>",
    '<footer class="foot">Prepared for a manual review. No GitHub review was submitted and no source file was changed.</footer>',
  ]
    .filter(Boolean)
    .join("\n");
  const title = `PR review: ${r.repo}#${r.number}`;
  return template.replace("{{TITLE}}", () => escapeHtml(title)).replace("{{BODY}}", () => body);
}

const HELP = `Usage: render.mjs <report.json> [--out <report.html>]

Validates /pr-validate report data and renders the standard HTML report.
The default output path replaces .json with .html. On validation errors,
prints one "field: problem" line per error to stderr, writes nothing, and exits 1.

Field shape: example.json next to this script.
Text fields allow only \`code\` spans and [label](https://...) or [label](#id) links.
Word limits: ${Object.entries(LIMITS)
  .map(([k, v]) => `${k}=${v}`)
  .join(", ")}.`;

function main(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP);
    return 0;
  }
  const outIndex = argv.indexOf("--out");
  const out = outIndex >= 0 ? argv[outIndex + 1] : undefined;
  const input = argv.find((arg, i) => !arg.startsWith("--") && (outIndex < 0 || i !== outIndex + 1));
  if (!input || (outIndex >= 0 && !out)) {
    console.error(HELP);
    return 2;
  }
  let report;
  try {
    report = JSON.parse(readFileSync(input, "utf8"));
  } catch (error) {
    console.error(`${input}: cannot read JSON: ${error.message}`);
    return 1;
  }
  const errors = validate(report);
  if (errors.length > 0) {
    console.error(`${errors.length} validation error(s); nothing written:`);
    for (const e of errors) console.error(`- ${e}`);
    return 1;
  }
  const target = out ?? input.replace(/\.json$/, "") + ".html";
  writeFileSync(target, render(report));
  console.log(target);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
