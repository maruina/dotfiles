import assert from "node:assert/strict";
import { test } from "node:test";
import { publishDraft, type PublishCommand } from "./_publish.ts";

const head = "a".repeat(40);
const old = "b".repeat(40);
const url = "https://github.com/DataDog/repo/pull/42";
const branch = "maruina/feature";
const basePr = { url, state: "OPEN", isDraft: true, isCrossRepository: false, baseRefName: "parent", headRefName: branch, headRefOid: old };

function fixture(pr: typeof basePr | null = basePr) {
  const calls: string[][] = [];
  let existing = pr;
  let pushed = false;
  let failCreate = false;
  const run: PublishCommand = async (command, args, options) => {
    calls.push([command, ...args]);
    const key = args.slice(0, 2).join(" ");
    if (command === "gh" && key === "auth token") {
      assert.deepEqual(args, ["auth", "token", "--hostname", "github.com", "--user", "maruina"]);
      assert.equal(options.env.GH_TOKEN, undefined);
      return "test-token";
    }
    if (command === "gh") assert.equal(options.env.GH_TOKEN, "test-token");
    if (args[0] === "remote") return "https://github.com/DataDog/repo.git";
    if (args[0] === "status") return "";
    if (args[0] === "branch") return branch;
    if (args[0] === "rev-parse") return head;
    if (args.includes("push")) {
      assert.ok(!args.some((arg) => arg.startsWith("--force")));
      assert.equal(args.at(-1), `${head}:refs/heads/${branch}`);
      pushed = true;
      if (existing) existing = { ...existing, headRefOid: head };
      return "";
    }
    if (key === "pr list") return JSON.stringify(existing ? [existing] : []);
    if (key === "pr create") {
      assert.ok(pushed && args.includes("--draft") && args.includes("--fill") && !args.includes("--base"));
      existing = { ...basePr, headRefOid: head };
      if (failCreate) throw new Error("response lost");
      return url;
    }
    if (key === "pr view") return JSON.stringify(existing);
    throw new Error(`Unexpected call: ${command} ${args.join(" ")}`);
  };
  const publish = (command = run, signal?: AbortSignal) => publishDraft({ worktree: "/work", candidate: { branch, head, stateDigest: "unused" }, signal }, command, async () => {});
  return { calls, publish, run, failCreate: () => { failCreate = true; } };
}

test("updates an exact head without changing the existing draft's base", async () => {
  const f = fixture();
  assert.deepEqual(await f.publish(), { status: "published", prUrl: url, headSha: head });
  assert.ok(!f.calls.some((args) => args.includes("create") || args.includes("edit")));
});

test("does not push to a non-draft PR", async () => {
  const f = fixture({ ...basePr, isDraft: false });
  assert.match((await f.publish()).reason ?? "", /not a same-repository open draft/i);
  assert.ok(!f.calls.some((args) => args.includes("push")));
});

test("discovers a draft created before a failed response and does not create another", async () => {
  const f = fixture(null);
  f.failCreate();
  assert.match((await f.publish()).reason ?? "", /push completed.*creation attempted/i);
  assert.equal((await f.publish()).status, "published");
  assert.equal(f.calls.filter((args) => args.includes("create")).length, 1);
  assert.equal(f.calls.filter((args) => args.includes("push")).length, 1);
});

test("blocks a mismatched readback and never retries the push", async () => {
  const f = fixture();
  const result = await f.publish(async (command, args, options) =>
    command === "gh" && args[1] === "view" ? JSON.stringify(basePr) : f.run(command, args, options));
  assert.match(result.reason ?? "", /does not match the verified head/);
  assert.equal(f.calls.filter((args) => args.includes("push")).length, 1);
});

test("reports whether a push may have happened on cancellation", async () => {
  const f = fixture();
  const controller = new AbortController();
  const result = await f.publish(async (command, args, options) => {
    if (args.includes("push")) {
      controller.abort();
      throw new Error("aborted");
    }
    return f.run(command, args, options);
  }, controller.signal);
  assert.equal(result.status, "cancelled");
  assert.match(result.reason ?? "", /push attempted/i);
  assert.ok(!f.calls.some((args) => args.includes("create") || args.includes("view")));
});
