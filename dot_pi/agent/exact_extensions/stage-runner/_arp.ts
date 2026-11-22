import * as fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type Operation = "get_status" | "request_review" | "get_findings";
export const arpTool = (op: Operation) => "mcp__agentic_review__agentic_review_" + op;
export type ReviewCall = { name: string; input: Record<string, string | number | boolean>; head: string };
export type ReviewClock = { now: () => number; sleep: (ms: number, signal: AbortSignal) => Promise<void> };
const clock: ReviewClock = { now: () => performance.now(), sleep: (ms, signal) => sleep(ms, undefined, { signal }) };
const fullSha = (value: unknown) => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

export function reviewGuard(call: Pick<ReviewCall, "name" | "input">) {
  let available = true;
  let discovery = true;
  const input = { ...call.input };
  const name = call.name;
  return (event: { toolName: string; input: unknown; parentToolCallId?: string }) => {
    if (!event.parentToolCallId) {
      if (event.toolName === "tool_search" && discovery && available) {
        discovery = false;
        return;
      }
      const args = record(event.input);
      if (available && event.toolName === name && args && Object.keys(args).length === Object.keys(input).length &&
          Object.entries(input).every(([key, value]) => args[key] === value)) {
        // Spend the budget before dispatch, including for sibling calls in the same turn.
        available = false;
        return;
      }
    }
    return { block: true, reason: "Tool call is outside this ARP operation's authorization" } as const;
  };
}

// Loaded explicitly only by the restricted review child.
export default function arpGuard(pi: ExtensionAPI) {
  const file = process.env.PI_STAGE_RUNNER_REVIEW;
  if (!file) throw Error("Missing ARP authorization");
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.mode & 0o077 || stat.uid !== process.getuid?.() || stat.size > 4096)
    throw Error("Invalid ARP authorization file");
  const call: ReviewCall = JSON.parse(fs.readFileSync(file, "utf8"));
  if (![arpTool("get_status"), arpTool("request_review"), arpTool("get_findings")].includes(call.name))
    throw Error("Invalid ARP operation");
  pi.on("tool_call", reviewGuard(call));
}

export function reviewPayload(event: unknown) {
  const e = record(event);
  const result = record(record(e?.result)?.structuredContent);
  if (e?.isError !== false || !result || result.isError === true) return undefined;
  return record(result.structuredContent);
}

const complete = new Set([
  "REVIEW_STATUS_NO_ISSUES_FOUND", "REVIEW_STATUS_ISSUES_FOUND", "REVIEW_STATUS_COMPLETED_NO_POST",
]);
const waiting = new Set([
  "REVIEW_STATUS_UNSPECIFIED", "REVIEW_STATUS_QUEUED", "REVIEW_STATUS_IN_PROGRESS",
  "REVIEW_STATUS_SKIPPED", "REVIEW_STATUS_FAILED",
]);

export async function reviewPublished(o: {
  dir: string;
  repo: string;
  number: number;
  url: string;
  head: string;
  signal: AbortSignal;
  clock?: ReviewClock;
  checkHead: (signal: AbortSignal) => Promise<void>;
  call: (call: ReviewCall, signal: AbortSignal, wallMs: number) => Promise<Record<string, unknown> | undefined>;
  progress: (message: string) => void;
}) {
  const time = o.clock ?? clock;
  const deadline = time.now() + 20 * 60 * 1000;
  const signal = AbortSignal.any([o.signal, AbortSignal.timeout(20 * 60 * 1000)]);
  const [owner, repo] = o.repo.split("/");
  const target = { owner, repo, pull_number: o.number };
  let requested = false;
  let lastStatus = "not read";
  const remaining = () => {
    o.signal.throwIfAborted();
    const ms = Math.ceil(deadline - time.now());
    if (ms <= 0 || signal.aborted) throw Error("ARP review deadline expired");
    return ms;
  };
  const invoke = async (call: ReviewCall) => {
    const payload = await o.call(call, signal, remaining());
    remaining();
    if (!payload || Object.entries(target).some(([key, value]) => payload[key] !== value))
      throw Error("ARP result missing, unavailable, or for a different PR: " + call.name);
    return payload;
  };
  const read = (op: "get_status" | "get_findings") => invoke({
    name: arpTool(op), head: o.head, input: op === "get_findings" ? { ...target, status: "open" } : target,
  });
  try {
    for (;;) {
      const status = await read("get_status");
      const state = status.status;
      if (typeof state !== "string" || (!waiting.has(state) && !complete.has(state)))
        throw Error("Unknown ARP status");
      if (status.head_sha != null && status.head_sha !== "" && !fullSha(status.head_sha))
        throw Error("Invalid ARP head SHA");
      lastStatus = `${state} at ${status.head_sha || "unknown head"}`;
      if (status.head_sha === o.head) {
        if (complete.has(state)) {
          const capture = await read("get_findings");
          if (capture.reviewed_sha === o.head && capture.review_in_progress === false) {
            if (!Array.isArray(capture.findings) || capture.finding_count !== capture.findings.length)
              throw Error("Invalid ARP findings capture");
            const ids = capture.findings.map((finding: unknown) => {
              const f = record(finding);
              if (typeof f?.finding_id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(f.finding_id) || !fullSha(f.reviewed_sha))
                throw Error("Invalid open finding evidence");
              return f.finding_id;
            });
            if (new Set(ids).size !== ids.length) throw Error("Duplicate open finding IDs");
            await o.checkHead(signal);
            remaining();
            fs.writeFileSync(path.join(o.dir, "arp-review.json"), JSON.stringify({ target, head: o.head, state, ids }), {
              mode: 0o600, flag: "wx",
            });
            if (ids.length) throw Error(`Open ARP findings (${ids.length}): ${ids.join(", ")}. Inspect the findings before fixing.`);
            o.progress(`ARP review complete with no open findings for ${o.url} at ${o.head}`);
            return;
          }
        } else if (!["REVIEW_STATUS_QUEUED", "REVIEW_STATUS_IN_PROGRESS"].includes(state)) {
          const action = status.allowed_action === "REVIEW_ACTION_REVIEW_ANYWAY" ? "review_anyway" :
            status.allowed_action === "REVIEW_ACTION_RETRY" ? "retry" : undefined;
          if (action && !requested) {
            await o.checkHead(signal);
            remaining();
            const call = { name: arpTool("request_review"), head: o.head,
              input: { ...target, action, expected_head_sha: o.head, silent: true } };
            fs.writeFileSync(path.join(o.dir, "arp-request.json"), JSON.stringify(call), { mode: 0o600, flag: "wx" });
            requested = true;
            try {
              const reply = await invoke(call);
              if (reply.head_sha !== o.head) throw Error("Request response has a different head");
            } catch {
              remaining();
              o.progress("ARP request result uncertain. Reconcile by status; do not request again.");
            }
          } else if (!requested && (state === "REVIEW_STATUS_SKIPPED" || state === "REVIEW_STATUS_FAILED")) {
            throw Error("ARP review cannot run; no permitted request action");
          }
        }
      }
      await time.sleep(Math.min(30000, remaining()), signal);
    }
  } catch (error) {
    const reason = o.signal.aborted ? "ARP review cancelled" : signal.aborted ? "ARP review deadline expired" :
      error instanceof Error ? error.message : String(error);
    throw Error(`${o.url} at ${o.head}; ${reason}; last ARP status: ${lastStatus}; ` +
      `${requested ? "one request reserved; do not retry it automatically" : "no request reserved"}`);
  }
}
