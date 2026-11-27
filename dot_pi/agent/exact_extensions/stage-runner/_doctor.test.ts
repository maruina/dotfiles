import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import test from "node:test";
import { formatDoctorReport, runDoctor, type DoctorInput } from "./_doctor.ts";

function baseInput(overrides: Partial<DoctorInput> = {}): DoctorInput {
  const cwd = "/repo/worktree";
  return {
    cwd,
    root: "/tmp/lifecycle-runs",
    piVersion: "1.6.1",
    scopedModels: [
      { provider: "ai-gw-anthropic", id: "claude-opus-5-5" },
      { provider: "ai-gw-google", id: "gemini-4-neon" },
    ],
    env: { ...process.env, PI_PROFILE: "work" },
    checkRex: async () => {},
    execCommand: async (bin, args) => {
      if (bin === "git" && args[0] === "rev-parse") return cwd;
      if (bin === "git" && args[0] === "symbolic-ref") return "maruina/feat";
      if (bin === "git" && args[0] === "status") return "";
      if (bin === "git" && args[0] === "config" && args[2] === "commit.gpgsign") return "true";
      if (bin === "git" && args[0] === "config" && args[2] === "gpg.format") return "ssh";
      if (bin === "ssh-add") return "ssh-ed25519 AAAA key";
      throw Error(`unexpected command: ${bin} ${args.join(" ")}`);
    },
    inspectTarget: async () => ({
      profile: "work",
      repo: "ddoghq/demo",
      branch: "maruina/feat",
      login: "matteo-ruina_ddog",
      pr: null,
      review: true,
    }),
    exists: () => false,
    realpath: (p) => p,
    ...overrides,
  };
}

test("runDoctor passes when all prerequisites are satisfied", async () => {
  const report = await runDoctor(baseInput());
  assert.equal(report.ok, true);
  assert.equal(report.checks.every((c) => c.status === "pass"), true);
  const formatted = formatDoctorReport(report);
  assert.match(formatted, /^Stage runner doctor: ready\n/);
  assert.match(formatted, /\[PASS\] Scoped models: 2 distinct models across 2 vendors/);
  assert.match(formatted, /\[PASS\] GitHub target: work profile · ddoghq\/demo \(matteo-ruina_ddog\) · new draft PR · ARP eligible/);
});

test("runDoctor reports failures for bad Pi version, Rex error, single model, retained lock, and broken signing", async () => {
  const cwd = "/repo/worktree";
  const expectedLock = path.join("/tmp/lifecycle-runs", "lock-" + createHash("sha256").update(cwd).digest("hex"));
  const report = await runDoctor(
    baseInput({
      piVersion: "1.5.9",
      scopedModels: [{ provider: "ai-gw-google", id: "gemini-4-neon" }],
      checkRex: async () => {
        throw Error("Rex API revision 17 is too old");
      },
      exists: (filePath) => filePath === expectedLock,
      execCommand: async (bin, args) => {
        if (bin === "git" && args[0] === "rev-parse") return cwd;
        if (bin === "git" && args[0] === "symbolic-ref") return "maruina/feat";
        if (bin === "git" && args[0] === "status") return " M file.ts";
        if (bin === "git" && args[0] === "config" && args[2] === "commit.gpgsign") return "true";
        if (bin === "git" && args[0] === "config" && args[2] === "gpg.format") return "ssh";
        if (bin === "ssh-add") throw Error("Could not open a connection to your authentication agent");
        throw Error("unexpected");
      },
    }),
  );
  assert.equal(report.ok, false);
  const byName = new Map(report.checks.map((c) => [c.name, c]));
  assert.equal(byName.get("Pi version")?.status, "fail");
  assert.equal(byName.get("Rex")?.status, "fail");
  assert.equal(byName.get("Scoped models")?.status, "fail");
  assert.equal(byName.get("Worktree")?.status, "warn");
  assert.equal(byName.get("Worktree lock")?.status, "fail");
  assert.match(byName.get("Worktree lock")?.detail ?? "", /lock-/);
  assert.equal(byName.get("Commit signing")?.status, "fail");
  assert.match(formatDoctorReport(report), /^Stage runner doctor: issues found\n/);
});

test("runDoctor warns on same-vendor scoped models and default branch without failing", async () => {
  const report = await runDoctor(
    baseInput({
      scopedModels: [
        { provider: "ai-gw-google", id: "gemini-4-neon" },
        { provider: "ai-gw-google", id: "gemini-4-carbon" },
      ],
      execCommand: async (bin, args) => {
        if (bin === "git" && args[0] === "rev-parse") return "/repo/worktree";
        if (bin === "git" && args[0] === "symbolic-ref") return "main";
        if (bin === "git" && args[0] === "status") return "";
        if (bin === "git" && args[0] === "config" && args[2] === "commit.gpgsign") return "false";
        throw Error("unexpected");
      },
      inspectTarget: async () => assert.fail("Must not call inspectTarget on main"),
    }),
  );
  assert.equal(report.ok, true);
  const byName = new Map(report.checks.map((c) => [c.name, c]));
  assert.equal(byName.get("Scoped models")?.status, "warn");
  assert.equal(byName.get("Worktree")?.status, "warn");
  assert.equal(byName.get("GitHub target")?.status, "warn");
});
