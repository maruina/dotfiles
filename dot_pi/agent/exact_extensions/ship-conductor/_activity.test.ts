import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { ProgramStatus, Terminal } from "@earendil-works/pi-tui";
import { reportLifecycleActivity } from "./_activity.ts";

function fixture() {
  const reports: ProgramStatus[] = [];
  const terminal = {
    setProgramStatus(this: unknown, status: ProgramStatus) {
      assert.equal(this, terminal);
      reports.push(status);
    },
  } as Terminal;
  return { terminal, reports };
}

describe("lifecycle terminal activity", () => {
  it("reports working without an agent turn and keeps working after recovery settles", () => {
    const { terminal, reports } = fixture();
    const stop = reportLifecycleActivity(terminal);
    assert.deepEqual(reports.at(-1), { state: "working", app: "pi", message: "/implement" });
    for (const state of ["idle", "done", "error"] as const) {
      terminal.setProgramStatus({ state, app: "pi" });
      assert.equal(reports.at(-1)?.state, "working");
    }
    stop();
  });

  it("preserves native dialogs, resumes working after dismissal, and preserves clear", () => {
    const { terminal, reports } = fixture();
    const stop = reportLifecycleActivity(terminal);
    const blocked: ProgramStatus = { state: "blocked", app: "pi", kind: "permission", message: "Approve" };
    terminal.setProgramStatus(blocked);
    assert.deepEqual(reports.at(-1), blocked);
    terminal.setProgramStatus({ state: "idle", app: "pi" });
    assert.equal(reports.at(-1)?.state, "working");
    terminal.setProgramStatus({ state: "clear" });
    assert.deepEqual(reports.at(-1), { state: "clear" });
    stop();
  });

  for (const state of ["idle", "done", "error"] as const) it(`restores the writer and reports ${state} exactly once on cleanup`, () => {
    const { terminal, reports } = fixture();
    const original = terminal.setProgramStatus;
    const stop = reportLifecycleActivity(terminal);
    stop(state);
    assert.equal(terminal.setProgramStatus, original);
    assert.deepEqual(reports.at(-1), { state, app: "pi", message: "/implement" });
    const count = reports.length;
    stop();
    assert.equal(reports.length, count);
    terminal.setProgramStatus({ state: "idle", app: "pi" });
    assert.equal(reports.at(-1)?.state, "idle");
  });
});
