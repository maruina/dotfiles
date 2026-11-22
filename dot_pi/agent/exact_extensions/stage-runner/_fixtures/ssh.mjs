#!/usr/bin/env node
import { spawnSync } from "node:child_process";
const args = process.argv.slice(2);
const owner = process.env.REPO_OWNER ?? "fixture";
const login = owner === "ddoghq" ? "matteo-ruina_ddog" : "maruina";
if (process.env.GH_TOKEN || !args.includes("git@github.com")) process.exit(2);
if (args.includes("-T")) {
  if (process.env.FAIL !== "unknown-login")
    console.error(
      `Hi ${process.env.FAIL === "wrong-login" ? "wrong" : login}! You've successfully authenticated, but GitHub does not provide shell access.`,
    );
  process.exit(1);
}
const service = /^(git-(?:upload|receive)-pack) '([^']+)'$/.exec(args.at(-1));
if (!service || service[2] !== `${owner}/demo.git`) process.exit(2);
const status = spawnSync(service[1], [process.env.BARE], { stdio: "inherit" }).status;
if (service[1] === "git-receive-pack" && status === 0) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(
    process.env.BARE + ".pushes",
    spawnSync("git", ["--git-dir=" + process.env.BARE, "rev-parse", "feature"]).stdout,
  );
}
process.exit(status ?? 2);
