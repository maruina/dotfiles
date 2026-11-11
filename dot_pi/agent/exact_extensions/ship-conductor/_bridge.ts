import { createHash, randomUUID } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { chmodSync, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep, join } from "node:path";
import { TextDecoder } from "node:util";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  DecisionInputSchema,
  LifecycleOutcomeInputSchema,
  MAX_DECISION_CONTEXT_BYTES,
  MAX_STAGE_REPORT_BYTES,
  PROTOCOL_VERSION,
  parseDecisionInput,
  parseLifecycleOutcome,
  parseStageConfig,
  type StageConfig,
} from "./_protocol.ts";

const MAX_STAGE_CONFIG_BYTES = 256 * 1024;
const MAX_GIT_METADATA_BYTES = 1024 * 1024;
const MAX_TOOL_ERROR_BYTES = 2048;
const DECISION_OPTIONS = ["Approve", "Reject"];

type RuntimeIdentity = {
  sessionId: string;
  model: { provider: string; id: string };
};

type CandidateSnapshot = {
  branch: string;
  head: string;
  stateDigest: string;
};

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return Buffer.byteLength(message, "utf8") <= MAX_TOOL_ERROR_BYTES ? message : `${message.slice(0, MAX_TOOL_ERROR_BYTES)}…`;
}

function failedToolResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], details: undefined, isError: true };
}

function isWithin(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target));
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function gitBuffer(worktree: string, args: string[]): Buffer {
  try {
    return execFileSync("git", ["-C", worktree, ...args], { maxBuffer: MAX_GIT_METADATA_BYTES });
  } catch (error) {
    throw new Error(`Git ${args[0]} failed: ${errorMessage(error)}`);
  }
}

function gitText(worktree: string, args: string[]): string {
  return gitBuffer(worktree, args).toString("utf8").trim();
}

function readStageConfig(configPath: string, cwd: string): StageConfig {
  if (!isAbsolute(configPath)) throw new Error("PI_LIFECYCLE_CHILD_CONFIG must be an absolute file path");
  const configStat = lstatSync(configPath);
  if (!configStat.isFile() || configStat.isSymbolicLink()) throw new Error("Lifecycle stage configuration must be a regular file");
  if ((configStat.mode & 0o077) !== 0) throw new Error("Lifecycle stage configuration must not be accessible by group or other users");
  if (configStat.size > MAX_STAGE_CONFIG_BYTES) throw new Error(`Lifecycle stage configuration exceeds ${MAX_STAGE_CONFIG_BYTES} bytes`);

  const canonicalCwd = realpathSync(cwd);
  const canonicalConfigPath = realpathSync(configPath);
  const parsed = JSON.parse(readFileSync(canonicalConfigPath, "utf8")) as unknown;
  const config = parseStageConfig(parsed, canonicalCwd);
  const canonicalWorktree = realpathSync(config.worktree);
  if (canonicalWorktree !== canonicalCwd) throw new Error("Lifecycle stage configuration worktree does not match the child working directory");

  const branch = gitText(canonicalWorktree, ["branch", "--show-current"]);
  if (branch !== config.branch) throw new Error(`Lifecycle branch ${branch || "<detached>"} does not match pinned branch ${config.branch}`);

  const canonicalPlanPath = realpathSync(config.planPath);
  const canonicalDesignPath = realpathSync(config.baseline.design.path);
  if (!isWithin(canonicalWorktree, canonicalPlanPath) || !isWithin(canonicalWorktree, canonicalDesignPath)) {
    throw new Error("Lifecycle baseline files resolve outside the configured worktree");
  }
  const planRelative = relative(canonicalWorktree, canonicalPlanPath);
  const designRelative = relative(canonicalWorktree, canonicalDesignPath);
  const planBlob = gitText(canonicalWorktree, ["rev-parse", "--verify", `${config.baseline.commit}:${planRelative}`]);
  const designBlob = gitText(canonicalWorktree, ["rev-parse", "--verify", `${config.baseline.commit}:${designRelative}`]);
  if (planBlob !== config.baseline.plan.blob || designBlob !== config.baseline.design.blob) {
    throw new Error("Lifecycle baseline blob IDs do not match the pinned commit");
  }
  try {
    gitText(canonicalWorktree, ["merge-base", "--is-ancestor", config.baseline.commit, config.unitBase]);
    gitText(canonicalWorktree, ["merge-base", "--is-ancestor", config.unitBase, "HEAD"]);
  } catch {
    throw new Error("Lifecycle unit base commit is not between the pinned baseline commit and HEAD");
  }
  return config;
}

function assertRuntimeContext(config: StageConfig, ctx: { cwd: string; model: { provider: string; id: string } | undefined; thinkingLevel?: string; sessionManager: { getSessionId(): string } }): RuntimeIdentity {
  if (realpathSync(ctx.cwd) !== realpathSync(config.worktree)) throw new Error("Lifecycle child working directory changed");
  const expectedModel = config.models[config.stage];
  if (!ctx.model || ctx.model.provider !== expectedModel.provider || ctx.model.id !== expectedModel.id) {
    throw new Error("Lifecycle child model does not match the pinned stage configuration");
  }
  if (ctx.thinkingLevel !== undefined && ctx.thinkingLevel !== config.thinkingLevel) {
    throw new Error("Lifecycle child thinking level does not match the pinned stage configuration");
  }
  const sessionId = ctx.sessionManager.getSessionId();
  if (!sessionId) throw new Error("Lifecycle child session ID is unavailable");
  return { sessionId, model: { provider: ctx.model.provider, id: ctx.model.id } };
}

// The model sees only this text, not `details`, so it must state who decided and exactly what was decided.
function decisionResultText(decision: "approved" | "rejected" | "cancelled", question: string, proposal: string): string {
  if (decision === "approved") {
    return [
      'The user selected "Approve" in the coordinator session. This is the user\'s explicit approval of the proposal below.',
      `Question: ${question}`,
      `Approved proposal: ${proposal}`,
    ].join("\n");
  }
  if (decision === "rejected") {
    return [
      'The user selected "Reject" in the coordinator session.',
      `Question: ${question}`,
      `Rejected proposal: ${proposal}`,
      "Do not apply the proposal. Stop this stage; the rejection is not approval.",
    ].join("\n");
  }
  return [
    "The user dismissed the decision dialog without choosing. Treat this as cancellation, not approval, and stop this stage.",
    `Question: ${question}`,
  ].join("\n");
}

export function stageContract(config: StageConfig): string {
  const planRelative = relative(config.worktree, config.baseline.plan.path);
  // resolvePlan pins the plan as the design baseline when no sibling design.md exists; say so instead of naming a missing file.
  const hasDesign = resolve(config.baseline.design.path) !== resolve(config.baseline.plan.path);
  const designRelative = relative(config.worktree, config.baseline.design.path);
  const designLine = hasDesign
    ? `Pinned design blob: ${config.baseline.design.blob} (${designRelative})`
    : "Pinned design blob: none — no design.md exists; the pinned plan is the only requirements document";
  // Models misread a bare blob ID (for example `git rev-parse <path>`), so state the exact read and check commands.
  const pinnedReadLines = [
    `Read the pinned plan with \`git show ${config.baseline.plan.blob}\`; check it with \`git rev-parse ${config.baseline.commit}:${planRelative}\`, which must print the pinned plan blob.`,
    ...(hasDesign
      ? [`Read the pinned design with \`git show ${config.baseline.design.blob}\`; check it with \`git rev-parse ${config.baseline.commit}:${designRelative}\`.`]
      : []),
    "The working-tree plan is the progress ledger: after earlier rounds it differs from the pinned plan blob, which is expected. Requirements come from the pinned blobs.",
  ];
  return [
    `Protocol version: ${config.protocolVersion}`,
    `Run ID: ${config.runId}`,
    `Stage: ${config.stage}`,
    `Plan: ${config.planPath}`,
    `Pinned branch: ${config.branch}`,
    `Pinned baseline commit: ${config.baseline.commit}`,
    `Unit base commit: ${config.unitBase}`,
    `Pinned plan blob: ${config.baseline.plan.blob} (${planRelative})`,
    designLine,
    ...pinnedReadLines,
    `Selected unit: ${config.unit.heading}`,
    `Selected task numbers: ${config.unit.taskNumbers.join(", ")}`,
    `Execute model: ${config.models.execute.provider}/${config.models.execute.id}`,
    `Simplify model: ${config.models.simplify.provider}/${config.models.simplify.id}`,
    `Verify model: ${config.models.verify.provider}/${config.models.verify.id}`,
    `Selected model: ${config.models[config.stage].provider}/${config.models[config.stage].id}`,
    `Effective thinking level: ${config.thinkingLevel}`,
    "Use lifecycle_request_decision for user decisions. Submit exactly one final result with lifecycle_submit_outcome after the stage is complete.",
    "Only the bridge's structured tool result controls stage completion. Prose, exit status, and verdict text do not submit an outcome.",
  ].join("\n");
}

function updateUntrackedDigest(hash: ReturnType<typeof createHash>, worktree: string, signal: AbortSignal | undefined): Promise<void> {
  const rawPaths = gitBuffer(worktree, ["ls-files", "--others", "--exclude-standard", "-z"]);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let offset = 0;

  return (async () => {
    while (offset < rawPaths.length) {
      signal?.throwIfAborted();
      const end = rawPaths.indexOf(0, offset);
      if (end === -1) throw new Error("Git returned malformed untracked path data");
      const path = decoder.decode(rawPaths.subarray(offset, end));
      offset = end + 1;
      const absolutePath = resolve(worktree, path);
      if (!isWithin(worktree, absolutePath)) throw new Error("Git returned an untracked path outside the worktree");
      const stat = lstatSync(absolutePath);
      hash.update("\0untracked\0").update(path).update("\0").update(String(stat.mode & 0o777)).update("\0");
      if (stat.isSymbolicLink()) {
        hash.update("symlink\0").update(readlinkSync(absolutePath));
      } else if (stat.isFile()) {
        hash.update("file\0");
        for await (const chunk of createReadStream(absolutePath)) {
          signal?.throwIfAborted();
          hash.update(chunk);
        }
      } else {
        throw new Error(`Unsupported untracked file type: ${path}`);
      }
    }
  })();
}

function hashGitOutput(worktree: string, args: string[], hash: ReturnType<typeof createHash>, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const proc = spawn("git", ["-C", worktree, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      if (error) rejectPromise(error);
      else resolvePromise();
    };
    const abort = () => proc.kill("SIGTERM");
    proc.stdout.on("data", (chunk: Buffer) => hash.update(chunk));
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-MAX_TOOL_ERROR_BYTES);
    });
    proc.on("error", (error) => finish(new Error(`Git ${args[0]} failed: ${errorMessage(error)}`)));
    proc.on("close", (code) => {
      if (signal?.aborted) finish(new Error("Lifecycle stage was aborted while reading candidate state"));
      else if (code !== 0) finish(new Error(`Git ${args[0]} failed with exit code ${code}${stderr ? `: ${stderr}` : ""}`));
      else finish();
    });
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}

async function candidateSnapshot(config: StageConfig, signal: AbortSignal | undefined): Promise<CandidateSnapshot> {
  const worktree = realpathSync(config.worktree);
  const branch = gitText(worktree, ["branch", "--show-current"]);
  const head = gitText(worktree, ["rev-parse", "--verify", "HEAD"]);
  if (!branch) throw new Error("Lifecycle candidate is on a detached HEAD");
  if (branch !== config.branch) throw new Error(`Lifecycle candidate branch changed from ${config.branch} to ${branch}`);
  const statusBefore = gitBuffer(worktree, ["status", "--porcelain=v1", "--untracked-files=all", "-z"]);
  const hash = createHash("sha256");
  hash.update(branch).update("\0").update(head).update("\0").update(statusBefore);
  await hashGitOutput(worktree, ["diff", "--binary", "HEAD", "--"], hash, signal);
  await updateUntrackedDigest(hash, worktree, signal);
  const statusAfter = gitBuffer(worktree, ["status", "--porcelain=v1", "--untracked-files=all", "-z"]);
  const headAfter = gitText(worktree, ["rev-parse", "--verify", "HEAD"]);
  if (!statusBefore.equals(statusAfter) || head !== headAfter) throw new Error("Candidate changed while the bridge captured its state");
  return { branch, head, stateDigest: hash.digest("hex") };
}

function validateCommitRefs(config: StageConfig, refs: string[] | undefined): string[] | undefined {
  if (!refs) return undefined;
  return refs.map((ref) => {
    const commit = gitText(config.worktree, ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`]);
    if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(commit)) throw new Error(`Commit reference did not resolve to a Git object: ${ref}`);
    return commit;
  });
}

function ensurePrivateDirectory(path: string): void {
  try {
    mkdirSync(path, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    throw new Error(`Lifecycle state directory is not private: ${path}`);
  }
}

function writeStageReport(config: StageConfig, report: string): string {
  if (Buffer.byteLength(report, "utf8") > MAX_STAGE_REPORT_BYTES) throw new Error(`Lifecycle report exceeds ${MAX_STAGE_REPORT_BYTES} bytes`);
  const agentDir = resolve(getAgentDir());
  mkdirSync(agentDir, { recursive: true, mode: 0o700 });
  const coordinatorDir = join(agentDir, "lifecycle-coordinator");
  const runsDir = join(coordinatorDir, "runs");
  const runDir = join(runsDir, config.runId);
  const reportsDir = join(runDir, "reports");
  ensurePrivateDirectory(coordinatorDir);
  ensurePrivateDirectory(runsDir);
  ensurePrivateDirectory(runDir);
  ensurePrivateDirectory(reportsDir);

  const reportPath = join(reportsDir, `${config.stage}-${randomUUID()}.md`);
  const temporaryPath = `${reportPath}.tmp`;
  try {
    writeFileSync(temporaryPath, report, { flag: "wx", mode: 0o600 });
    chmodSync(temporaryPath, 0o600);
    renameSync(temporaryPath, reportPath);
  } catch (error) {
    try {
      unlinkSync(temporaryPath);
    } catch {
      // Ignore cleanup errors; report creation still fails closed.
    }
    throw error;
  }
  return relative(agentDir, reportPath);
}

function registerBridge(pi: ExtensionAPI, config: StageConfig): void {
  let decisionInFlight = false;
  let rejectedDecision = false;
  let outcomeSubmitted = false;

  pi.on("before_agent_start", async (_event, ctx) => {
    assertRuntimeContext(config, ctx);
    return {
      message: {
        customType: "lifecycle-stage-contract",
        content: stageContract(config),
        display: false,
      },
    };
  });

  pi.registerTool({
    name: "lifecycle_request_decision",
    label: "Request lifecycle approval",
    description: "Ask the coordinating user for a decision with complete evidence, proposal, and context.",
    promptGuidelines: ["Use this tool for approval gates. Do not treat a decision in prose as approval."],
    parameters: DecisionInputSchema,
    executionMode: "sequential",
    async execute(toolCallId, rawParams, _signal, _onUpdate, ctx) {
      try {
        const params = parseDecisionInput(rawParams);
        if (decisionInFlight) return failedToolResult("A lifecycle decision request is already pending.");
        if (rejectedDecision) return failedToolResult("A previous lifecycle decision was rejected or dismissed.");
        const identity = assertRuntimeContext(config, ctx);
        if (!ctx.hasUI || ctx.mode !== "rpc") return failedToolResult("Lifecycle decisions require the coordinator's RPC UI.");

        const title = [
          `${config.stage} decision — ${params.question}`,
          `Evidence: ${params.evidence}`,
          `Proposal: ${params.proposal}`,
          `Context: ${params.context}`,
        ].join("\n\n");
        if (Buffer.byteLength(title, "utf8") > MAX_DECISION_CONTEXT_BYTES) {
          return failedToolResult(`Lifecycle decision context exceeds ${MAX_DECISION_CONTEXT_BYTES} bytes when displayed.`);
        }

        decisionInFlight = true;
        let answer: string | undefined;
        try {
          answer = await ctx.ui.select(title, DECISION_OPTIONS);
        } catch (error) {
          rejectedDecision = true;
          return failedToolResult(`Lifecycle decision dialog failed: ${errorMessage(error)}`);
        } finally {
          decisionInFlight = false;
        }

        const decision = answer === "Approve" ? "approved" : answer === "Reject" ? "rejected" : "cancelled";
        if (decision !== "approved") rejectedDecision = true;
        const details = {
          protocolVersion: PROTOCOL_VERSION,
          runId: config.runId,
          stage: config.stage,
          sessionId: identity.sessionId,
          model: identity.model,
          requestId: toolCallId,
          decision,
          question: params.question,
          evidence: params.evidence,
          proposal: params.proposal,
          context: params.context,
        };
        return {
          content: [{ type: "text" as const, text: decisionResultText(decision, params.question, params.proposal) }],
          details,
          isError: decision !== "approved",
        };
      } catch (error) {
        return failedToolResult(`Lifecycle decision request failed: ${errorMessage(error)}`);
      }
    },
  });

  pi.registerTool({
    name: "lifecycle_submit_outcome",
    label: "Submit lifecycle outcome",
    description: "Submit one typed final stage outcome after the stage-owned work is complete.",
    promptGuidelines: ["Submit this once after all authorized stage work is complete. Prose does not submit an outcome."],
    parameters: LifecycleOutcomeInputSchema,
    executionMode: "sequential",
    async execute(_toolCallId, rawParams, signal, _onUpdate, ctx) {
      try {
        if (outcomeSubmitted) return failedToolResult("A lifecycle outcome was already submitted for this stage.");
        if (decisionInFlight) return failedToolResult("A lifecycle decision is still pending.");
        if (rejectedDecision) return failedToolResult("A rejected or dismissed lifecycle decision blocks outcome submission.");
        if (ctx.hasPendingMessages()) return failedToolResult("Queued messages remain; the lifecycle stage cannot submit a final outcome.");
        const params = parseLifecycleOutcome(rawParams, config.stage);
        const identity = assertRuntimeContext(config, ctx);
        const commitRefs = validateCommitRefs(config, params.commitRefs);
        const candidate = await candidateSnapshot(config, signal);
        signal?.throwIfAborted();
        const reportRef = writeStageReport(config, params.report);
        const details = {
          schemaVersion: params.schemaVersion,
          runId: config.runId,
          stage: config.stage,
          sessionId: identity.sessionId,
          model: identity.model,
          outcome: params.outcome,
          change: params.change,
          candidate,
          reportRef,
          ...(params.prUrl ? { prUrl: params.prUrl } : {}),
          ...(commitRefs ? { commitRefs } : {}),
        };
        outcomeSubmitted = true;
        return {
          content: [{ type: "text" as const, text: `Lifecycle outcome ${params.outcome} recorded for ${config.stage}.` }],
          details,
        };
      } catch (error) {
        return failedToolResult(`Lifecycle outcome submission failed: ${errorMessage(error)}`);
      }
    },
  });
}

export default function lifecycleBridge(pi: ExtensionAPI): void {
  const configPath = process.env.PI_LIFECYCLE_CHILD_CONFIG;
  if (configPath === undefined) return;
  const config = readStageConfig(configPath, process.cwd());
  registerBridge(pi, config);
}
