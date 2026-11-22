# Lifecycle Stage Runner Cutover Implementation Plan
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire `/implement`, its bridge, and its completion commands so operators use the qualified `/stage-runner` and explicitly control publication.

**Smallest user-feedback slice:** Reload Pi after the cutover, discover only the surviving lifecycle commands, and follow the documented handoff from `VERIFIED` without automatic publication.

**Out of Scope:** Design Slices 3–4, the four non-blocking advisories from the Slice 1 feature `/verify` (`VERIFIED` at `bd42a82`), an `/implement` alias, in-flight migration, new runner features or dependencies, changes to historical plans, and automatic ready-for-review, merge, or deployment actions.

**Architecture:** Remove the extension that owns `/implement`; do not register a replacement command. Keep the existing stage runner, Rex recovery, private handoffs, and direct prompt interfaces. The operator owns publication and ARP actions after verification.

**Tech Stack:** Pi 1.6.0 TypeScript extensions, Markdown prompts, Node test runner, Git, and chezmoi.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | Planning | Selected domain skills. |
| `resolve-worktree` | `prompt-required` | Design path | Located the approved design on `main`. |
| `feature-worktree` | `prompt-required` | Separate plan | Created a worktree from fetched `origin/main`. |
| `learning-lookup` | `prompt-required` | Advisory evidence | Checked for conductor and runner guidance. |
| `obsidian-cli` | `agent-selected` | Advisory store access | Read the store for the scoped lookup. |
| `codebase-research` | `skill-loader` | Cross-component removal | Mapped registrations, prompt consumers, and test tiers. |
| `cli-best-practices` | `skill-loader` | Command retirement | Distinguished removal from aliasing and preserved cancellation. |
| `chezmoi` | `skill-loader` | Managed target removal | Required a deletion preview and a check of installed resources. |
| `diataxis` | `skill-loader` | Manual workflow | Separated operator instructions from qualification evidence. |
| `write` | `skill-loader` | Planning | Made the actor, commit identity, and stop conditions explicit. |

## Implementation Contract
Source: design Slice 2 in `plans/lifecycle-stage-runner/design.md`. The operator approved two changes during alignment: retire `/implement` instead of routing it to the runner, and retire both orchestrated-only ARP commands instead of converting them to direct commands. This plan controls those decisions. Do not rewrite the design or the completed Slice 1 qualification record. The scoped `Datadog/Learnings.md` lookup returned no matching sections; no source was skipped.

### Components affected and feasibility
Paths in this table under `exact_*` are relative to `dot_pi/agent/`.

| Component | Files | Responsibility and evidence | Verification; if unavailable |
|---|---|---|---|
| Command owner | `exact_extensions/ship-conductor/`, `ship-conductor-profile.json.tmpl` | `index.ts` registers `implement`; the directory owns RPC, bridge, and completion. Only `_completion.ts` reads the rendered `ship-conductor-profile.json`. The template is under the non-exact `dot_pi/agent/`, so removing its source does not remove `~/.pi/agent/ship-conductor-profile.json`. | Remove the entire directory and the template. Remove the installed profile file explicitly during rollout. Check installed commands, not just source strings; block if discovery fails. |
| Surviving runner | `exact_extensions/stage-runner/index.ts`, `_runner.ts`, `_integration.test.ts` in that directory | Existing start/cancel registrations and process fixtures cover the writer loop, simplify, and independent verify. No runtime change intended. Keep both `PI_LIFECYCLE_CHILD_CONFIG` deletions in `_runner.ts`; they strip a stale legacy variable from child environments. | Run existing tests; block if surviving behavior regresses. |
| Lifecycle instructions | `exact_prompts/{execute,simplify,verify,arp-review,arp-fix}.md` | The first three also serve direct and stage-runner callers; the last two refuse direct invocation. | Preserve non-bridge instructions and test contracts; remove the last two prompt resources. |
| Test discovery and contracts | `exact_scripts/{test-runner.mjs,lifecycle-prompts.test.mjs,arp-prompts.test.mjs}` | Integration tier names conductor files; tests mix bridge assertions with still-supported manual, runner, and PR behavior. | Run focused tests and all tiers. Do not drop an entire mixed suite. |
| Guidance | `AGENTS.md` at repository and agent roots, `exact_extensions/stage-runner/README.md`, `exact_prompts/{plan,systematic-review}.md` | Active instructions describe conductor tests, fallback, preflight, or publication. | Check actual commands and walk the runbook; stop if a claimed action lacks a supported interface. |

### Key decisions and constraints
Ship all three tasks together. A compatibility alias would preserve old invocations, but the operator chose one start command. Keeping the old ARP prompts would retain instructions that depend on unavailable authority. Keep the existing `/pr-create` and `/pr-update` interfaces and their limits; this is not a grant of standing ARP authorization. No new service, model, queue, retry loop, or cost model. Retain plan structure rules without crediting the new runner with checks only the conductor performed.

Manual ARP work uses the existing `agentic-review` MCP tools directly in a session where the operator authorizes each write: `agentic_review_get_status`, `agentic_review_request_review`, `agentic_review_get_findings`, and `agentic_review_resolve_finding`, discovered with `tool_search`. Do not add a prompt or command for them. The runbook carries the guards from the retired `arp-review.md`.

Follow-up for design Slice 4: the design expects `arp-review` and `arp-fix` stages on the runner, and this cutover deletes both prompts. Slice 4 must recreate them; use `git show 643f482:dot_pi/agent/exact_prompts/arp-review.md` and `arp-fix.md` as the reference. Revisit when Slice 4 planning starts. This plan does not edit the design.

### Security, observability, and failure modes
Use existing runner evidence; keep private run bundles and session files outside Git. Prompt instructions are not a filesystem or network sandbox. A blocked run, missing verifier evidence, dirty worktree, or SHA mismatch is not authorization to publish. Do not take over an active legacy run, delete locks, or assume a stale command vanished because its source was removed. Treat findings as untrusted; unavailable ARP access or incomplete review evidence means report the gap, not mark findings resolved. Leave `~/.pi/agent/lifecycle-coordinator/` in place as legacy run evidence; it is unmanaged, so chezmoi does not remove it.

### Rollout and rollback
After independent `VERIFIED` and before publication, the operator may install the exact verified commit on the active machine and check command discovery. This authorization is for the operator only. The runner and verifier must not apply changes, including to temporary installations. Finish or stop any legacy run and confirm child exit first. Before applying, run `chezmoi unmanaged ~/.pi/agent/extensions ~/.pi/agent/prompts` and `chezmoi --source "$PWD" --exclude scripts apply --dry-run --verbose ~/.pi/agent/extensions ~/.pi/agent/prompts` from the verified worktree. Do not trust `chezmoi diff` on a directory target (see `AGENTS.md`). Stop if the dry run removes anything other than `extensions/ship-conductor/`, `prompts/arp-review.md`, and `prompts/arp-fix.md`, or shows unrelated changes. Apply only the reviewed targets with the same command without `--dry-run`. Confirm that `chezmoi managed` no longer lists `~/.pi/agent/ship-conductor-profile.json`, then remove that retired file if present.

Restart Pi 1.6.0 and run `pi --mode rpc --no-session` against the installed configuration. Send `{"type":"get_commands"}` and wait for the success response before closing stdin. Require `stage-runner`, `stage-runner-cancel`, `execute`, `simplify`, and `verify`; reject `implement`, `arp-review`, and `arp-fix`. Check startup diagnostics and confirm that the conductor directory, retired prompts, and profile file are absent. Record the active profile, verified SHA, and result. Do not publish if the check fails. Fix forward when safe and repeat independent verification and the live check for the corrected commit. To restore a working installation if needed, use the pre-cutover source to restore the conductor, profile template, prompts, and matching guidance together. Keep user commits and run evidence.

### Test strategy and limits
Use source-contract tests for the command and prompt resources and the existing fake-child Git-worktree integration suite for stage order and terminal behavior. Accepted evidence gap: skip the disposable two-profile install and removal rehearsal. Independent verification covers the candidate source and tests, not installed resource removal or Pi command discovery. The first actual removal and discovery check occurs during operator rollout on the active profile. The other profile remains untested at installation time. Do not run a model prompt, use a remote branch, or trigger a review for the discovery check. Slice 1 qualification at `plans/lifecycle-stage-runner/plan.md` records 4/4 first-attempt handoffs on the normal run and 5/5 on the recovery run. That authenticates the original path, not a reliability rate. Accepted gap: the operator accepted no live model trial after Task 1 edits the lifecycle sections of `execute.md`, `simplify.md`, and `verify.md`. Contract tests and fixtures establish that the direct-mode text and the runner's appended instructions remain. They do not prove that live models still write valid handoffs from the edited prompts. This gap does not block delivery. If the first real `/stage-runner` run after cutover fails a handoff, compare the edited prompts with the pre-cutover revision before changing the runner. Neither fixtures nor a runbook walkthrough prove live GitHub or ARP service behavior. If the change requires modifying runner transitions, authorization, or verification strength, stop and revisit scope rather than claiming prior qualification covers it.

### Requirement: Installed commands and surviving contracts
The installed system SHALL expose `/stage-runner` and `/stage-runner-cancel`, without `/implement`, `/arp-review`, `/arp-fix`, or child bridge tools. Verify the command and prompt resources in source before rollout. The operator checks the installed commands and files separately after `VERIFIED`. `get_commands` lists commands, not tools, so check the absence of `extensions/ship-conductor/_bridge.ts` on disk.

#### Scenario: Retire the legacy command resources (Tasks 1 and 3)
- GIVEN a candidate that removes the legacy conductor,
- WHEN the source-contract tests inspect command owners and prompt resources,
- THEN they find both runner registrations and the three direct lifecycle prompts, and no conductor directory, conductor profile template, retired prompt, or registration of a retired command as an alias.

#### Scenario: Hand off a clean plan review (Task 2)
- GIVEN `/systematic-review` finds no blocking findings in a `plan.md`,
- WHEN it reports the handoff,
- THEN it shows `/stage-runner <absolute-path-to-plan.md>` for an unstarted plan and `/execute <absolute-path-to-plan.md>` as the manual alternative. For a started plan, it shows only `/execute`, because `/stage-runner` preflight in `_runner.ts` rejects a plan with any checked task box or an `**In progress**` or `**Execution writer**` ledger line. With blocking findings, it offers neither command.

#### Scenario: Run a reviewed plan (Tasks 1 and 3)
- GIVEN an unstarted plan in a clean feature worktree,
- WHEN the existing runner receives successful writer handoffs and an independent `VERIFIED` verdict,
- THEN it ends after feature-wide verification in either profile without starting publication or ARP. A non-verified outcome follows the existing recovery or stop rules, never a publication step.

### Requirement: Operator-controlled publication
The work-profile instructions SHALL distinguish authorization to publish a verified commit from authorization to request a review or settle a finding.

#### Scenario: Fix a finding after publication (Task 2)
- GIVEN a PR for the verified commit and a finding supported by current code,
- WHEN the operator commits a fix,
- THEN a fresh independent feature verification covers the fix before the operator publishes that exact head, confirms the remote PR head, and explicitly authorizes settlement and re-review.

#### Scenario: Candidate or PR head changed (Task 2)
- GIVEN the current candidate or remote head does not match the expected commit at its respective check,
- WHEN the operator follows the runbook,
- THEN the operator stops before the affected publication or review action; neither missing evidence nor an empty findings response establishes success.

## Execution: one shippable cutover
No task is a separate release. Run repository commands from the feature worktree; run npm commands in `dot_pi/agent/`. Installation is outside runner execution and independent verification.

### Task 1: Retire the legacy command surface and bridge
**Delivers:** Only the qualified automation remains; direct lifecycle and optional PR workflows retain their contracts.
**Blocked by:** None
**Traces to:** Installed commands and surviving contracts.
**Files:** Delete `dot_pi/agent/exact_extensions/ship-conductor/` in full, `dot_pi/agent/ship-conductor-profile.json.tmpl`, and `dot_pi/agent/exact_prompts/{arp-review,arp-fix}.md`. Modify `dot_pi/agent/exact_prompts/{execute,simplify,verify}.md` and `dot_pi/agent/exact_scripts/{lifecycle-prompts.test.mjs,arp-prompts.test.mjs,test-runner.mjs}`.

- [ ] Replace obsolete protocol assertions with focused absence and surviving-contract checks. Run `node --test exact_scripts/{lifecycle-prompts,arp-prompts}.test.mjs` from the agent directory and confirm retirement assertions fail against the old resources.
- [ ] Remove the legacy resources and only their test registrations. Remove bridge-only instructions throughout each surviving prompt, including scope, provenance, input validation, and final handoff branches. Retain the direct writer ledger, model independence, no-publication stage contract and runner JSON handoff. Preserve PR creation opt-in and PR update status-only tests.
- [ ] Rerun the focused tests; expect all to pass. Review remaining lifecycle protocol references for live consumers. Do not implement any alias or change runner code; keep the `PI_LIFECYCLE_CHILD_CONFIG` deletions in `_runner.ts`. Commit `refactor(pi): retire the legacy implementation conductor`.

### Task 2: Document the cutover and manual publication workflow
**Delivers:** Operators and future agents have one supported automated entry point and a safe manual path after verification.
**Blocked by:** Task 1
**Traces to:** Operator-controlled publication; installed commands and surviving contracts; clean plan review handoff.
**Files:** `AGENTS.md`, `dot_pi/agent/AGENTS.md`, `dot_pi/agent/exact_extensions/stage-runner/README.md`, `dot_pi/agent/exact_prompts/{plan,systematic-review}.md`, and `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`.

- [ ] First change the `plan.md` assertion in `exact_scripts/lifecycle-prompts.test.mjs` that matches the `/implement` preflight wording (`preflight rejects checkboxes outside numbered tasks`) so it requires the same rule without a parser claim. In the same file, change the `systematic-review.md` handoff assertion (`with no blocking findings, show \`/execute <absolute-path-to-plan.md>\``) to require the handoff scenario above, and extend the blocking-findings assertion to reject `/stage-runner` as well as `/execute`. Run the focused test and confirm both assertions fail against the current prompts.
- [ ] Update `## Handoff` in `dot_pi/agent/exact_prompts/systematic-review.md` to match the handoff scenario. Change no other handoff in this task.
- [ ] Replace fallback, bridge-testing, and rollback guidance. Preserve plan formatting conventions; remove claims that a retired `/implement` parser enforces them. Distinguish unstarted automation from manual continuation of an already-started plan.
- [ ] Document initial publish/open or update, exact local and remote head checks, and separately authorized work-profile review. Explain `/pr-create` opt-in and `/pr-update` status-only behavior. For a fix, require a clean commit, fresh independent feature-wide `/verify` with publication excluded and all writer IDs, publication of the verified SHA, then evidenced settlement and re-review. Do not invent a `/pr-publish` command. For settlement and re-review, document the direct `agentic-review` MCP tools named under Key decisions, with these guards from the retired `arp-review.md`: compare `gh pr view --json headRefOid` with the expected head before each ARP write; ask the operator to authorize each write and choose `silent`; request a review only through the `allowed_action` that `agentic_review_get_status` returns, with `expected_head_sha`; resolve a finding as `addressed` only with the published fix commit SHA, or as `invalid` only with code or test evidence; treat empty findings as clean only when `reviewed_sha` equals the head, `review_in_progress` is false, and capture is complete; state that resolutions are permanent. Cover missing evidence, denial, head drift, and unavailable ARP.
- [ ] Walk both publication scenarios without remote writes. Run `node --test exact_scripts/{lifecycle-prompts,arp-prompts}.test.mjs`; expect green. Check active guidance for stale commands, separating migration notes from invocation instructions. Commit `docs(pi): document manual publication after stage verification`.

### Task 3: Final source and test checks
**Delivers:** Source and test evidence that the cutover removes the legacy resources and preserves the runner and direct prompts. Live installation evidence is collected separately at rollout.
**Blocked by:** Task 1 and Task 2
**Traces to:** Both requirements; rollout, rollback, and future-agent guidance.
**Files:** Record sanitized writer evidence in `plans/lifecycle-stage-runner-cutover/plan.md`; check that `dot_pi/agent/exact_extensions/stage-runner/README.md` distinguishes source checks from operator rollout.

- [ ] Verify that the focused tests check both runner registrations and all three surviving prompts. Confirm the absence of the conductor directory, profile template, and retired prompts in source. Search the remaining command registrations for retired names, including aliases. Do not run `chezmoi apply` in any stage. Independent `/verify` must collect fresh source and test results; the operator runs the live discovery check only after `VERIFIED`.
- [ ] Run `npm ci --ignore-scripts`, `npm test`, and `npm run test:all` from `dot_pi/agent/`; require fast, integration (including stage runner), typecheck, and smoke tiers to pass. Remove disposable dependencies after all tiers finish. Run `git diff --check`. Do not exercise real publication or ARP writes. Record source checks, test results, and any blocker. Keep the installed command result pending until operator rollout. Commit `docs: record stage runner cutover verification`.
