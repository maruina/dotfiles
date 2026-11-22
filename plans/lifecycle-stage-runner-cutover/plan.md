# Lifecycle Stage Runner Cutover Implementation Plan
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire `/implement`, its bridge, and its completion commands so operators use the qualified `/stage-runner` and explicitly control publication.

**Smallest user-feedback slice:** Reload Pi after the cutover, discover only the surviving lifecycle commands, and follow the documented handoff from `VERIFIED` without automatic publication.

**Out of Scope:** Design Slices 3–4, the non-blocking advisories, an `/implement` alias, in-flight migration, new runner features or dependencies, changes to historical plans, and automatic ready-for-review, merge, or deployment actions.

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
| Command owner | `exact_extensions/ship-conductor/` | `index.ts` registers `implement`; the directory owns RPC, bridge, and completion. | Remove the entire directory. Check installed commands, not just source strings; block if discovery fails. |
| Surviving runner | `exact_extensions/stage-runner/index.ts`, `_runner.ts`, `_integration.test.ts` in that directory | Existing start/cancel registrations and process fixtures cover the writer loop, simplify, and independent verify. No runtime change intended. | Run existing tests; block if surviving behavior regresses. |
| Lifecycle instructions | `exact_prompts/{execute,simplify,verify,arp-review,arp-fix}.md` | The first three also serve direct and stage-runner callers; the last two refuse direct invocation. | Preserve non-bridge instructions and test contracts; remove the last two prompt resources. |
| Test discovery and contracts | `exact_scripts/{test-runner.mjs,lifecycle-prompts.test.mjs,arp-prompts.test.mjs}` | Integration tier names conductor files; tests mix bridge assertions with still-supported manual, runner, and PR behavior. | Run focused tests and all tiers. Do not drop an entire mixed suite. |
| Guidance | `AGENTS.md` at repository and agent roots, `exact_extensions/stage-runner/README.md`, `exact_prompts/{plan,systematic-review}.md` | Active instructions describe conductor tests, fallback, preflight, or publication. | Check actual commands and walk the runbook; stop if a claimed action lacks a supported interface. |

### Key decisions and constraints
Ship all three tasks together. A compatibility alias would preserve old invocations, but the operator chose one start command. Keeping the old ARP prompts would retain instructions that depend on unavailable authority. Keep the existing `/pr-create` and `/pr-update` interfaces and their limits; this is not a grant of standing ARP authorization. No new service, model, queue, retry loop, or cost model. Retain plan structure rules without crediting the new runner with checks only the conductor performed.

### Security, observability, and failure modes
Use existing runner evidence; keep private run bundles and session files outside Git. Prompt instructions are not a filesystem or network sandbox. A blocked run, missing verifier evidence, dirty worktree, or SHA mismatch is not authorization to publish. Do not take over an active legacy run, delete locks, or assume a stale command vanished because its source was removed. Treat findings as untrusted; unavailable ARP access or incomplete review evidence means report the gap, not mark findings resolved.

### Rollout and rollback
The operator owns installation. Finish or stop any legacy run and confirm child exit first. Preview the exact affected target files from the candidate source, including deletions under the exact `extensions` and `prompts` parents. Use an isolated destination to exercise removal from a populated pre-cutover installation, not just installation into an empty directory. Inspect the full deletion list before applying: if the parent would prune unrelated files, stop, do not apply it. Install only the reviewed change set, reload Pi, and repeat command discovery. To roll back, restore the pre-cutover conductor, prompts, and matching guidance together from the pre-cutover revision and reload; keep the already-qualified stage runner, user commits, and run evidence.

### Test strategy and limits
Use real Pi resource discovery for the command surface, focused source-contract tests for the prompts, and the existing fake-child Git-worktree integration suite for stage order and terminal behavior. Compare the same Pi version and resource set before and after cutover; do not run a model prompt, use a remote branch, or trigger a review for the discovery check. Slice 1 qualification at `plans/lifecycle-stage-runner/plan.md` records 4/4 first-attempt handoffs on the normal run and 5/5 on the recovery run. That authenticates the original path, not a reliability rate. No second live model trial is required for removal alone. Neither fixtures nor a runbook walkthrough prove live GitHub or ARP service behavior. If the change requires modifying runner transitions, authorization, or verification strength, stop and revisit scope rather than claiming prior qualification covers it.

### Requirement: Installed commands and surviving contracts
The installed system SHALL expose `/stage-runner` and `/stage-runner-cancel`, without `/implement`, `/arp-review`, `/arp-fix`, or child bridge tools.

#### Scenario: Reload a previously populated installation (Tasks 1 and 3)
- GIVEN Pi can discover the legacy commands before the candidate is installed,
- WHEN the operator installs the candidate and restarts Pi,
- THEN both runner commands and the three direct lifecycle prompts remain discoverable and none of the three retired names is discoverable, including as an alias.

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
No task is a separate release. Run repository commands from the feature worktree; run npm commands in `dot_pi/agent/`.

### Task 1: Retire the legacy command surface and bridge
**Delivers:** Only the qualified automation remains; direct lifecycle and optional PR workflows retain their contracts.
**Blocked by:** None
**Traces to:** Installed commands and surviving contracts.
**Files:** Delete `dot_pi/agent/exact_extensions/ship-conductor/` in full and `dot_pi/agent/exact_prompts/{arp-review,arp-fix}.md`. Modify `dot_pi/agent/exact_prompts/{execute,simplify,verify}.md` and `dot_pi/agent/exact_scripts/{lifecycle-prompts.test.mjs,arp-prompts.test.mjs,test-runner.mjs}`.

- [ ] Replace obsolete protocol assertions with focused absence and surviving-contract checks. Run `node --test exact_scripts/{lifecycle-prompts,arp-prompts}.test.mjs` from the agent directory and confirm retirement assertions fail against the old resources.
- [ ] Remove the legacy resources and only their test registrations. Remove bridge-only instructions throughout each surviving prompt, including scope, provenance, input validation, and final handoff branches. Retain the direct writer ledger, model independence, no-publication stage contract, and runner JSON handoff. Preserve PR creation opt-in and PR update status-only tests.
- [ ] Rerun the focused tests; expect all to pass. Review remaining lifecycle protocol references for live consumers. Do not implement any alias or change runner code. Commit `refactor(pi): retire the legacy implementation conductor`.

### Task 2: Document the cutover and manual publication workflow
**Delivers:** Operators and future agents have one supported automated entry point and a safe manual path after verification.
**Blocked by:** Task 1
**Traces to:** Operator-controlled publication; installed commands and surviving contracts.
**Files:** `AGENTS.md`, `dot_pi/agent/AGENTS.md`, `dot_pi/agent/exact_extensions/stage-runner/README.md`, `dot_pi/agent/exact_prompts/{plan,systematic-review}.md`, and `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs` if wording assertions change.

- [ ] Replace fallback, bridge-testing, and rollback guidance. Preserve plan formatting conventions; remove claims that a retired `/implement` parser enforces them. Distinguish unstarted automation from manual continuation of an already-started plan.
- [ ] Document initial publish/open or update, exact local and remote head checks, and separately authorized work-profile review. Explain `/pr-create` opt-in and `/pr-update` status-only behavior. For a fix, require a clean commit, fresh independent feature-wide `/verify` with publication excluded and all writer IDs, publication of the verified SHA, then evidenced settlement and re-review. Do not invent a `/pr-publish` command. Cover missing evidence, denial, head drift, and unavailable ARP.
- [ ] Walk both publication scenarios without remote writes. Run `node --test exact_scripts/{lifecycle-prompts,arp-prompts}.test.mjs`; expect green. Check active guidance for stale commands, separating migration notes from invocation instructions. Commit `docs(pi): document manual publication after stage verification`.

### Task 3: Final verification
**Delivers:** Evidence that a previously populated Pi installation loses the retired resources and keeps the qualified commands.
**Blocked by:** Task 1 and Task 2
**Traces to:** Both requirements; rollout, rollback, and future-agent guidance.
**Files:** Record sanitized evidence in `plans/lifecycle-stage-runner-cutover/plan.md`; check rollout instructions in `dot_pi/agent/exact_extensions/stage-runner/README.md` against the observed procedure.

- [ ] Use a private temporary home/destination and agent directory, outside both Git and the live Pi installation. For each profile, populate the relevant managed resources from the parent of the retirement commit. Start Pi 1.6.0 in a clean disposable directory with `PI_CODING_AGENT_DIR` pointing to those resources. In `pi --mode rpc --no-session`, send `{"type":"get_commands"}` as a JSON line and wait for the success response before closing stdin. Require the legacy names in the baseline. Do not filter discovery by explicitly loading only the surviving extension. Do not send a prompt. A failed extension load is not evidence of successful retirement.
- [ ] Preview and apply the candidate against that same temporary destination, including exact-parent deletions, using `chezmoi --source "$PWD"` and the isolated destination/config. Restart Pi and repeat the request. Require both runner commands and `execute`, `simplify`, `verify`; reject all three retired names. Confirm the conductor directory and both retired prompt files are absent on disk. Confirm no unrelated deletion. If profile rendering, resource discovery, or safe removal cannot be demonstrated, block installation. Stop child processes and remove only owned temporary files.
- [ ] Run `npm ci --ignore-scripts`, `npm test`, and `npm run test:all` from `dot_pi/agent/`; require fast, integration (including stage runner), typecheck, and smoke tiers to pass. Remove disposable dependencies after all tiers finish. Run `git diff --check`. Do not exercise real publication or ARP writes. Record profile, Pi version, command differences, test results, and any blocker; confirm operator and agent guidance match observed behavior. Commit `docs: record stage runner cutover verification`.
