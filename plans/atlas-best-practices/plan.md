# Atlas Best Practices Skill Implementation Plan
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a curated, Go-only Pi skill that guides Atlas workflow and worker design, implementation, review, compatibility, testing, and deployment-mode detection without importing Claude-specific marketplace skills.

**Architecture:** A concise work-profile `atlas-best-practices` skill routes agents to four local progressive-disclosure references. The references curate stable policy from the Atlas marketplace and targeted Confluence documentation while directing agents to current `dd-source` SDK code and nearby production workers for API details. The existing `atlas-workflows` skill remains responsible for investigating running executions.

**Tech Stack:** Pi Agent Skills Markdown, chezmoi source layout, Atlas Go SDK conventions, Temporal workflow semantics, Node-based skill validation.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `resolve-worktree` | `prompt-required` | `/plan` had no artifact path | Searched all worktrees for design specs and established that the agreed conversation is the source of truth. |
| `skill-loader` | `prompt-required` | Required at the start of planning | Selected the applicable domain and prose skills; confirmed no `.go` implementation skill is triggered because this change modifies Markdown only. |
| `codebase-research` | `skill-loader` | The skill package and upstream Atlas package were unfamiliar code areas | Mapped skill discovery, validation, curation patterns, adjacent skills, and upstream source boundaries before defining tasks. |
| `chezmoi` | `skill-loader` | All affected implementation files are chezmoi source | Selected work-profile source paths, targeted diff/apply behavior, and feature-worktree source overrides. |
| `write` | `skill-loader` | The implementation and plan are human-facing prose | Kept the router concise, separated detailed guidance into references, and made requirements direct and testable. |
| `obsidian-cli` | `prompt-required` | The planning workflow requires an advisory learning lookup | Read `Datadog/Learnings.md` through Obsidian and piped it to the learning evidence helper. |
| `obsidian-markdown` | `prompt-required` | Required before operating on an Obsidian note | Kept the learning store read-only and preserved its Markdown structure. |
| `atlassian-mcp` | `agent-selected` | The user supplied internal Atlas Confluence sources | Used read-only hierarchy and page retrieval to cross-check targeted Atlas documentation. |

## Source of Truth and Scope
The agreed conversation defines the feature:

- Create a curated Pi-native `atlas-best-practices` skill for Go Atlas work.
- Curate maintained Atlas guidance instead of loading `DataDog/claude-marketplace/atlas/skills` directly.
- Include no Python guidance, examples, source references, commands, filenames, or terminology in the new skill directory.
- Keep the skill automatically discoverable and load it from lifecycle workflows through `skill-loader`.
- Keep runtime workflow investigation in the existing `atlas-workflows` skill.
- Prefer current Atlas SDK code, generated interfaces, and nearby production Go workers in `dd-source` over embedded examples or older documentation.

The upstream curation baseline is `DataDog/claude-marketplace` commit `6677680bfcb29ec9f79dbd021035f704d6844a8c`. Targeted Confluence cross-checks cover retries/timeouts, determinism/version gates, Atlas concepts, and domain partitions. `SOURCES.md` records this provenance without creating a vendoring contract.

### Out of scope
- Importing or directly loading marketplace skills at runtime.
- Python worker guidance or references of any kind.
- Claude-specific frontmatter, `AskUserQuestion`, Task agents, or native MCP tool names.
- Confluence mutation, Jira filing, generated code templates, helper scripts, or new dependencies.
- A synchronization prompt or `VENDOR.md`.
- Changes to `atlas-workflows`.
- Running, mutating, canceling, signaling, or terminating Atlas workflows.

## Advisory Learning Lookup
The planning lookup used the terms `Pi skills`, `progressive disclosure`, `curated skill`, `Atlas`, `Temporal`, `determinism`, `version gate`, and `skill-loader`. It returned no matching complete H2 sections, so no advisory learning changes this plan.

## Feasibility Gate
| Requirement | Mechanism | Evidence it exists | Validation | If unavailable |
|---|---|---|---|---|
| Pi discovers the new work skill | Place a valid `SKILL.md` below `dot_pi/agent/exact_skills_work/` | Pi skill documentation and the existing `atlas-workflows` layout | `npm run test:skills` and `npm run test:skills:profiles` validate the source tree | Stop; do not add an extension or settings workaround. |
| Detailed guidance stays out of initial context | Use relative files below `references/` | Pi supports skill-local references; existing curated skills use this pattern | Check every reference named by `SKILL.md` exists and inspect the router size/content | Reduce scope to essential router guidance if references cannot load. |
| The package is strictly Go-only | Curate only selected Go Atlas material | Upstream guidance is separated by task and language; the user explicitly narrowed scope | A case-insensitive scan rejects `python`, `py-test`, and `.py` anywhere in the package | Remove the content before proceeding. |
| Lifecycle workflows load the skill | Add an Atlas Go domain entry to `skill-loader` | Existing domain-skill entries use explicit trigger text | Content assertion plus skill validation | Stop integration; do not rely only on model description matching. |
| Provenance is retained without wholesale vendoring | Add `SOURCES.md` and omit `VENDOR.md` | `/sync-vendored-skills` treats only directories with `VENDOR.md` as exact upstream copies | Assert `SOURCES.md` exists and `VENDOR.md` does not | Put minimal provenance in `SKILL.md` if a separate source file is unsupported. |
| Chezmoi renders the intended targets | Use the feature worktree as `chezmoi --source` | Existing target mapping resolves `exact_skills_work` to `~/.pi/agent/skills_work` | Targeted `chezmoi --source "$PWD" diff` | Stop rollout and correct source mapping. |
| The complete Pi candidate remains healthy | Install locked source dependencies and run package tests | `dot_pi/agent/package.json` exposes skill, unit, prompt, dependency, and smoke checks | `npm ci --ignore-scripts`, `npm test`, and `npm run test:all` | Report the blocker and leave the candidate unapplied. |

## Implementation Contract
**Components Affected**
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Atlas skill router | `dot_pi/agent/exact_skills_work/atlas-best-practices/SKILL.md` | Define Go-only triggers, source precedence, task routing, non-negotiable workflow rules, validation workflow, and the boundary with `atlas-workflows` | Skill validator, reference existence checks, content assertions, semantic review |
| Source provenance | `dot_pi/agent/exact_skills_work/atlas-best-practices/SOURCES.md` | Record upstream commit/files, targeted documentation, curation boundaries, and source precedence without implying exact vendoring | File/content assertions; verify no `VENDOR.md` |
| Platform and SDK guidance | `dot_pi/agent/exact_skills_work/atlas-best-practices/references/platform-and-sdk.md` | Explain Atlas-specific generated interfaces, proto-first discovery, Atlas SDK preference, and current-code precedence | Required-token assertions and semantic review |
| Workflow authoring guidance | `dot_pi/agent/exact_skills_work/atlas-best-practices/references/workflow-authoring.md` | Define deterministic workflow code, activity boundaries, idempotency, retries, timeouts, heartbeats, signals, queries, child workflows, and Continue-As-New | Required-token assertions and semantic review |
| Compatibility and tests | `dot_pi/agent/exact_skills_work/atlas-best-practices/references/compatibility-and-testing.md` | Define breaking changes, version gates, gate cleanup, Breaking Change Detection baselines, replay tests, and Atlas test-suite expectations | Required-token assertions and semantic review |
| Worker and deployment guidance | `dot_pi/agent/exact_skills_work/atlas-best-practices/references/worker-and-deployment.md` | Detect Rapid Go versus native Atlas Go and Domains versus Classic; select repository-native test/deployment validation paths | Required-token assertions and semantic review |
| Lifecycle routing | `dot_pi/agent/exact_skills/skill-loader/SKILL.md` | Load `atlas-best-practices` for Atlas Go workflows, activities, workers, protos, compatibility, and worker deployment configuration | Focused content assertion and skill validation |

**Key Decisions**
- Use one concise router with four references. Do not split the feature into overlapping top-level skills.
- Treat the new skill as hand-maintained. `SOURCES.md` records provenance; the absence of `VENDOR.md` prevents `/sync-vendored-skills` from replacing curated content.
- Keep the router action-oriented: inspect the proto, generated API, worker implementation, deployment config, and nearby examples before recommending changes.
- Prefer Atlas-generated clients and test helpers over direct Temporal client, worker, or test-suite APIs when an Atlas equivalent exists.
- Load both `atlas-best-practices` and `go-best-practices` for Atlas `.go` changes. Atlas guidance takes precedence for SDK choice, workflow determinism, retries/timeouts, versioning, and Atlas testing; general Go guidance governs ordinary Go style.
- Avoid freezing exact worker test or deployment commands in the router. Detect the worker type and reuse the commands, Bazel targets, and configuration already present in the current repository.
- Mention Atlas Domains and Atlas Classic only to select connection, configuration, and validation paths. Do not reproduce the marketplace `deploy.yaml` management skill.

**Security Requirements**
- Do not include credentials, tokens, workflow payloads, execution histories, private service data, or copied production examples.
- Internal documentation URLs and public repository paths may be recorded, but the skill must not fetch or mutate Confluence, Jira, Atlas, or Temporal by itself.
- Runtime workflow operations remain read-only by default under `atlas-workflows`; this skill must route execution investigations there instead of adding mutation instructions.

**Observability Requirements**
- No runtime logs, metrics, traces, alerts, dashboards, or runbooks are required. This feature changes local agent guidance and introduces no service, background process, network call, or persistent runtime state.
- Implementation evidence consists of source validation, semantic source comparison, complete Pi tests, and targeted chezmoi diffs.

**Failure Modes to Handle**
- **Stale embedded API guidance:** Require agents to inspect current `dd-source` SDK/generated code and nearby workers before editing; keep examples conceptual rather than copying large templates.
- **Overlap with `atlas-workflows`:** State that authoring/review belongs here and running-execution investigation belongs to `atlas-workflows`.
- **Non-Go content leakage:** Fail the package content scan before commit.
- **Broken progressive-disclosure links:** Check every named reference exists before commit.
- **Accidental exact vendoring:** Fail if `VENDOR.md` exists.
- **Skill not selected during lifecycle work:** Add an explicit `skill-loader` trigger rather than relying only on automatic description matching.
- **Feature-worktree render checks use the base checkout:** Run every chezmoi diff with `--source "$PWD"` from the feature-worktree root.

**Rollout and Rollback**
- Build and commit the source candidate in the feature worktree. Do not apply managed targets during `/execute`.
- Leave ignored `dot_pi/agent/node_modules` present after execution so independent `/verify` can run read-only package checks without mutating the candidate.
- After `/verify` returns `VERIFIED`, inspect the same targeted diff and apply only `~/.pi/agent/skills_work/atlas-best-practices` and `~/.pi/agent/skills/skill-loader/SKILL.md` from the verified worktree source.
- Start a fresh Pi session after apply so skill discovery reloads. No production rollout or Atlas operation is involved.
- Roll back by reverting the implementation commits and applying the same two target paths. The exact work-skills parent removes the retired target directory; no data migration or remote cleanup is required.
- Operational owner: Matteo. The change has no on-call or 3 a.m. service impact because it only affects local agent instructions.

**Test Strategy**
- Use a file-absence check as the focused red test for the new skill package, then run metadata validation after the smallest complete package exists.
- Use content-contract checks for reference existence, required Atlas invariants, source provenance, package boundaries, and strict Go-only scope.
- Use a focused red check for the absent `skill-loader` entry, then validate the completed routing text.
- Run `npm run test:skills` after each behavior slice and `npm run test:skills:profiles` after integration.
- Before independent verification, install locked dependencies with `npm ci --ignore-scripts`, then run `npm test` and `npm run test:all`.
- Semantic correctness is not fully automatable because this is agent guidance. Compare each reference against the recorded upstream files and targeted documentation during implementation and require `/systematic-review` plus independent `/verify` before apply.
- No external system is mocked or called. Atlas, Temporal, Confluence, Jira, and `dd-source` remain read-only sources or deferred runtime sources of truth.

## Acceptance Criteria
### Requirement R1: Pi discovers a concise Go Atlas skill
Pi SHALL discover a uniquely named `atlas-best-practices` work skill whose description targets designing, implementing, reviewing, and testing Go Atlas workflows and workers.

#### Scenario: Source skill validation
- GIVEN the new skill package exists under `dot_pi/agent/exact_skills_work/`
- WHEN `npm run test:skills` and `npm run test:skills:profiles` run from `dot_pi/agent`
- THEN both commands exit successfully
- AND the validator reports no invalid or duplicate skill name.

### Requirement R2: The router uses progressive disclosure and preserves adjacent-skill boundaries
The skill SHALL keep core workflow instructions in `SKILL.md`, route detailed topics to four existing local references, and route running-execution investigation to `atlas-workflows`.

#### Scenario: Reference and boundary check
- GIVEN the completed skill package
- WHEN its local reference links and routing text are inspected
- THEN every named reference exists
- AND `SKILL.md` names `atlas-workflows` as the execution-investigation skill
- AND the router does not duplicate execution-history commands.

### Requirement R3: Workflow authoring guidance protects determinism and reliability
The skill SHALL require workflow-safe APIs, deterministic iteration and values, activity boundaries for external side effects, idempotent activities, explicit activity timeouts, heartbeats for long-running activities, and no default workflow retry policy.

#### Scenario: Authoring contract inspection
- GIVEN `references/workflow-authoring.md`
- WHEN the authoring contract is checked
- THEN it distinguishes `workflow.Context` from ordinary context usage
- AND covers workflow-safe time and concurrency constructs
- AND covers `schedule_to_close_timeout`, `start_to_close_timeout`, and `heartbeat_timeout`
- AND explains at-least-once activity execution and idempotency
- AND advises against workflow retry policies by default.

### Requirement R4: Compatibility guidance protects existing workflow histories
The skill SHALL identify determinism-breaking changes, require monotonic version gates where needed, require Breaking Change Detection before and after risky changes, and require safe evidence before removing old gates.

#### Scenario: Breaking-change workflow inspection
- GIVEN `references/compatibility-and-testing.md`
- WHEN its compatibility procedure is checked
- THEN it covers payload type compatibility and adding, removing, or reordering workflow commands
- AND uses `workflow.GetVersion` with `workflow.DefaultVersion`
- AND says maximum gate versions only increase
- AND requires a pre-change Breaking Change Detection baseline and post-change comparison
- AND accounts for conditional or not-yet-evaluated gates before cleanup
- AND includes replay tests as evidence for high-risk or previously failing workflows.

### Requirement R5: Worker guidance detects current Go worker and deployment patterns
The skill SHALL distinguish Rapid Go from native Atlas Go and Atlas Domains from Atlas Classic without hardcoding one repository-wide command.

#### Scenario: Worker routing inspection
- GIVEN `references/worker-and-deployment.md`
- WHEN its detection sequence is checked
- THEN it starts from current worker files and configuration
- AND covers `rapid.json`, `worker.go`, `atlas_domain`, and `atlas_context`
- AND tells the agent to reuse repository-native Bazel, Rapid, deployment, and validation targets
- AND treats domain partition identifiers as opaque.

### Requirement R6: The curated package contains no Python material
The new skill directory MUST contain no Python guidance, examples, source references, commands, filenames, or terminology.

#### Scenario: Strict package content scan
- GIVEN all files below `dot_pi/agent/exact_skills_work/atlas-best-practices/`
- WHEN a case-insensitive scan searches for `python`, `py-test`, and `.py`
- THEN the scan returns no matches.

### Requirement R7: Lifecycle workflows explicitly load Atlas guidance
`skill-loader` SHALL load `atlas-best-practices` for Atlas Go workflow, activity, worker, proto, compatibility, and deployment-configuration work while retaining `go-best-practices` for ordinary Go concerns.

#### Scenario: Loader routing inspection
- GIVEN the updated `skill-loader`
- WHEN its Atlas domain entry is inspected
- THEN it names `atlas-best-practices`
- AND states its file and task triggers
- AND defines precedence between Atlas-specific and general Go guidance.

### Requirement R8: Curation provenance is reproducible without creating a vendoring contract
The package SHALL record the curated upstream commit and selected sources, state current-code precedence, and remain hand-maintained.

#### Scenario: Provenance inspection
- GIVEN the completed package
- WHEN its provenance files are checked
- THEN `SOURCES.md` records commit `6677680bfcb29ec9f79dbd021035f704d6844a8c`
- AND records the selected marketplace and targeted Confluence sources
- AND states that current `dd-source` code and nearby production workers take precedence for implementation details
- AND no `VENDOR.md` exists.

## Task 1 — Add the curated Go Atlas skill package
**Requirements:** R1, R2, R3, R4, R5, R6, R8

**Files:**
- Create `dot_pi/agent/exact_skills_work/atlas-best-practices/SKILL.md`
- Create `dot_pi/agent/exact_skills_work/atlas-best-practices/SOURCES.md`
- Create `dot_pi/agent/exact_skills_work/atlas-best-practices/references/platform-and-sdk.md`
- Create `dot_pi/agent/exact_skills_work/atlas-best-practices/references/workflow-authoring.md`
- Create `dot_pi/agent/exact_skills_work/atlas-best-practices/references/compatibility-and-testing.md`
- Create `dot_pi/agent/exact_skills_work/atlas-best-practices/references/worker-and-deployment.md`

- [ ] From the repository root, run the focused red check:
  ```fish
  test -f dot_pi/agent/exact_skills_work/atlas-best-practices/SKILL.md
  ```
  Expected before implementation: exit status 1 because the skill does not exist.
- [ ] Create `SKILL.md` with valid frontmatter and a specific Go Atlas description. Keep it concise and include:
  - authoring/review scope and the `atlas-workflows` runtime-investigation boundary;
  - a discovery sequence that reads proto definitions, generated interfaces/clients, workflow/activity implementation, worker bootstrap, deployment config, tests, and nearby examples before editing;
  - source precedence: current code and generated APIs, then current repository patterns, then curated references;
  - routing to each of the four references;
  - a short non-negotiable checklist for deterministic workflows, activity reliability, compatibility, and validation;
  - instructions to use Atlas-generated clients/test helpers instead of direct Temporal equivalents when Atlas provides them.
- [ ] Create `SOURCES.md` with the marketplace repository, pinned commit, selected Go source files, targeted Confluence cross-checks, curation boundaries, and current-code precedence. State that the package is curated and hand-maintained without introducing `VENDOR.md` or a sync workflow.
- [ ] Create `references/platform-and-sdk.md` covering Atlas-specific generated contracts, proto-first API discovery, external versus cross-worker clients, generated test helpers, current-code precedence, and the rule against bypassing Atlas abstractions when equivalents exist.
- [ ] Create `references/workflow-authoring.md` covering deterministic workflow APIs, stable map iteration, time/random/environment handling, activity boundaries, serialized errors, idempotency, retryable versus non-retryable failures, activity timeouts, heartbeats, workflow timeout/retry policy, signals, queries, child workflows, and Continue-As-New.
- [ ] Create `references/compatibility-and-testing.md` covering compatibility-sensitive payload changes and workflow commands, `workflow.GetVersion`, monotonic version gates, baseline/post-change Breaking Change Detection, conditional-gate cleanup hazards, Atlas test-suite patterns, replay tests, and required evidence before deployment.
- [ ] Create `references/worker-and-deployment.md` covering Rapid Go versus native Atlas Go detection, Domains versus Classic detection, opaque partitions, current repository test/deployment target discovery, schedules/checkpoints as compatibility-sensitive workflow behavior, and repository-native validation.
- [ ] Check reference completeness and package boundaries:
  ```fish
  set skill_dir dot_pi/agent/exact_skills_work/atlas-best-practices
  for file in SOURCES.md references/platform-and-sdk.md references/workflow-authoring.md references/compatibility-and-testing.md references/worker-and-deployment.md
      test -f "$skill_dir/$file"; or exit 1
  end
  test ! -e "$skill_dir/VENDOR.md"
  rg -n 'atlas-workflows|references/platform-and-sdk.md|references/workflow-authoring.md|references/compatibility-and-testing.md|references/worker-and-deployment.md' "$skill_dir/SKILL.md"
  ```
  Expected: every file check succeeds, `VENDOR.md` is absent, and every routing term is present.
- [ ] Enforce the strict Go-only scope:
  ```fish
  set skill_dir dot_pi/agent/exact_skills_work/atlas-best-practices
  if rg -n -i '\bpython\b|py-test|\.py\b' "$skill_dir"
      exit 1
  end
  ```
  Expected: no output and exit status 0.
- [ ] Check the required Atlas invariants are represented:
  ```fish
  set skill_dir dot_pi/agent/exact_skills_work/atlas-best-practices
  rg -n 'workflow\.Context|schedule_to_close_timeout|start_to_close_timeout|heartbeat_timeout|idempoten' "$skill_dir/references/workflow-authoring.md"
  rg -n 'workflow\.GetVersion|workflow\.DefaultVersion|Breaking Change Detection|baseline|replay' "$skill_dir/references/compatibility-and-testing.md"
  rg -n 'rapid\.json|worker\.go|atlas_domain|atlas_context|opaque' "$skill_dir/references/worker-and-deployment.md"
  rg -n '6677680bfcb29ec9f79dbd021035f704d6844a8c|dd-source|hand-maintained' "$skill_dir/SOURCES.md"
  rg -n '2650278317|2715222385|5849318375|5849973811' "$skill_dir/SOURCES.md"
  ```
  Expected: every `rg` invocation finds all listed concepts in the designated file.
- [ ] Run focused skill validation:
  ```fish
  cd dot_pi/agent
  npm run test:skills
  ```
  Expected: exit status 0 with 27 validated skills and no invalid or duplicate name.
- [ ] Review all six files against the recorded upstream sources. Remove copied Claude interaction mechanics, large templates, fixed repository examples, and unsupported universal commands.
- [ ] Commit the complete vertical slice:
  ```fish
  git add dot_pi/agent/exact_skills_work/atlas-best-practices
  git commit -m 'feat(skills): add Go Atlas best practices'
  ```

## Task 2 — Integrate Atlas guidance with lifecycle skill loading
**Requirements:** R7

**Files:**
- Modify `dot_pi/agent/exact_skills/skill-loader/SKILL.md`

- [ ] Run the focused red check:
  ```fish
  if rg -n 'atlas-best-practices' dot_pi/agent/exact_skills/skill-loader/SKILL.md
      exit 1
  end
  ```
  Expected before implementation: no output and exit status 0, proving the loader entry is absent.
- [ ] Add an `Atlas Go workflows — atlas-best-practices` domain entry. Trigger it for:
  - Go Atlas workflow, activity, worker, client, generated-client, or worker-bootstrap changes;
  - Atlas Temporal proto definitions and options;
  - determinism, version gates, Breaking Change Detection, replay tests, signals, queries, child workflows, Continue-As-New, retries, timeouts, schedules, and checkpoints;
  - worker deployment configuration when the task depends on `atlas_domain`, `atlas_context`, task queues, or Atlas worker routing.
- [ ] State precedence explicitly: load `go-best-practices` for affected `.go` files, but follow `atlas-best-practices` where Atlas SDK choice, workflow semantics, determinism, retry/timeout behavior, compatibility, or Atlas testing differs from ordinary Go guidance.
- [ ] Extend the loader checklist with one concise Atlas check: determine whether affected Go/proto/deployment files define or invoke Atlas workflows and load `atlas-best-practices` when they do.
- [ ] Verify the routing contract:
  ```fish
  rg -n 'Atlas Go workflows|atlas-best-practices|workflow|activity|proto|atlas_domain|atlas_context|go-best-practices' dot_pi/agent/exact_skills/skill-loader/SKILL.md
  ```
  Expected: the Atlas entry, task triggers, deployment keys, and precedence rule are present.
- [ ] Run integrated skill validation:
  ```fish
  cd dot_pi/agent
  npm run test:skills
  npm run test:skills:profiles
  ```
  Expected: both commands exit 0 and validate 27 skills under default, work, and personal profiles.
- [ ] Commit the loader integration:
  ```fish
  git add dot_pi/agent/exact_skills/skill-loader/SKILL.md
  git commit -m 'feat(skills): load Atlas guidance for Go work'
  ```

## Task 3 — Complete candidate validation and future-agent guidance review
**Requirements:** R1–R8

**Files:**
- Inspect `AGENTS.md`
- Inspect `dot_pi/agent/AGENTS.md`
- Inspect `dot_pi/agent/exact_skills_work/atlas-workflows/SKILL.md`
- Inspect relevant README and prompt documentation if present
- Modify these files only if the implementation exposes a durable guidance gap not already covered by the new skill, `skill-loader`, or existing repository instructions

- [ ] Inspect the final source diff and requirement traceability before installing dependencies:
  ```fish
  git status --short
  git diff origin/main...HEAD --stat
  git diff --check origin/main...HEAD
  ```
  Expected: the committed plan, the six new skill-package files, and `skill-loader/SKILL.md` are the only source changes; whitespace validation passes.
- [ ] Re-run package content contracts from Task 1 and loader routing checks from Task 2 against the committed candidate. Expected: all checks pass unchanged.
- [ ] Install locked source dependencies as required for Pi agent verification:
  ```fish
  cd dot_pi/agent
  npm ci --ignore-scripts
  ```
  Expected: exit status 0. Leave the ignored `node_modules` directory present through independent `/verify`.
- [ ] Run the complete source validation suite:
  ```fish
  cd dot_pi/agent
  npm test
  npm run test:all
  ```
  Expected: all unit, prompt, skill, dependency, and offline smoke tests pass with no extension issues.
- [ ] Inspect targeted chezmoi drift from the feature-worktree root:
  ```fish
  chezmoi --source "$PWD" diff ~/.pi/agent/skills_work/atlas-best-practices ~/.pi/agent/skills/skill-loader/SKILL.md
  ```
  Expected: the diff contains only the new Atlas skill package and the reviewed loader entry.
- [ ] Review documentation and future-agent guidance:
  - Confirm `AGENTS.md` already defines chezmoi source ownership, work-profile skill layout, lifecycle workflow, dependency setup, verification, and apply rules.
  - Confirm `dot_pi/agent/AGENTS.md` already defines Pi skill layout and behavior-bearing verification expectations.
  - Confirm `atlas-workflows` remains a clear runtime-investigation companion and does not need editing.
  - Confirm no README, runbook, generated reference, or user-facing documentation needs a separate update because `SKILL.md`, `SOURCES.md`, and the four references are the feature documentation.
  - If all statements hold, record the no-change decision in execution evidence. If a durable repository-level gap is found, make the smallest documentation-only edit, rerun the affected checks, and commit it as `docs: record Atlas skill maintenance guidance`.
- [ ] Do not apply managed targets, remove `node_modules`, push, or claim final verification during `/execute`. Hand the committed candidate to `/verify` with dependencies present.

## Post-Verification Rollout
Run only after an independent `/verify` returns `VERIFIED` for the unchanged candidate.

- [ ] From the verified worktree root, inspect the targeted diff again:
  ```fish
  chezmoi --source "$PWD" diff ~/.pi/agent/skills_work/atlas-best-practices ~/.pi/agent/skills/skill-loader/SKILL.md
  ```
  Expected: identical reviewed changes only.
- [ ] Apply the verified targets:
  ```fish
  chezmoi --source "$PWD" apply ~/.pi/agent/skills_work/atlas-best-practices ~/.pi/agent/skills/skill-loader/SKILL.md
  ```
- [ ] Validate the rendered Pi agent:
  ```fish
  cd ~/.pi/agent
  npm run test:skills
  ```
  Expected: exit status 0 and 27 discovered skills.
- [ ] Start a fresh Pi session and invoke `/skill:atlas-best-practices`. Expected: the command loads the Go Atlas router and exposes its four local references; no external checkout is required. No mutation or cleanup is needed.
- [ ] Remove the ignored source-worktree dependencies after verification and rollout:
  ```fish
  rm -rf dot_pi/agent/node_modules
  ```
- [ ] Push the reviewed branch after the verified apply and rendered check succeed.

## Requirement Traceability
| Requirement | Implementation task | Primary validation |
|---|---|---|
| R1 — Discoverable Go Atlas skill | Task 1 | `npm run test:skills`, profile validation |
| R2 — Progressive disclosure and boundary | Task 1 | Reference existence and `atlas-workflows` routing assertions |
| R3 — Determinism and reliability | Task 1 | Authoring invariant assertions plus semantic review |
| R4 — Compatibility and testing | Task 1 | Version-gate/BCD/replay assertions plus semantic review |
| R5 — Worker and deployment detection | Task 1 | Worker/config token assertions plus semantic review |
| R6 — No Python material | Task 1 | Strict package content scan |
| R7 — Lifecycle loading | Task 2 | Loader routing assertion and profile validation |
| R8 — Reproducible curation provenance | Task 1 | `SOURCES.md` assertions and absent `VENDOR.md` |

## Documentation and Operational Impact
- The skill package is the user and developer documentation for this feature.
- No service documentation, runbook, metrics, alerts, dashboards, or operational migration is required.
- No `AGENTS.md` change is expected because current guidance already covers chezmoi ownership, Pi source layout, dependency setup, lifecycle verification, and apply behavior. Task 3 must still inspect and record the final decision.
- The only live effect after rollout is that future Pi sessions can load the new skill and lifecycle workflows know when to select it.
