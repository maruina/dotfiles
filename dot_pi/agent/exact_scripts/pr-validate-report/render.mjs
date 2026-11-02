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
const REVIEWER_QUESTIONS = [
  {
    id: "change-purpose",
    question: "Can the reviewer explain what changes and why, using an OpenSpec or proposal artifact when available rather than repeating the PR author's summary?",
  },
  { id: "necessity", question: "Is the change necessary?" },
  { id: "changed-files", question: "Are any changed files unexpected or unexplained?" },
  {
    id: "hard-to-reverse-contracts",
    question: "Does the diff change a hard-to-reverse contract: gRPC/API, public program parameters, object models or fields, or database schema?",
  },
  {
    id: "go-interfaces",
    question: "Which Go interfaces exist? If none exist, does the surrounding architecture make that normal?",
  },
  { id: "bootstrap-cycles", question: "Does bootstrap introduce a circular dependency?" },
  {
    id: "failure-observability",
    question: "Does the change create a new failure mode, and can on-call staff observe it at 4 a.m.?",
  },
  {
    id: "manual-inspection",
    question: "Can the reviewer skip manual UI, function, and algorithm inspection because an AI-written description and associated tests explain the behavior?",
  },
];

// Word limits per text field. Links count as their label; a code span counts as one word.
export const LIMITS = {
  lead: 25,
  whatItDoes: 30,
  why: 30,
  gateEvidence: 30,
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

// The collector envelope is the only evidence source. Report refs assert which
// observed added lines the report accounts for; they never prove that code was read.
// deliberate: coverage is advisory because a missing or truncated diff cannot
// separate unreviewed code from provider omission. Revisit gating only after
// representative reports show stable accounting.
const COVERAGE_DETAIL_LIMIT = 50;
const COVERAGE_DIAGNOSTIC_LIMIT = 50;

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
  const refs = (v, where) => {
    if (v === undefined) return;
    if (!Array.isArray(v)) return fail(where, "must be an array");
    v.forEach((ref, i) => {
      const at = `${where}[${i}]`;
      if (!ref || typeof ref !== "object" || Array.isArray(ref)) return fail(at, "required object");
      text(ref.path, `${at}.path`);
      const hasSide = ref.side !== undefined;
      const hasStart = ref.start !== undefined;
      const hasEnd = ref.end !== undefined;
      if (!hasSide && !hasStart && !hasEnd) return;
      if (!hasSide || !hasStart || !hasEnd) return fail(at, "a line ref needs side, start, and end, or only path");
      oneOf(ref.side, ["R", "L"], `${at}.side`);
      if (!Number.isSafeInteger(ref.start) || ref.start < 1) fail(`${at}.start`, "must be a positive safe integer");
      if (!Number.isSafeInteger(ref.end) || ref.end < ref.start) fail(`${at}.end`, "must be a safe integer >= start");
    });
  };
  const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  if (!r || typeof r !== "object") return ["report: must be a JSON object"];
  if (r.schemaVersion !== 2) fail("schemaVersion", "must be 2");
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
    refs(item?.refs, `${at}.refs`);
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

  const systemView = (view, where) => {
    if (!view || typeof view !== "object" || Array.isArray(view)) {
      fail(where, "required object");
      return;
    }
    text(view.explanation, `${where}.explanation`, LIMITS.slot);
    text(view.diagram, `${where}.diagram`);
  };
  systemView(w.systemToday, "walkthrough.systemToday");
  systemView(w.proposedSystem, "walkthrough.proposedSystem");
  const seenSteps = new Set();
  list(w.steps, "walkthrough.steps").forEach((step, i) => {
    const at = `walkthrough.steps[${i}]`;
    if (typeof step?.id !== "string" || !/^[a-z0-9-]+$/.test(step.id)) fail(`${at}.id`, "must match [a-z0-9-]+");
    else if (seenSteps.has(step.id) || itemIds.has(step.id)) fail(`${at}.id`, `duplicate id ${step.id}`);
    else seenSteps.add(step.id);
    text(step?.title, `${at}.title`, LIMITS.stepTitle);
    text(step?.description, `${at}.description`, LIMITS.stepPart);
    refs(step?.refs, `${at}.refs`);
  });

  if (!Array.isArray(r.reviewerQuestions)) fail("reviewerQuestions", "must be an array");
  const reviewerQuestions = Array.isArray(r.reviewerQuestions) ? r.reviewerQuestions : [];
  if (reviewerQuestions.length !== REVIEWER_QUESTIONS.length) {
    fail("reviewerQuestions", `must list all ${REVIEWER_QUESTIONS.length} fixed questions in order`);
  }
  reviewerQuestions.forEach((row, i) => {
    const at = `reviewerQuestions[${i}]`;
    const expected = REVIEWER_QUESTIONS[i];
    if (row?.id !== expected?.id) fail(`${at}.id`, `must be ${JSON.stringify(expected?.id)}`);
    if (row?.question !== expected?.question) fail(`${at}.question`, "must match the fixed question for this category");
    text(row?.question, `${at}.question`, LIMITS.short);
    text(row?.finding, `${at}.finding`, LIMITS.short);
    text(row?.decision, `${at}.decision`, LIMITS.short);
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
    refs(c?.refs, `claims[${i}].refs`);
  });
  if (r.mechanical !== undefined) {
    if (!Array.isArray(r.mechanical)) fail("mechanical", "must be an array");
    else {
      r.mechanical.forEach((group, i) => {
        const at = `mechanical[${i}]`;
        text(group?.summary, `${at}.summary`, LIMITS.short);
        if (!Array.isArray(group?.refs) || group.refs.length === 0) fail(`${at}.refs`, "must be a nonempty array");
        else refs(group.refs, `${at}.refs`);
      });
    }
  }
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

function systemDiagram(title, system) {
  return `<article class="card"><h3>${escapeHtml(title)}</h3><p>${inline(system.explanation)}</p>${mermaid(system.diagram, false)}</article>`;
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

function decodeQuotedPath(raw) {
  const bytes = [];
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch !== "\\") {
      for (const byte of Buffer.from(ch, "utf8")) bytes.push(byte);
      continue;
    }
    i += 1;
    if (i >= raw.length) return null;
    const simple = { a: 0x07, b: 0x08, f: 0x0c, n: 0x0a, r: 0x0d, t: 0x09, v: 0x0b, "\\": 0x5c, '"': 0x22 };
    if (Object.hasOwn(simple, raw[i])) {
      bytes.push(simple[raw[i]]);
      continue;
    }
    const octal = /^[0-7]{1,3}/.exec(raw.slice(i));
    if (!octal) return null;
    bytes.push(parseInt(octal[0], 8) & 0xff);
    i += octal[0].length - 1;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(bytes));
  } catch {
    return null;
  }
}

function scanQuoted(text) {
  if (!text.startsWith('"')) return null;
  for (let i = 1; i < text.length; i += 1) {
    if (text[i] === "\\") {
      i += 1;
      continue;
    }
    if (text[i] === '"') {
      const value = decodeQuotedPath(text.slice(1, i));
      return value === null ? null : { value, end: i + 1 };
    }
  }
  return null;
}

function stripPrefix(value, prefix) {
  return typeof value === "string" && value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function headerPath(text) {
  if (text.startsWith('"')) {
    const quoted = scanQuoted(text);
    return quoted ? quoted.value : null;
  }
  const tab = text.indexOf("\t");
  return tab >= 0 ? text.slice(0, tab) : text;
}

function diffGitPaths(text) {
  if (text.startsWith('"')) {
    const old = scanQuoted(text);
    if (!old) return { oldPath: null, newPath: null, ambiguous: true };
    let i = old.end;
    while (text[i] === " ") i += 1;
    const next = scanQuoted(text.slice(i));
    if (!next) return { oldPath: stripPrefix(old.value, "a/"), newPath: null, ambiguous: true };
    return { oldPath: stripPrefix(old.value, "a/"), newPath: stripPrefix(next.value, "b/"), ambiguous: false };
  }
  if (!text.startsWith("a/")) return { oldPath: null, newPath: null, ambiguous: true };
  const body = text.slice(2);
  const middle = (body.length - 3) / 2;
  if (Number.isInteger(middle) && middle > 0 && body.slice(middle, middle + 3) === " b/") {
    const left = body.slice(0, middle);
    const right = body.slice(middle + 3);
    if (left === right) return { oldPath: left, newPath: right, ambiguous: false };
  }
  const separator = body.indexOf(" b/");
  if (separator > 0) {
    const oldPath = body.slice(0, separator);
    const newPath = body.slice(separator + 3);
    return { oldPath, newPath, ambiguous: oldPath.includes(" ") || newPath.includes(" ") };
  }
  return { oldPath: null, newPath: null, ambiguous: true };
}

function parseUnifiedDiff(diff) {
  const files = [];
  let current = null;
  let hunk = null;
  const body = diff.endsWith("\n") ? diff.slice(0, -1) : diff;

  const addLine = (runs, line) => {
    const last = runs[runs.length - 1];
    if (last && last.end + 1 === line) last.end = line;
    else runs.push({ start: line, end: line });
  };
  const closeHunk = () => {
    if (!hunk) return;
    if (hunk.oldRemaining !== 0 || hunk.newRemaining !== 0) current.issues.push("hunk counts do not match the patch body");
    hunk = null;
  };
  const closeFile = () => {
    if (!current) return;
    closeHunk();
    files.push(current);
    current = null;
  };

  for (const line of body.split("\n")) {
    if (line.startsWith("diff --git ")) {
      closeFile();
      const paths = diffGitPaths(line.slice("diff --git ".length));
      current = {
        oldPath: paths.oldPath,
        newPath: paths.newPath,
        renameFrom: null,
        renameTo: null,
        adds: [],
        dels: [],
        issues: [],
        hasPatch: false,
        binary: false,
      };
      continue;
    }
    if (!current) continue;
    if (line.startsWith("@@")) {
      closeHunk();
      const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (!match) {
        current.issues.push("unparseable hunk header");
        continue;
      }
      const oldStart = Number(match[1]);
      const oldCount = match[2] === undefined ? 1 : Number(match[2]);
      const newStart = Number(match[3]);
      const newCount = match[4] === undefined ? 1 : Number(match[4]);
      if (![oldStart, oldCount, newStart, newCount].every((n) => Number.isSafeInteger(n) && n >= 0)) {
        current.issues.push("hunk line numbers are out of range");
        continue;
      }
      current.hasPatch = true;
      hunk = { oldRemaining: oldCount, newRemaining: newCount, oldLine: oldStart, newLine: newStart };
      continue;
    }
    if (hunk) {
      if (line === "\\ No newline at end of file") continue;
      if (line.startsWith("+")) {
        addLine(current.adds, hunk.newLine);
        hunk.newLine += 1;
        hunk.newRemaining -= 1;
      } else if (line.startsWith("-")) {
        addLine(current.dels, hunk.oldLine);
        hunk.oldLine += 1;
        hunk.oldRemaining -= 1;
      } else if (line.startsWith(" ")) {
        hunk.newLine += 1;
        hunk.oldLine += 1;
        hunk.newRemaining -= 1;
        hunk.oldRemaining -= 1;
      } else {
        current.issues.push("unexpected hunk body line");
      }
      if (hunk.oldRemaining < 0 || hunk.newRemaining < 0) current.issues.push("hunk counts do not match the patch body");
      continue;
    }
    if (line.startsWith("--- ")) current.oldPath = stripPrefix(headerPath(line.slice(4)), "a/");
    else if (line.startsWith("+++ ")) current.newPath = stripPrefix(headerPath(line.slice(4)), "b/");
    else if (line.startsWith("rename from ")) current.renameFrom = headerPath(line.slice("rename from ".length));
    else if (line.startsWith("rename to ")) current.renameTo = headerPath(line.slice("rename to ".length));
    else if (line.startsWith("Binary files ") || line.startsWith("GIT binary patch")) current.binary = true;
  }
  closeFile();

  for (const file of files) {
    if (file.oldPath === "/dev/null") file.oldPath = null;
    if (file.newPath === "/dev/null") file.newPath = null;
    file.oldPath = file.oldPath ?? file.renameFrom;
    file.newPath = file.newPath ?? file.renameTo;
  }
  return files;
}

function mergeRanges(ranges) {
  if (ranges.length === 0) return [];
  const sorted = ranges.map((r) => ({ start: r.start, end: r.end })).sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [sorted[0]];
  for (const range of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (range.start <= last.end + 1) last.end = Math.max(last.end, range.end);
    else merged.push(range);
  }
  return merged;
}

function intersectRanges(ranges, start, end) {
  const out = [];
  for (const range of ranges) {
    if (range.end < start) continue;
    if (range.start > end) break;
    out.push({ start: Math.max(range.start, start), end: Math.min(range.end, end) });
  }
  return out;
}

function subtractRanges(base, cut) {
  const out = [];
  for (const range of base) {
    let cursor = range.start;
    for (const taken of cut) {
      if (taken.end < cursor) continue;
      if (taken.start > range.end) break;
      if (taken.start > cursor) out.push({ start: cursor, end: Math.min(taken.start - 1, range.end) });
      cursor = Math.max(cursor, taken.end + 1);
      if (cursor > range.end) break;
    }
    if (cursor <= range.end) out.push({ start: cursor, end: range.end });
  }
  return out;
}

function rangeCount(ranges) {
  return ranges.reduce((sum, range) => sum + (range.end - range.start + 1), 0);
}

function isWellFormedRef(ref) {
  if (!ref || typeof ref !== "object" || Array.isArray(ref)) return false;
  if (typeof ref.path !== "string" || ref.path.trim() === "") return false;
  if (ref.side === undefined && ref.start === undefined && ref.end === undefined) return true;
  return (ref.side === "R" || ref.side === "L")
    && Number.isSafeInteger(ref.start) && ref.start >= 1
    && Number.isSafeInteger(ref.end) && ref.end >= ref.start;
}

function computeLineCoverage(report, options) {
  const loaded = options?.evidence;
  if (!loaded || loaded.status === "missing") return { available: false, reason: "no evidence file was supplied" };
  if (loaded.status === "error") return { available: false, reason: loaded.reason };
  const evidence = loaded.value;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return { available: false, reason: "evidence is not a JSON object" };
  }
  if (evidence.schemaVersion !== 1) return { available: false, reason: "evidence schemaVersion is not 1" };
  const sources = evidence.collection?.sources;
  if (sources?.metadata?.status !== "complete") {
    return { available: false, reason: `metadata source is ${sources?.metadata?.status ?? "missing"}; cannot confirm the head SHA` };
  }
  if (sources?.diff?.status !== "complete") {
    return { available: false, reason: `diff source is ${sources?.diff?.status ?? "missing"}` };
  }
  const pr = evidence.pr;
  if (!pr || typeof pr !== "object" || Array.isArray(pr)) return { available: false, reason: "evidence has no pull request metadata" };
  const expectedUrl = `https://github.com/${report.repo}/pull/${report.number}`;
  if (pr.url !== expectedUrl) return { available: false, reason: "evidence is for a different pull request" };
  if (pr.headRefOid !== report.headSha) return { available: false, reason: "evidence head SHA does not match the report head SHA" };
  if (typeof evidence.diff !== "string" || evidence.diff.trim() === "") {
    return { available: false, reason: "collected diff has no content" };
  }

  const files = parseUnifiedDiff(evidence.diff);
  const metadataFiles = Array.isArray(pr.files) ? pr.files.filter((file) => file && typeof file.path === "string") : [];
  const metadataByPath = new Map(metadataFiles.map((file) => [file.path, file]));
  const parsedPaths = new Set(files.flatMap((file) => [file.oldPath, file.newPath]).filter(Boolean));

  for (const file of files) {
    const key = file.newPath ?? file.oldPath;
    const metadata = key ? metadataByPath.get(key) : undefined;
    if (metadata && Number.isInteger(metadata.additions) && Number.isInteger(metadata.deletions)) {
      if (metadata.additions !== rangeCount(file.adds) || metadata.deletions !== rangeCount(file.dels)) {
        file.issues.push("diff line counts do not match PR metadata");
      }
    }
    if (!file.oldPath && !file.newPath) file.issues.push("unparseable file path");
  }

  const exceptionReason = (file) => {
    const reasons = new Set(file.issues);
    if (file.binary) reasons.add("binary file; no line data");
    if (!file.hasPatch && !file.binary) {
      reasons.add(file.renameFrom && file.renameTo ? "pure rename; no line changes" : "no diff content");
    }
    return reasons.size > 0 ? [...reasons].join("; ") : null;
  };

  const measured = [];
  const exceptions = [];
  for (const file of files) {
    const reason = exceptionReason(file);
    const filePath = file.newPath ?? file.oldPath ?? "(unknown path)";
    if (reason) exceptions.push({ path: filePath, reason });
    else measured.push(file);
  }
  for (const metadata of metadataFiles) {
    if (!parsedPaths.has(metadata.path)) exceptions.push({ path: metadata.path, reason: "no diff content in collected evidence" });
  }

  const additionsByPath = new Map();
  const deletionsByPath = new Map();
  for (const file of measured) {
    if (file.newPath) additionsByPath.set(file.newPath, mergeRanges(file.adds));
    if (file.oldPath) deletionsByPath.set(file.oldPath, mergeRanges(file.dels));
  }

  const coveredByPath = new Map();
  const diagnostics = [];
  const addCovered = (filePath, ranges) => {
    coveredByPath.set(filePath, mergeRanges([...(coveredByPath.get(filePath) ?? []), ...ranges]));
  };
  const collect = (owner, where) => {
    if (!Array.isArray(owner?.refs)) return;
    owner.refs.forEach((ref, index) => {
      if (!isWellFormedRef(ref)) return;
      const at = `${where}[${index}]`;
      const additions = additionsByPath.get(ref.path) ?? [];
      const deletions = deletionsByPath.get(ref.path) ?? [];
      if (additions.length === 0 && deletions.length === 0) {
        diagnostics.push(`${at}: no observed changed lines for ${ref.path}`);
        return;
      }
      if (ref.side === undefined) {
        if (additions.length > 0) addCovered(ref.path, additions);
        return;
      }
      const base = ref.side === "R" ? additions : deletions;
      const hits = intersectRanges(base, ref.start, ref.end);
      if (hits.length === 0) {
        const side = ref.side === "R" ? "added" : "deleted";
        diagnostics.push(`${at}: no observed ${side} lines in ${ref.path}:${ref.start}-${ref.end}`);
        return;
      }
      if (ref.side === "R") addCovered(ref.path, hits);
    });
  };
  (report.walkthrough?.steps ?? []).forEach((step, i) => collect(step, `walkthrough.steps[${i}].refs`));
  (report.items ?? []).forEach((item, i) => collect(item, `items[${i}].refs`));
  (report.claims ?? []).forEach((claim, i) => collect(claim, `claims[${i}].refs`));
  (report.mechanical ?? []).forEach((group, i) => collect(group, `mechanical[${i}].refs`));

  const uncoveredRanges = [];
  for (const [filePath, ranges] of additionsByPath) {
    for (const range of subtractRanges(ranges, coveredByPath.get(filePath) ?? [])) {
      uncoveredRanges.push({ path: filePath, ...range });
    }
  }
  const deletionRanges = [];
  for (const [filePath, ranges] of deletionsByPath) {
    for (const range of ranges) deletionRanges.push({ path: filePath, ...range });
  }

  const observedAdditions = [...additionsByPath.values()].reduce((n, ranges) => n + rangeCount(ranges), 0);
  const coveredAdditions = [...coveredByPath.values()].reduce((n, ranges) => n + rangeCount(ranges), 0);
  const deletedLines = [...deletionsByPath.values()].reduce((n, ranges) => n + rangeCount(ranges), 0);

  const declared = Number.isSafeInteger(pr.changedFiles) && pr.changedFiles >= 0 ? pr.changedFiles : null;
  const listed = metadataFiles.length;
  let inventory = "unknown";
  let unlisted = 0;
  if (declared !== null) {
    if (listed < declared) {
      inventory = "incomplete";
      unlisted = declared - listed;
    } else inventory = listed > declared ? "inconsistent" : "complete";
  }
  const parsedAdditions = files.reduce((n, file) => n + rangeCount(file.adds), 0);
  const parsedDeletions = files.reduce((n, file) => n + rangeCount(file.dels), 0);
  const aggregateMismatch = (Number.isSafeInteger(pr.additions) && parsedAdditions !== pr.additions)
    || (Number.isSafeInteger(pr.deletions) && parsedDeletions !== pr.deletions);

  const measurementNotes = [];
  if (declared === null) measurementNotes.push("the collector did not report a changed-file count");
  if (inventory === "incomplete") measurementNotes.push(`${unlisted} changed file${unlisted === 1 ? " is" : "s are"} not in the file inventory`);
  if (inventory === "inconsistent") measurementNotes.push("the file inventory is larger than the declared changed-file count");
  if (exceptions.length > 0) measurementNotes.push(`${exceptions.length} file${exceptions.length === 1 ? " has" : "s have"} no usable line data`);
  if (aggregateMismatch) measurementNotes.push("the collected diff does not match the PR addition or deletion totals");
  const measurement = declared === null || !Number.isSafeInteger(pr.additions) || !Number.isSafeInteger(pr.deletions)
    ? "unknown"
    : inventory === "complete" && exceptions.length === 0 && !aggregateMismatch
      ? "complete"
      : "partial";

  const entries = [
    ...uncoveredRanges.map((range) => ({ kind: "Uncovered", path: range.path, side: "R", start: range.start, end: range.end })),
    ...deletionRanges.map((range) => ({ kind: "Deleted", path: range.path, side: "L", start: range.start, end: range.end })),
    ...exceptions.map((exception) => ({ kind: "Unmeasured", path: exception.path, side: "Z", start: 0, end: 0, reason: exception.reason })),
  ].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
    || (a.side < b.side ? -1 : a.side > b.side ? 1 : 0)
    || a.start - b.start);

  return {
    available: true,
    observedAdditions,
    coveredAdditions,
    uncoveredAdditions: observedAdditions - coveredAdditions,
    uncoveredRanges,
    deletionRanges,
    deletedLines,
    exceptions,
    inventory,
    declared,
    listed,
    unlisted,
    measurement,
    measurementNotes,
    entries: entries.slice(0, COVERAGE_DETAIL_LIMIT),
    omittedEntries: Math.max(0, entries.length - COVERAGE_DETAIL_LIMIT),
    diagnostics: diagnostics.slice(0, COVERAGE_DIAGNOSTIC_LIMIT),
    omittedDiagnostics: Math.max(0, diagnostics.length - COVERAGE_DIAGNOSTIC_LIMIT),
  };
}

function lineCoverageSection(r, coverage) {
  if (!coverage.available) {
    return `<details id="line-coverage" open><summary>Line coverage</summary>\n<p><strong>Line coverage unavailable.</strong> ${escapeHtml(coverage.reason)}</p></details>`;
  }
  const files = (n) => `${n} changed file${n === 1 ? "" : "s"}`;
  const inventory = coverage.inventory === "complete"
    ? `complete (${coverage.listed} of ${coverage.declared} changed files)`
    : coverage.inventory === "incomplete"
      ? `incomplete (${coverage.listed} of ${coverage.declared} changed files listed; ${coverage.unlisted} unlisted ${coverage.unlisted === 1 ? "file remains" : "files remain"} unmeasured)`
      : coverage.inventory === "inconsistent"
        ? `inconsistent (${coverage.listed} listed for ${coverage.declared} declared changed files)`
        : "unknown (the collector did not report a changed-file count)";
  const rows = coverage.entries.map((entry) => {
    const location = entry.kind === "Unmeasured"
      ? escapeHtml(entry.reason)
      : entry.kind === "Uncovered"
        ? `<a href="${escapeHtml(permalink(r, entry.path, entry.start, entry.end))}">${entry.start === entry.end ? entry.start : `${entry.start}-${entry.end}`}</a>`
        : entry.start === entry.end ? `${entry.start}` : `${entry.start}-${entry.end}`;
    return `<tr><td>${entry.kind}</td><td><code>${escapeHtml(entry.path)}</code></td><td>${location}</td></tr>`;
  }).join("\n");
  const details = coverage.entries.length > 0
    ? `<table><colgroup><col style="width:14%"><col style="width:46%"><col style="width:40%"></colgroup><thead><tr><th>Kind</th><th>Path</th><th>Lines or reason</th></tr></thead><tbody>\n${rows}\n</tbody></table>`
    : "<p>No uncovered added lines, deleted lines, or unmeasured files.</p>";
  const detailCount = `<p class="small">Detail entries: ${coverage.entries.length} shown, ${coverage.omittedEntries} omitted.</p>`;
  const notes = coverage.measurementNotes.length > 0 ? `<p class="small">Measurement limits: ${coverage.measurementNotes.map(escapeHtml).join("; ")}.</p>` : "";
  const diagnostics = coverage.diagnostics.length > 0
    ? `<ul>${coverage.diagnostics.map((diagnostic) => `<li>${escapeHtml(diagnostic)}</li>`).join("")}</ul>`
    : "<p>None.</p>";
  const omittedDiagnostics = coverage.omittedDiagnostics > 0 ? `<p class="small">${coverage.omittedDiagnostics} more diagnostics not shown.</p>` : "";
  return `<details id="line-coverage" open><summary>Line coverage</summary>
<p>Observed added lines: <strong>${coverage.observedAdditions}</strong>. Covered: <strong>${coverage.coveredAdditions}</strong>. Uncovered: <strong>${coverage.uncoveredAdditions}</strong> in ${coverage.uncoveredRanges.length} ${coverage.uncoveredRanges.length === 1 ? "range" : "ranges"}. Deleted lines: <strong>${coverage.deletedLines}</strong> in ${coverage.deletionRanges.length} ${coverage.deletionRanges.length === 1 ? "range" : "ranges"}. Unmeasured files: <strong>${coverage.exceptions.length}</strong>.</p>
<p>Inventory: ${inventory}. Measurement: ${coverage.measurement}.</p>
${notes}
<h4>Coverage details</h4>
${details}
${detailCount}
<h4>Ref diagnostics</h4>
${diagnostics}
${omittedDiagnostics}</details>`;
}

export function render(r, template = readFileSync(path.join(HERE, "template.html"), "utf8"), options = {}) {
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
    ["reviewer-questions", "Reviewer questions"],
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
<p>${inline(step.description)}</p>${links}</section>`;
    })
    .join("\n");
  const walkthrough = `<section class="chapter" id="walkthrough"><h2>Walkthrough</h2>
${systemDiagram("System today", w.systemToday)}
${systemDiagram("Proposed system", w.proposedSystem)}
${stepHtml}
</section>`;

  const reviewerQuestionsSection = `<section class="table-card chapter" id="reviewer-questions"><h2>Reviewer questions.</h2>
${table(
  ["Question", "What the review found", "Your decision"],
  r.reviewerQuestions.map((row) => [inline(row.question), inline(row.finding), inline(row.decision)]),
  ["34%", "33%", "33%"],
)}
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
  const lineCoverage = computeLineCoverage(r, options);
  const reference = `<section class="chapter" id="reference"><h2>Reference</h2>
<details id="coverage" open><summary>Coverage</summary>
<h4>Checked</h4><ul>${cov.checked.map((v) => `<li>${inline(v)}</li>`).join("")}</ul>
<h4>Evidence gaps</h4>${cov.gaps.length ? `<ul>${cov.gaps.map((v) => `<li>${inline(v)}</li>`).join("")}</ul>` : "<p>None.</p>"}
</details>
${lineCoverageSection(r, lineCoverage)}
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
    reviewerQuestionsSection,
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

const HELP = `Usage: render.mjs <report.json> [--out <report.html>] [--evidence <evidence.json>]

Validates /pr-validate report data and renders the standard HTML report.
The default output path replaces .json with .html. On validation errors,
prints one "field: problem" line per error to stderr, writes nothing, and exits 1.

--evidence reads the collector envelope for advisory line coverage. Without it,
the report renders with line coverage unavailable. Coverage never changes the
verdict or gates, and refs never prove that code was read.

Field shape: example.json next to this script. Each item requires a \`priorComments\` array.
Optional refs on a walkthrough step, item, or claim are {path} or {path, side, start, end}.
Optional mechanical groups are {summary, refs} with nonempty refs and a 40-word summary.
Text fields allow only \`code\` spans and [label](https://...) or [label](#id) links.
Word limits: ${Object.entries(LIMITS)
  .map(([k, v]) => `${k}=${v}`)
  .join(", ")}.`;

function readEvidence(file) {
  try {
    return { status: "loaded", value: JSON.parse(readFileSync(file, "utf8")) };
  } catch (error) {
    return { status: "error", reason: error instanceof SyntaxError ? "evidence file is not valid JSON" : "evidence file cannot be read" };
  }
}

function main(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP);
    return 0;
  }
  const outIndex = argv.indexOf("--out");
  const evidenceIndex = argv.indexOf("--evidence");
  const out = outIndex >= 0 ? argv[outIndex + 1] : undefined;
  const evidencePath = evidenceIndex >= 0 ? argv[evidenceIndex + 1] : undefined;
  const valueIndexes = new Set([outIndex, evidenceIndex].filter((index) => index >= 0).map((index) => index + 1));
  const input = argv.find((arg, i) => !arg.startsWith("--") && !valueIndexes.has(i));
  if (!input || (outIndex >= 0 && (!out || out.startsWith("--"))) || (evidenceIndex >= 0 && (!evidencePath || evidencePath.startsWith("--")))) {
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
  const evidence = evidencePath ? readEvidence(evidencePath) : { status: "missing" };
  writeFileSync(target, render(report, undefined, { evidence }));
  console.log(target);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
