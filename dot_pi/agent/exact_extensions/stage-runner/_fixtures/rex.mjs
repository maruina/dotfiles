import fs from "node:fs";
import { spawn } from "node:child_process";
const args = process.argv.slice(2),
  session = process.env.REX_SESSION,
  anchor = process.env.REX_BLOCK,
  block = "block:fixture-recovery",
  file = process.env.ARGV_LOG + ".pid";
if (args.includes("whoami"))
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
  if (process.env.FAIL === "recover-uncertain") {
    console.log("{}");
    process.exit();
  }
  const [exe, ...argv] = args.slice(args.indexOf("--") + 1);
  const p = spawn(exe, argv, { cwd: args[args.indexOf("-c") + 1], stdio: "ignore", detached: true });
  p.unref();
  fs.writeFileSync(file, String(p.pid));
  console.log(JSON.stringify({ anchor_id: anchor, block_ids: [block] }));
} else if (args.includes("process") && args.includes(block)) {
  const pid = Number(fs.readFileSync(file)),
    foreground = { pid, path: process.execPath, user_id: process.getuid(), cwd: process.cwd() };
  console.log(JSON.stringify({ child: foreground, foreground }));
} else if (args.includes("list")) console.log(JSON.stringify({ blocks: [{ block_id: block }] }));
else if (!args.includes("close") || !args.includes(block)) process.exit(3);
