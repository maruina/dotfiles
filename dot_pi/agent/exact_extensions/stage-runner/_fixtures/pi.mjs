import fs from "node:fs";
import { execFileSync } from "node:child_process";
const args = process.argv.slice(2),
  prompt = args.at(-1),
  stage = prompt.slice(1).split(" ")[0];
fs.appendFileSync(process.env.ARGV_LOG, JSON.stringify(args) + "\n");
if (process.env.FAIL !== "header") console.log(JSON.stringify({ type: "session", id: "fixture-1" }));
if (process.env.FAIL === "hang" || process.env.FAIL === "timeout")
  await new Promise((resolve) => setTimeout(resolve, 30000));
if (stage === "execute" && process.env.FAIL !== "progress") {
  const file = "plans/demo/plan.md";
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("- [ ]", "- [x]"));
  execFileSync("git", ["commit", "-qam", "complete task"]);
}
if (process.env.FAIL === "dirty") fs.writeFileSync("untracked", "dirty");
process.stderr.write("E".repeat(20000));
const output = JSON.parse(prompt.match(/^Handoff path: (.+)$/m)[1]);
if (process.env.FAIL !== "missing")
  fs.writeFileSync(
    output,
    JSON.stringify({ schemaVersion: 1, stage, status: stage === "verify" ? "VERIFIED" : "success", summary: "done" }),
    { mode: 0o600 },
  );
if (process.env.FAIL !== "absent")
  console.log(JSON.stringify({ type: "agent_settled", aborted: process.env.FAIL === "abort" }));
if (process.env.FAIL === "exit") process.exitCode = 1;
