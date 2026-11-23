#!/usr/bin/env node
import { spawnSync } from "node:child_process";
const args = process.argv.slice(2);
const owner = process.env.REPO_OWNER ?? "fixture";
const login = owner === "ddoghq" ? "matteo-ruina_ddog" : "maruina";
const host = process.env.FAIL === "arp-ssh-alias" ? "ddoghq.github.com" : "github.com";
if (process.env.GH_TOKEN || !args.includes(`git@${host}`)) process.exit(2);
if (args.includes("-T")) {
  if (process.env.FAIL !== "unknown-login")
    console.error(
      `Hi ${process.env.FAIL === "wrong-login" ? "wrong" : login}! You've successfully authenticated, but GitHub does not provide shell access.`,
    );
  process.exit(1);
}
const service = /^(git-(?:upload|receive)-pack) '([^']+)'$/.exec(args.at(-1));
if (!service || service[2] !== `${owner}/demo.git`) process.exit(2);
const { appendFileSync, existsSync, writeFileSync } = await import("node:fs");
const bare = process.env.BARE;
const git = (...args) => spawnSync("git", ["--git-dir=" + bare, ...args]);
const before = git("rev-parse", "feature").stdout.toString();
const receive = service[1] === "git-receive-pack";
if (process.env.FAIL === "startup-push-unknown" && !receive && existsSync(bare + ".pushes")) process.exit(2);
if (process.env.FAIL === "startup-lease-race" && receive && !existsSync(bare + ".race")) {
  writeFileSync(bare + ".race", "1", { flag: "wx" });
  if (git("update-ref", "refs/heads/feature", "main").status !== 0) process.exit(2);
}
const status = spawnSync(service[1], [bare], { stdio: "inherit" }).status;
if (receive && status === 0) {
  const after = git("rev-parse", "feature").stdout.toString();
  if (after !== before && !(process.env.FAIL === "startup-lease-race" && after === git("rev-parse", "main").stdout.toString())) {
    appendFileSync(bare + ".pushes", after);
    if (process.env.FAIL === "startup-push-unknown") process.exit(2);
  }
}
process.exit(status ?? 2);
