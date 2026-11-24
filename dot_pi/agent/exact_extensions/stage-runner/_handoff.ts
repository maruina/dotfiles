import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { writeAtomicJson } from "../_shared/fs.ts";

export type HandoffStage =
  | "execute"
  | "simplify"
  | "verify"
  | "startup-check"
  | "arp-fix"
  | "design-draft"
  | "design-review"
  | "design-plan";

const VALID_STAGES = new Set<string>([
  "execute",
  "simplify",
  "verify",
  "startup-check",
  "arp-fix",
  "design-draft",
  "design-review",
  "design-plan",
]);

const nonblank = (s: unknown): s is string => typeof s === "string" && s.trim().length > 0;
const oid = (v: unknown): v is string => typeof v === "string" && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(v);
const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const positiveInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;

export function validateHandoffPayload(raw: unknown, stage: HandoffStage): Record<string, unknown> {
  if (!isRecord(raw) || raw.schemaVersion !== 1 || raw.stage !== stage || !nonblank(raw.summary)) {
    throw Error("Invalid handoff header");
  }
  if (stage === "design-draft" || stage === "design-plan") {
    const draft = stage === "design-draft";
    if (!nonblank(raw[draft ? "designPath" : "planPath"]) || !oid(raw[draft ? "draftCommit" : "planCommit"])) {
      throw Error("Invalid managed artifact");
    }
    return raw;
  }
  if (stage === "design-review") {
    if (
      !oid(raw.reviewedBlob) ||
      !(raw.status === "clean" || (raw.status === "needs-human" && Array.isArray(raw.questions) && raw.questions.length > 0 && raw.questions.every(nonblank)))
    ) {
      throw Error("Invalid design review");
    }
    return raw;
  }
  if (stage === "startup-check") {
    if (!oid(raw.head) || !oid(raw.planBlob) || !(raw.status === "fits" || (raw.status === "blocked" && nonblank(raw.reason)))) {
      throw Error("Invalid startup-check verdict");
    }
    return raw;
  }
  if (stage === "arp-fix") {
    if (
      !Array.isArray(raw.findings) ||
      !raw.findings.every((entry) => {
        if (!isRecord(entry) || !positiveInt(entry.id)) return false;
        if (entry.disposition === "needs-operator") return nonblank(entry.reason);
        return entry.disposition === "fixed" && oid(entry.fixSha) && nonblank(entry.changeSummary);
      })
    ) {
      throw Error("Invalid arp-fix findings");
    }
    return raw;
  }
  if (stage === "verify") {
    if (
      typeof raw.status !== "string" ||
      !["BLOCKED", "VERIFIED"].includes(raw.status) ||
      (raw.findings !== undefined && (!Array.isArray(raw.findings) || !raw.findings.every(isRecord)))
    ) {
      throw Error("Invalid verdict");
    }
  } else {
    const blocker = isRecord(raw.blocker) ? raw.blocker : undefined;
    if (
      raw.status !== "success" &&
      !(raw.status === "blocked" && blocker && ["step", "reason", "evidence", "nextAction"].every((k) => nonblank(blocker[k])))
    ) {
      throw Error("Invalid writer status or blocker");
    }
  }
  return raw;
}

export default function stageRunnerHandoff(pi: ExtensionAPI): void {
  const handoffPath = process.env.PI_STAGE_RUNNER_HANDOFF ?? process.env.PI_DESIGN_HANDOFF;
  const stage = process.env.PI_STAGE_RUNNER_STAGE ?? process.env.PI_DESIGN_STAGE;
  if (!handoffPath || !stage || !VALID_STAGES.has(stage)) return;
  const typedStage = stage as HandoffStage;

  pi.registerTool({
    name: "submit_stage_handoff",
    label: "Submit stage handoff",
    description:
      "Validate and atomically write this stage's private (0600) JSON handoff file. Prefer this tool over manually writing the handoff file so schema errors are caught immediately.",
    parameters: Type.Object({
      summary: Type.String({ description: "Nonblank summary of the stage result." }),
      status: Type.Optional(Type.String({ description: "Stage verdict or status (e.g. success, blocked, VERIFIED, BLOCKED, fits, clean, needs-human)." })),
      blocker: Type.Optional(
        Type.Object({
          step: Type.String(),
          reason: Type.String(),
          evidence: Type.String(),
          nextAction: Type.String(),
        }),
      ),
      findings: Type.Optional(Type.Array(Type.Record(Type.String(), Type.Unknown()))),
      head: Type.Optional(Type.String()),
      planBlob: Type.Optional(Type.String()),
      reason: Type.Optional(Type.String()),
      reviewedBlob: Type.Optional(Type.String()),
      questions: Type.Optional(Type.Array(Type.String())),
      designPath: Type.Optional(Type.String()),
      draftCommit: Type.Optional(Type.String()),
      planPath: Type.Optional(Type.String()),
      planCommit: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params) {
      const payload: Record<string, unknown> = {
        schemaVersion: 1,
        stage: typedStage,
        ...params,
      };
      validateHandoffPayload(payload, typedStage);
      const encoded = JSON.stringify(payload);
      if (Buffer.byteLength(encoded, "utf8") > 65536) {
        throw Error("Oversized handoff: must be <= 64 KiB");
      }
      writeAtomicJson(handoffPath, payload, { mode: 0o600 });
      return {
        content: [{ type: "text" as const, text: `Wrote validated ${typedStage} handoff to ${handoffPath} (0600).` }],
        details: { path: handoffPath, stage: typedStage },
      };
    },
  });
}
