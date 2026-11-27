import fs from "node:fs";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
const args = process.argv.slice(2),
  session = process.env.REX_SESSION || "session:fixture",
  anchor = process.env.REX_BLOCK,
  block = "block:fixture-recovery",
  file = process.env.ARGV_LOG + ".pid",
  exitFile = file + ".exit",
  inspected = file + ".inspected",
  waiting = file + ".waiting",
  closed = file + ".closed",
  failure = process.env.FAIL;

if (args[0] === "supervise") {
  const [exe, ...argv] = args.slice(1);
  const child = spawn(exe, argv, { stdio: "ignore" });
  child.once("exit", (code) => {
    fs.writeFileSync(exitFile + ".tmp", JSON.stringify({ exit_code: code ?? -1 }));
    fs.renameSync(exitFile + ".tmp", exitFile);
  });
  fs.writeFileSync(file + ".tmp", String(child.pid));
  fs.renameSync(file + ".tmp", file);
} else if (args.includes("whoami"))
  console.log(
    JSON.stringify({
      principal: { kind: "peer", transport: "unix", uid: process.getuid() },
      endpoint: process.env.REX_SERVER,
      session_id: process.env.FAIL === "recover-definite" ? "session:wrong" : session,
      block_id: anchor,
    }),
  );
else if (args.includes("split")) {
  if (!args.includes("--shell=none") || !args.includes(anchor) || !args.includes(session)) process.exit(2);
  if (process.env.FAIL === "recover-uncertain" || (process.env.FAIL === "blocker-uncertain" && args.includes("--session"))) {
    console.log("{}");
    process.exit();
  }
  const flags = args.slice(0, args.indexOf("--"));
  fs.appendFileSync(process.env.ARGV_LOG + ".splits", JSON.stringify(flags) + "\n");
  const [exe, ...argv] = args.slice(args.indexOf("--") + 1);
  for (const state of [file, exitFile, inspected, waiting, closed]) fs.rmSync(state, { force: true });
  const supervisor = spawn(process.execPath, [fileURLToPath(import.meta.url), "supervise", exe, ...argv], {
    cwd: args[args.indexOf("-c") + 1], stdio: "ignore", detached: true,
  });
  supervisor.unref();
  for (let i = 0; i < 200 && !fs.existsSync(file); i++) await delay(10);
  if (!fs.existsSync(file)) process.exit(3);
  console.log(JSON.stringify({ anchor_id: anchor, block_ids: [block] }));
} else if (args.includes("wait") && args.includes(block) && args.includes(session) && args.includes("--json")) {
  if (!fs.existsSync(inspected) || fs.existsSync(closed)) process.exit(3);
  fs.writeFileSync(waiting, "");
  if (failure === "cancel-after-exit" && !args.includes("--for=5s")) {
    // Keep the waiter pending so only a process inspection can report the exit after abort.
    await delay(30000);
    process.exit(3);
  }
  const deadline = Date.now() + (args.includes("--for=5s") ? 5000 : 30000);
  if (failure === "wait-failure-running" && !args.includes("--for=5s")) {
    while (!fs.existsSync(process.env.ARGV_LOG + ".first-turn") && Date.now() < deadline) await delay(10);
    process.exit(3);
  }
  while (!fs.existsSync(exitFile) && Date.now() < deadline) await delay(10);
  if (!fs.existsSync(exitFile) || failure === "corrected") process.exit(3);
  if (failure === "pane-close") {
    fs.writeFileSync(closed, "");
    console.log(JSON.stringify({ block_id: block }));
    process.exitCode = 1;
  } else {
    const exit = JSON.parse(fs.readFileSync(exitFile, "utf8"));
    console.log(JSON.stringify({ block_id: block, ...exit }));
    process.exitCode = exit.exit_code < 0 ? 1 : exit.exit_code;
  }
} else if (args.includes("process") && args.includes(block)) {
  if (fs.existsSync(closed)) process.exit(3);
  const pid = Number(fs.readFileSync(file)),
    foreground = { pid, path: process.execPath, user_id: process.getuid(), cwd: process.cwd() };
  // Model startup identity on the first observation, even for fast fixture Pi scripts.
  if (fs.existsSync(inspected) && fs.existsSync(exitFile))
    console.log(JSON.stringify({ last_exit: JSON.parse(fs.readFileSync(exitFile, "utf8")) }));
  else {
    if (failure === "recover-cancel-identity" && fs.existsSync(waiting)) foreground.pid = 1;
    fs.writeFileSync(inspected, "");
    console.log(JSON.stringify({ child: { pid }, foreground }));
  }
} else if (args.includes("list")) console.log(JSON.stringify({ blocks: fs.existsSync(closed) ? [] : [{ block_id: block }] }));
else if (args.includes("close") && args.includes(block)) fs.writeFileSync(closed, "");
else process.exit(3);
