import assert from "node:assert/strict";
import test from "node:test";

import lifecyclePreflight, {
  parseLifecycleCommand,
  validateLifecyclePreflight,
} from "./lifecycle-preflight.ts";

function setupExtension() {
  let inputHandler;
  lifecyclePreflight({
    on(event, handler) {
      if (event === "input") inputHandler = handler;
    },
  });
  return inputHandler;
}

test("parseLifecycleCommand ignores non-lifecycle prompts and other slash commands", () => {
  assert.equal(parseLifecycleCommand("Please run /verify later"), null);
  assert.equal(parseLifecycleCommand("/verify-extra foo"), null);
  assert.equal(parseLifecycleCommand("/simplify-all"), null);
  assert.equal(parseLifecycleCommand("/execute plans/foo/plan.md"), null);
  assert.equal(parseLifecycleCommand(""), null);
});

test("parseLifecycleCommand parses repeatable flags, quoted paths, and literal --task", () => {
  const planCmd = parseLifecycleCommand(
    `/verify "/tmp/my plan/plan.md" --implemented-by 'anthropic/claude-opus-4-6' --implemented-by openai/gpt-5.4 --simplified-by google/gemini-3-pro --base main`,
  );
  assert.deepEqual(planCmd, {
    command: "verify",
    positionals: ["/tmp/my plan/plan.md"],
    implementedBy: ["anthropic/claude-opus-4-6", "openai/gpt-5.4"],
    simplifiedBy: ["google/gemini-3-pro"],
    base: "main",
    hasTask: false,
    errors: [],
  });

  const taskCmd = parseLifecycleCommand(
    `/verify --implemented-by=anthropic/claude-opus-4-6 --task 'Fix --base foo --implemented-by bar --simplified-by baz'`,
  );
  assert.deepEqual(taskCmd, {
    command: "verify",
    positionals: [],
    implementedBy: ["anthropic/claude-opus-4-6"],
    simplifiedBy: [],
    hasTask: true,
    task: "'Fix --base foo --implemented-by bar --simplified-by baz'",
    errors: [],
  });
  const prCmd = parseLifecycleCommand(
    "/verify --pr https://github.com/ddoghq/computecla-controllers/pull/73 --implemented-by google/gemini-4-neon --simplified-by anthropic/claude-opus-5-5",
  );
  assert.deepEqual(prCmd, {
    command: "verify",
    positionals: [],
    implementedBy: ["google/gemini-4-neon"],
    simplifiedBy: ["anthropic/claude-opus-5-5"],
    pr: "https://github.com/ddoghq/computecla-controllers/pull/73",
    hasTask: false,
    errors: [],
  });
});

test("parseLifecycleCommand reports missing flag values and duplicate --pr", () => {
  const missingImpl = parseLifecycleCommand("/verify plan.md --implemented-by --simplified-by openai/gpt-5.4");
  assert.equal(missingImpl.errors.length, 1);
  assert.match(missingImpl.errors[0], /Missing value for --implemented-by/);
  assert.deepEqual(missingImpl.simplifiedBy, ["openai/gpt-5.4"]);

  const missingPr = parseLifecycleCommand("/verify --pr --implemented-by anthropic/claude-opus-4-6");
  assert.equal(missingPr.errors.length, 1);
  assert.match(missingPr.errors[0], /Missing value for --pr/);

  const dupPr = parseLifecycleCommand(
    "/verify --pr https://github.com/ddoghq/repo/pull/1 --pr https://github.com/ddoghq/repo/pull/2 --implemented-by anthropic/claude-opus-4-6",
  );
  assert.equal(dupPr.errors.length, 1);
  assert.match(dupPr.errors[0], /Duplicate --pr/);

  const missingTask = parseLifecycleCommand("/verify --implemented-by anthropic/claude-opus-4-6 --task   ");
  assert.equal(missingTask.errors.length, 1);
  assert.match(missingTask.errors[0], /Missing value for --task/);

  const emptyQuotedTask = parseLifecycleCommand("/simplify --task ''");
  assert.equal(emptyQuotedTask.errors.length, 1);
  assert.match(emptyQuotedTask.errors[0], /Missing value for --task/);
});

test("validateLifecyclePreflight enforces /verify requirements and model separation", () => {
  const verifier = { provider: "google", id: "gemini-4-neon" };

  assert.deepEqual(
    validateLifecyclePreflight(
      parseLifecycleCommand(
        "/verify plans/x/plan.md --implemented-by anthropic/claude-opus-4-6 --simplified-by openai/gpt-5.4",
      ),
      verifier,
    ),
    { ok: true },
  );

  // Planless --task does not require --simplified-by.
  assert.deepEqual(
    validateLifecyclePreflight(
      parseLifecycleCommand("/verify --implemented-by anthropic/claude-opus-4-6 --task 'Add preflight check'"),
      verifier,
    ),
    { ok: true },
  );

  // --pr does not require --simplified-by, and accepts optional --simplified-by.
  assert.deepEqual(
    validateLifecyclePreflight(
      parseLifecycleCommand(
        "/verify --pr https://github.com/ddoghq/computecla-controllers/pull/73 --implemented-by anthropic/claude-opus-4-6",
      ),
      verifier,
    ),
    { ok: true },
  );
  assert.deepEqual(
    validateLifecyclePreflight(
      parseLifecycleCommand(
        "/verify --pr https://github.com/ddoghq/computecla-controllers/pull/73 --implemented-by anthropic/claude-opus-4-6 --simplified-by openai/gpt-5.4",
      ),
      verifier,
    ),
    { ok: true },
  );

  // Invalid --pr URL blocks.
  const badPr = validateLifecyclePreflight(
    parseLifecycleCommand("/verify --pr https://github.com/ddoghq/repo/issues/73 --implemented-by anthropic/claude-opus-4-6"),
    verifier,
  );
  assert.equal(badPr.ok, false);
  assert.match(badPr.error, /--pr must be a valid GitHub PR URL/);

  // Bare PR URL in --task blocks with a hint to use --pr.
  const prInTask = validateLifecyclePreflight(
    parseLifecycleCommand(
      "/verify --implemented-by anthropic/claude-opus-4-6 --task 'https://github.com/ddoghq/computecla-controllers/pull/73'",
    ),
    verifier,
  );
  assert.equal(prInTask.ok, false);
  assert.match(prInTask.error, /use --pr/);

  // Prose --task mentioning a PR URL is still allowed.
  assert.deepEqual(
    validateLifecyclePreflight(
      parseLifecycleCommand(
        "/verify --implemented-by anthropic/claude-opus-4-6 --task 'Fix regression from https://github.com/ddoghq/repo/pull/73'",
      ),
      verifier,
    ),
    { ok: true },
  );

  // Missing --implemented-by blocks.
  const noImpl = validateLifecyclePreflight(
    parseLifecycleCommand("/verify plans/x/plan.md --simplified-by openai/gpt-5.4"),
    verifier,
  );
  assert.equal(noImpl.ok, false);
  assert.match(noImpl.error, /--implemented-by/);

  // Missing requirements source blocks.
  const noSource = validateLifecyclePreflight(
    parseLifecycleCommand("/verify --implemented-by anthropic/claude-opus-4-6"),
    verifier,
  );
  assert.equal(noSource.ok, false);
  assert.match(noSource.error, /plan path, --pr <pr-url>, or --task/);

  // Multiple requirements sources block.
  const bothSources = validateLifecyclePreflight(
    parseLifecycleCommand("/verify plans/x/plan.md --implemented-by anthropic/claude-opus-4-6 --simplified-by openai/gpt-5.4 --task 'dup'"),
    verifier,
  );
  assert.equal(bothSources.ok, false);
  assert.match(bothSources.error, /not multiple/);

  const prAndTask = validateLifecyclePreflight(
    parseLifecycleCommand(
      "/verify --pr https://github.com/ddoghq/repo/pull/73 --implemented-by anthropic/claude-opus-4-6 --task 'extra'",
    ),
    verifier,
  );
  assert.equal(prAndTask.ok, false);
  assert.match(prAndTask.error, /not multiple/);

  const planAndPr = validateLifecyclePreflight(
    parseLifecycleCommand(
      "/verify plans/x/plan.md --pr https://github.com/ddoghq/repo/pull/73 --implemented-by anthropic/claude-opus-4-6 --simplified-by openai/gpt-5.4",
    ),
    verifier,
  );
  assert.equal(planAndPr.ok, false);
  assert.match(planAndPr.error, /not multiple/);

  // Plan path without --simplified-by blocks.
  const noSimp = validateLifecyclePreflight(
    parseLifecycleCommand("/verify plans/x/plan.md --implemented-by anthropic/claude-opus-4-6"),
    verifier,
  );
  assert.equal(noSimp.ok, false);
  assert.match(noSimp.error, /--simplified-by/);

  // Matching --implemented-by blocks with actionable /model + /new guidance.
  const sameAsImpl = validateLifecyclePreflight(
    parseLifecycleCommand("/verify plans/x/plan.md --implemented-by google/gemini-4-neon --simplified-by openai/gpt-5.4"),
    verifier,
  );
  assert.equal(sameAsImpl.ok, false);
  assert.match(sameAsImpl.error, /google\/gemini-4-neon/);
  assert.match(sameAsImpl.error, /--implemented-by/);
  assert.match(sameAsImpl.error, /\/model/);
  assert.match(sameAsImpl.error, /\/new/);

  // Matching --simplified-by blocks (including when model.id already includes provider prefix).
  const sameAsSimp = validateLifecyclePreflight(
    parseLifecycleCommand("/verify plans/x/plan.md --implemented-by anthropic/claude-opus-4-6 --simplified-by openai/gpt-5.4"),
    { provider: "openai", id: "openai/gpt-5.4" },
  );
  assert.equal(sameAsSimp.ok, false);
  assert.match(sameAsSimp.error, /openai\/gpt-5\.4/);
  assert.match(sameAsSimp.error, /--simplified-by/);
});

test("validateLifecyclePreflight allows valid /simplify invocations and rejects missing flag values", () => {
  assert.deepEqual(validateLifecyclePreflight(parseLifecycleCommand("/simplify")), { ok: true });
  assert.deepEqual(
    validateLifecyclePreflight(parseLifecycleCommand("/simplify plans/x/plan.md --implemented-by anthropic/claude-opus-4-6 --base main")),
    { ok: true },
  );
  const bad = validateLifecyclePreflight(parseLifecycleCommand("/simplify --base"));
  assert.equal(bad.ok, false);
  assert.match(bad.error, /Missing value for --base/);
});

test("input handler blocks invalid /verify in TUI and skips non-TUI or stage-runner child sessions", () => {
  const onInput = setupExtension();
  const notifications = [];
  const tuiCtx = {
    mode: "tui",
    hasUI: true,
    model: { provider: "anthropic", id: "claude-opus-4-6" },
    ui: { notify: (msg, level) => notifications.push({ msg, level }) },
  };

  // Blocked in interactive TUI.
  const blocked = onInput(
    { text: "/verify plans/x/plan.md --implemented-by anthropic/claude-opus-4-6 --simplified-by openai/gpt-5.4" },
    tuiCtx,
  );
  assert.deepEqual(blocked, { action: "handled" });
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].level, "error");
  assert.match(notifications[0].msg, /\/model/);
  assert.match(notifications[0].msg, /\/new/);

  // Valid /verify passes through.
  const allowed = onInput(
    { text: "/verify plans/x/plan.md --implemented-by openai/gpt-5.4 --simplified-by google/gemini-3-pro" },
    tuiCtx,
  );
  assert.deepEqual(allowed, { action: "continue" });
  assert.equal(notifications.length, 1);

  // Non-TUI mode never blocks.
  const nonTui = onInput(
    { text: "/verify" },
    { ...tuiCtx, mode: "rpc" },
  );
  assert.deepEqual(nonTui, { action: "continue" });

  // PI_STAGE_RUNNER_CHILD=1 never blocks even in TUI mode.
  const prev = process.env.PI_STAGE_RUNNER_CHILD;
  process.env.PI_STAGE_RUNNER_CHILD = "1";
  try {
    const child = onInput({ text: "/verify" }, tuiCtx);
    assert.deepEqual(child, { action: "continue" });
    assert.equal(notifications.length, 1);
  } finally {
    if (prev === undefined) delete process.env.PI_STAGE_RUNNER_CHILD;
    else process.env.PI_STAGE_RUNNER_CHILD = prev;
  }
});

test("validateLifecyclePreflight validates /simplify --pr, /pr-validate, /pr-address-feedback, and /learn", () => {
  const simplifyPr = validateLifecyclePreflight(
    parseLifecycleCommand("/simplify --pr https://github.com/org/repo/pull/1"),
  );
  assert.equal(simplifyPr.ok, false);
  assert.match(simplifyPr.error, /positional/i);

  assert.equal(
    validateLifecyclePreflight(parseLifecycleCommand("/pr-validate https://github.com/DataDog/dd-source/pull/123 extra context")).ok,
    true,
  );
  assert.equal(
    validateLifecyclePreflight(parseLifecycleCommand("/pr-validate https://github.com/DataDog/dd-source/pull/123?w=1#files")).ok,
    true,
  );
  assert.equal(
    validateLifecyclePreflight(parseLifecycleCommand("/pr-validate not-a-url")).ok,
    false,
  );
  assert.equal(
    validateLifecyclePreflight(parseLifecycleCommand("/pr-validate")).ok,
    false,
  );

  assert.equal(
    validateLifecyclePreflight(parseLifecycleCommand("/pr-address-feedback https://github.com/org/repo/pull/9#discussion_r12345")).ok,
    true,
  );
  assert.equal(
    validateLifecyclePreflight(parseLifecycleCommand("/pr-address-feedback https://github.com/org/repo/pull/9#issuecomment-42")).ok,
    true,
  );
  assert.equal(
    validateLifecyclePreflight(parseLifecycleCommand("/pr-address-feedback https://github.com/org/repo/pull/9#invalid")).ok,
    false,
  );

  assert.equal(validateLifecyclePreflight(parseLifecycleCommand("/learn")).ok, true);
  assert.equal(validateLifecyclePreflight(parseLifecycleCommand("/learn --days 14")).ok, true);
  assert.equal(validateLifecyclePreflight(parseLifecycleCommand("/learn --days=30 some context")).ok, true);
  assert.equal(validateLifecyclePreflight(parseLifecycleCommand("/learn --days 0")).ok, false);
  assert.equal(validateLifecyclePreflight(parseLifecycleCommand("/learn --days abc")).ok, false);
  assert.equal(validateLifecyclePreflight(parseLifecycleCommand("/learn --days")).ok, false);
});
