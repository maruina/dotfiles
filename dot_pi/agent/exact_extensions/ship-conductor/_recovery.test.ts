import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { createSessionRecovery } from "./_recovery.ts";

const MODEL = { provider: "fixture", id: "session" };

describe("createSessionRecovery", () => {
  it("sends one prompt, allows session input until the turn settles, and reports the session model", async () => {
    const sent: string[] = [];
    const recovery = createSessionRecovery({ send: (prompt) => sent.push(prompt), abort: () => assert.fail("must not abort"), model: () => MODEL });
    assert.equal(recovery.recovering, false);
    const run = recovery.run("fix the blocker", undefined);
    assert.deepEqual(sent, ["fix the blocker"]);
    assert.equal(recovery.recovering, true);
    let finished = false;
    void run.then(() => {
      finished = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(finished, false, "the recovery turn must wait for agent_settled");
    recovery.onSettled();
    assert.deepEqual(await run, { status: "settled", model: MODEL });
    assert.equal(recovery.recovering, false);
  });

  it("aborts the session turn on cancellation and waits a bounded time for it to settle", async () => {
    let aborts = 0;
    const recovery = createSessionRecovery({ send: () => undefined, abort: () => aborts++, model: () => MODEL, graceMs: 20 });
    const controller = new AbortController();
    const run = recovery.run("fix the blocker", controller.signal);
    controller.abort();
    assert.deepEqual(await run, { status: "cancelled", model: MODEL });
    assert.equal(aborts, 1);
    assert.equal(recovery.recovering, false);
  });

  it("clears the recovering flag when sending the prompt fails", async () => {
    const recovery = createSessionRecovery({ send: () => { throw new Error("agent busy"); }, abort: () => undefined, model: () => MODEL });
    await assert.rejects(recovery.run("fix", undefined), /agent busy/);
    assert.equal(recovery.recovering, false);
  });
});
