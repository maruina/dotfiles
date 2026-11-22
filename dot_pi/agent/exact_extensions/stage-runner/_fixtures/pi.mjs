import fs from "node:fs";
import { execFileSync } from "node:child_process";
if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) throw Error('GitHub credential reached stage child');
const args = process.argv.slice(2),
  prompt = args.at(-1),
  stage = prompt.slice(1).split(" ")[0];
const drafting = prompt.startsWith("Prepare a PR draft.");
if (drafting) {
  if (process.env.SSH_AUTH_SOCK || process.env.GH_ENTERPRISE_TOKEN || process.env.GH_CONFIG_DIR)
    throw Error("GitHub credential configuration reached drafting child");
  Object.assign(process.env, JSON.parse(fs.readFileSync("../draft-fixture.json", "utf8")));
}
fs.appendFileSync(process.env.ARGV_LOG, JSON.stringify(args) + "\n");
const fail = process.env.FAIL,
  writer = fail.startsWith("recover-") && !["recover-verify", "recover-limit", "recover-blocked"].includes(fail);
const option = (name) => args[args.indexOf(name) + 1];
function completeTask() {
  const file = "plans/demo/plan.md";
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("- [ ]", "- [x]"));
  execFileSync("git", ["commit", "-qam", "complete task"]);
}
if (drafting) {
  if (fail === "draft-dirty") fs.writeFileSync("untracked", "changed candidate");
  if (fail === "draft-pr-race") fs.writeFileSync(process.env.BARE + ".pr", "1");
  if (fail === "draft-cancel") {
    fs.writeFileSync(process.env.ARGV_LOG + ".draft-ready", "ready");
    await new Promise(resolve => setTimeout(resolve, 30000));
  }
  const draft = fail === "draft-malformed" ? "not JSON" : JSON.stringify({
    title: "Explain the verified feature",
    body: fail === "draft-oversized" ? "x".repeat(70000) : "## What is this PR?\nFixture explanation.",
  });
  console.log(JSON.stringify({ type: "session", id: "fixture-draft" }));
  console.log(JSON.stringify({ type: "message_end", message: { role: "assistant", stopReason: "stop",
    content: [{ type: "text", text: draft }] } }));
  await new Promise(resolve => process.stdout.write(JSON.stringify({ type: "agent_settled", aborted: false }) + "\n", resolve));
  process.exit();
}
const loop = fail.startsWith("arp-fix-");
const timeline = (event, fields) => fs.appendFileSync(process.env.ARGV_LOG + ".timeline", JSON.stringify({ event, ...fields }) + "\n");
const headAt = (...args) => execFileSync("git", [...args, "rev-parse", args.length ? "feature" : "HEAD"], { encoding: "utf8" }).trim();
if (prompt.startsWith("ARP fix.")) {
  if (!option("--exclude-tools").split(",").includes("mcp__*") || option("--model") !== "a") throw Error("Fix child not restricted");
  const published = headAt("--git-dir=" + process.env.BARE);
  const findings = JSON.parse(prompt.match(/^Findings: (.+)$/m)[1]);
  fs.appendFileSync("fix.txt", published + "\n");
  execFileSync("git", ["add", "fix.txt"]);
  if (fail === "arp-fix-plan") fs.appendFileSync("plans/demo/plan.md", "edited\n");
  execFileSync("git", ["commit", "-qam", "fix findings"]);
  const sha = headAt();
  timeline("fix", { head: sha, published });
  const fixed = findings.map(({ id }) => ({ id, disposition: "fixed", fixSha: fail === "arp-fix-range" ? published : sha, changeSummary: "Correct the fixture" }));
  if (fail === "arp-findings") fixed[0] = { id: fixed[0].id, disposition: "needs-operator", reason: "Fixture cannot substantiate the finding" };
  if (fail === "arp-fix-missing") fixed.pop();
  if (fail === "arp-fix-duplicate") fixed.push(fixed[0]);
  if (fail === "arp-fix-unknown") fixed[0].id = 999;
  fs.writeFileSync(JSON.parse(prompt.match(/^Handoff path: (.+)$/m)[1]),
    JSON.stringify({ schemaVersion: 1, stage: "arp-fix", summary: "Fixed", findings: fixed }), { mode: 0o600 });
  console.log(JSON.stringify({ type: "session", id: "fixture-fix" }));
  console.log(JSON.stringify({ type: "agent_settled", aborted: false }));
  process.exit();
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
  const original = prior ? JSON.parse(prior.split("\n")[0]).published : published;
  const reviewIndex = new Set(prior.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line).published).concat(published)).size;
  const opened = (id, reviewed_sha = published) => ({ finding_id: id, reviewed_sha, status: "open", file_path: "plans/demo/plan.md", start_line: 1, end_line: 1, body: "Fixture finding" });
  if (loop) timeline(name.split("agentic_review_").at(-1), { head, published, input });
  let payload;
  if (name.endsWith("resolve_finding")) {
    if (fail === "arp-fix-partial" && input.finding_id === 43) process.exit(1);
    const reviewed = prior.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line).published).filter((sha) => sha !== published).at(-1);
    const finding = { ...opened(input.finding_id, reviewed), status: "addressed", settlement: { resolution: "addressed", fix_commit_sha: input.fix_commit_sha } };
    fs.appendFileSync(log + ".settled", JSON.stringify(finding) + "\n");
    if (fail === "arp-fix-uncertain") process.exit(1);
    payload = { finding };
  } else if (name.endsWith("get_status")) {
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
    const settled = fs.existsSync(log + ".settled") ? fs.readFileSync(log + ".settled", "utf8").trim().split("\n").map(JSON.parse) : [];
    const priorHeads = [...new Set(prior.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line).published).filter((sha) => sha !== published))];
    const originalFindings = fail === "arp-fix-limit" && input.status === "all" ? priorHeads.map((sha, i) => opened(42 + i, sha)) :
      [opened(42, original), ...(fail === "arp-fix-partial" ? [opened(43, original)] : [])];
    const findings = input.status === "all" ? originalFindings.map((f) => settled.find((s) => s.finding_id === f.finding_id) ?? f) :
      fail === "arp-findings" ? [opened(42)] : loop && reviewIndex === 1 ? originalFindings :
      fail === "arp-fix-limit" ? [opened(41 + reviewIndex)] : [];
    payload = { ...target, scope: "pull_request", status_filter: input.status, reviewed_sha: head,
      review_in_progress: fail === "arp-incomplete", finding_count: findings.length, findings };
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
if (!fail && stage === "simplify") {
  const start = (id, file, nested = false) => console.log(JSON.stringify({ type: "tool_execution_start",
    toolName: "read", toolCallId: String(id), args: { path: file }, ...(nested && { parentToolCallId: "outer" }) }));
  const end = (id, isError = false) => console.log(JSON.stringify({ type: "tool_execution_end",
    toolName: "read", toolCallId: String(id), isError, ...(id === 1 && { parentToolCallId: "outer" }) }));
  end("missing");
  for (const file of ["Bad/SKILL.md", "wrong/README.md", "failed/SKILL.md"]) {
    start("invalid", file);
    end("invalid", file.startsWith("failed"));
  }
  for (let i = 0; i <= 256; i++) start(i, "private/skill-" + i + "/SKILL.md", i === 1);
  end(256);
  end(0);
  start("duplicate", "skill-0/SKILL.md");
  end("duplicate");
  for (let i = 1; i <= 16; i++) end(i);
}
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
if (stage === "verify" && loop) {
  const head = headAt();
  timeline("verify", { head, model: option("--model"), hasFixScope: prompt.includes(head) && prompt.includes("Finding fixes") });
  if (fail === "arp-fix-verify" && fs.existsSync("fix.txt")) process.exit(1);
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
