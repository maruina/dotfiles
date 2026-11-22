import fs from "node:fs";
import { execFileSync } from "node:child_process";
if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) throw Error('GitHub credential reached stage child');
const args = process.argv.slice(2),
  prompt = args.at(-1),
  stage = prompt.slice(1).split(" ")[0];
fs.appendFileSync(process.env.ARGV_LOG, JSON.stringify(args) + "\n");
const fail = process.env.FAIL,
  writer = fail.startsWith("recover-") && !["recover-verify", "recover-limit", "recover-blocked"].includes(fail);
const option = (name) => args[args.indexOf(name) + 1];
function completeTask() {
  const file = "plans/demo/plan.md";
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("- [ ]", "- [x]"));
  execFileSync("git", ["commit", "-qam", "complete task"]);
}
if (prompt.startsWith("ARP operation.")) {
  for (const required of ["--no-extensions", "--no-approve", "builtin:mcp", "builtin:tool-search"])
    if (!args.includes(required)) throw Error("Missing restricted Pi argument: " + required);
  const file = process.env.PI_STAGE_RUNNER_REVIEW;
  if ((fs.statSync(file).mode & 0o777) !== 0o600) throw Error("Review authorization is not private");
  const { name, input, head } = JSON.parse(fs.readFileSync(file, "utf8"));
  if (option("--tools") !== "tool_search," + name || option("--exclude-tools") !== "codemode")
    throw Error("Review tools are not restricted to the authorized operation");
  const log = process.env.ARGV_LOG + ".review";
  const prior = fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "";
  const published = execFileSync("git", ["--git-dir=" + process.env.BARE, "rev-parse", "feature"], { encoding: "utf8" }).trim();
  if (!fs.existsSync(process.env.BARE + ".pr")) throw Error("Review started before publication");
  fs.appendFileSync(log, JSON.stringify({ name, input, published }) + "\n");
  console.log(JSON.stringify({ type: "session", id: "fixture-review" }));
  if (fail === "arp-cancel") {
    fs.writeFileSync(log + "-ready", "ready");
    await new Promise((resolve) => setTimeout(resolve, 30000));
  }
  const target = { owner: input.owner, repo: input.repo, pull_number: input.pull_number };
  let payload;
  if (name.endsWith("get_status")) {
    const checks = prior.split("get_status").length - 1;
    let status = "NO_ISSUES_FOUND", action;
    if ((fail === "arp-draft" && checks === 0) || fail === "arp-stale") {
      status = "SKIPPED";
      action = "REVIEW_ACTION_REVIEW_ANYWAY";
    } else if (fail === "arp-retry-uncertain" && checks < 2) {
      status = "FAILED";
      action = "REVIEW_ACTION_RETRY";
    } else if (fail === "arp-active" && checks === 0) status = "IN_PROGRESS";
    payload = { ...target, head_sha: fail === "arp-stale" ? "0".repeat(40) : head, status: "REVIEW_STATUS_" + status,
      ...(action ? { allowed_action: action } : {}) };
  } else if (name.endsWith("request_review")) {
    if (fail === "arp-retry-uncertain") process.exit(1);
    payload = { ...target, head_sha: head, status: "REVIEW_STATUS_QUEUED" };
  } else {
    payload = { ...target, reviewed_sha: head, review_in_progress: fail === "arp-incomplete",
      finding_count: fail === "arp-findings" ? 1 : 0,
      findings: fail === "arp-findings" ? [{ finding_id: "finding-42", reviewed_sha: head }] : [] };
  }
  console.log(JSON.stringify({ type: "tool_execution_end", toolName: name, isError: false,
    result: { structuredContent: { content: [], structuredContent: payload } } }));
  console.log(JSON.stringify({ type: "agent_settled", aborted: false }));
  process.exit();
}
const noProgress = fail.startsWith("recover-progress") && !fs.existsSync(process.env.ARGV_LOG + ".once");
if (!args.includes("--mode")) {
  if (fail === "recover-progress") completeTask();
  const file = args.includes("--session") ? option("--session") : option("--session-dir") + "/fresh.jsonl";
  if (!args.includes("--session"))
    fs.writeFileSync(file, JSON.stringify({ type: "session", id: "fresh", cwd: process.cwd() }) + "\n", {
      mode: 0o600,
    });
  fs.appendFileSync(
    file,
    JSON.stringify({ type: "model_change", provider: "p", modelId: fail === "recover-dependent" ? "b" : "c" }) + "\n",
  );
  if (fail === "recover-dirty") fs.writeFileSync("dirty", "preserve");
  if (fail === "recover-cancel") {
    process.on("SIGTERM", () => fs.writeFileSync(process.env.ARGV_LOG + ".term", String(process.pid)));
    fs.writeFileSync(process.env.ARGV_LOG + ".ready", String(process.pid));
    await new Promise((r) => setTimeout(r, 20000));
  }
  await new Promise((r) => setTimeout(r, 300));
  process.exit();
}
const failedWriter = writer && stage === (fail === "recover-simplify" ? "simplify" : "execute");
if (failedWriter)
  fs.writeFileSync(
    option("--session-dir") + "/saved.jsonl",
    JSON.stringify({ type: "session", id: "fixture-1", cwd: process.cwd() }) +
      "\n" +
      JSON.stringify({ type: "model_change", provider: "p", modelId: "a" }) +
      "\n",
    { mode: 0o600 },
  );
if (stage === "verify" && fail === "recover-limit") process.exit(1);
if (process.env.FAIL !== "header") console.log(JSON.stringify({ type: "session", id: "fixture-1" }));
if (process.env.FAIL === "hang" || process.env.FAIL === "timeout")
  await new Promise((resolve) => setTimeout(resolve, 30000));
if (noProgress) fs.writeFileSync(process.env.ARGV_LOG + ".once", "1");
if (stage === "execute" && process.env.FAIL !== "progress" && !noProgress) completeTask();
if (process.env.FAIL === "dirty") fs.writeFileSync("untracked", "dirty");
if (
  (failedWriter && !fs.existsSync(process.env.ARGV_LOG + ".once")) ||
  (process.env.FAIL === "recover-verify" &&
    stage === "verify" &&
    fs
      .readFileSync(process.env.ARGV_LOG, "utf8")
      .split("\n")
      .filter((s) => s.includes("/verify '")).length < 3)
) {
  fs.writeFileSync(process.env.ARGV_LOG + ".once", "1");
  process.exit(1);
}
if (stage === "verify" && process.env.FAIL.startsWith("verify-")) {
  fs.writeFileSync("verifier-edit", "preserve me");
  if (process.env.FAIL === "verify-commit") {
    execFileSync("git", ["add", "verifier-edit"]);
    execFileSync("git", ["commit", "-qm", "verifier edit"]);
  }
  process.exit(1);
}
process.stderr.write("E".repeat(20000));
const output = JSON.parse(prompt.match(/^Handoff path: (.+)$/m)[1]);
if (process.env.FAIL !== "missing")
  fs.writeFileSync(
    output,
    JSON.stringify({
      schemaVersion: 1,
      stage,
      status:
        stage === "verify"
          ? fail === "recover-blocked" && !prompt.includes("--implemented-by 'p/c'")
            ? "BLOCKED"
            : "VERIFIED"
          : "success",
      summary: "done",
    }),
    { mode: 0o600 },
  );
if (process.env.FAIL !== "absent")
  console.log(JSON.stringify({ type: "agent_settled", aborted: process.env.FAIL === "abort" }));
if (process.env.FAIL === "exit") process.exitCode = 1;
