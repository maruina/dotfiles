#!/usr/bin/env node
import fs from "node:fs";
import { execFileSync } from "node:child_process";
const args = process.argv.slice(2),
  [cmd, op] = args,
  owner = process.env.REPO_OWNER ?? "fixture",
  repo = `${owner}/demo`,
  login = owner === "ddoghq" ? "matteo-ruina_ddog" : "maruina",
  marker = process.env.BARE + ".pr";
const json = (x) => console.log(JSON.stringify(x));
if (cmd === "auth" && !process.env.GH_TOKEN) {
  if (op === "token" && args.at(-1) === login) console.log("fixture-api-secret");
  else if (op === "status") json({ hosts: { "github.com": [{ active: true, login: "maruina" }] } });
  else process.exit(1);
} else if (process.env.GH_TOKEN !== "fixture-api-secret") process.exit(1);
else if (cmd === "api" && op === "user") json({ login });
else if (cmd === "api" && op === "repos/" + repo) json({ full_name: repo, default_branch: "main", fork: false });
else if (cmd === "api" && op.endsWith("/rules/branches/feature")) json([]);
else if (cmd === "api" && op.endsWith("/branches/feature")) json({ protected: false });
else if (cmd === "pr" && args.includes(repo) && args.includes("--head") && args.includes("feature")) {
  if (op === "create") fs.appendFileSync(marker + ".creates", "create\n");
  if (
    op === "create" &&
    args.includes("--draft") &&
    args.includes("--base") &&
    args.includes("main") &&
    !fs.existsSync(marker)
  ) {
    if (process.env.FAIL !== "partial") fs.writeFileSync(marker, "1", { flag: "wx" });
    if (["partial", "uncertain-create"].includes(process.env.FAIL)) process.exit(1);
  } else if (op === "list")
    json(
      fs.existsSync(marker)
        ? [
            {
              number: 1,
              url: `https://github.com/${repo}/pull/1`,
              headRefOid: execFileSync("git", ["--git-dir=" + process.env.BARE, "rev-parse", "feature"], {
                encoding: "utf8",
              }).trim(),
              headRefName: "feature",
              baseRefName: process.env.FAIL === "conflict" ? "other" : "main",
              headRepository: { name: "demo" },
              headRepositoryOwner: { login: owner },
              isCrossRepository: false,
            },
          ]
        : [],
    );
  else process.exit(1);
} else process.exit(1);
