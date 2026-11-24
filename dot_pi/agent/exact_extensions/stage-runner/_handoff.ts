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

export function validateHandoffPayload(h: any, stage: HandoffStage) {
  if (h?.schemaVersion !== 1 || h.stage !== stage || !nonblank(h.summary)) {
    throw Error("Invalid handoff header");
  }
  if (stage === "design-draft" || stage === "design-plan") {
    const draft = stage === "design-draft";
    if (!nonblank(h[draft ? "designPath" : "planPath"]) || !oid(h[draft ? "draftCommit" : "planCommit"])) {
      throw Error("Invalid managed artifact");
    }
    return h;
  }
  if (stage === "design-review") {
    if (
      !oid(h.reviewedBlob) ||
      !(h.status === "clean" || (h.status === "needs-human" && Array.isArray(h.questions) && h.questions.length && h.questions.every(nonblank)))
    ) {
      throw Error("Invalid design review");
    }
    return h;
  }
  if (stage === "startup-check") {
    if (!oid(h.head) || !oid(h.planBlob) || !(h.status === "fits" || (h.status === "blocked" && nonblank(h.reason)))) {
      throw Error("Invalid startup-check verdict");
    }
    return h;
  }
  if (stage === "arp-fix") return h;
  if (stage === "verify") {
    if (
      !["BLOCKED", "VERIFIED"].includes(h.status) ||
      (h.findings !== undefined &&
        (!Array.isArray(h.findings) ||
          !h.findings.every((f: unknown) => f !== null && typeof f === "object" && !Array.isArray(f))))
    ) {
      throw Error("Invalid verdict");
    }
  } else if (
    h.status !== "success" &&
    !(h.status === "blocked" && ["step", "reason", "evidence", "nextAction"].every((k) => nonblank(h.blocker?.[k])))
  ) {
    throw Error("Invalid writer status or blocker");
  }
  return h;
}

export default function stageRunnerHandoff(pi: ExtensionAPI): void {
  const handoffPath = process.env.PI_STAGE_RUNNER_HANDOFF;
  const stage = process.env.PI_STAGE_RUNNER_STAGE;
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
