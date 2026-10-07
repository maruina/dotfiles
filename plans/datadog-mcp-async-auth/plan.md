# Datadog MCP Async Auth Implementation Plan
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pi starts without blocking on `dd-auth`, and the `datadog-prod` and `datadog-staging` MCP servers become available in the background before the first prompt.
**Smallest user-feedback slice:** Start pi with no startup freeze or MCP header warning, then find `mcp__datadog_prod` tools through `tool_search`.
**Out of Scope:** Upstream reports to pi (async header resolution) and `dd-auth` (feature-flag startup latency); changes to `ddci-mcp-prod`, `slack`, or `ha-mcp`; bumping the pi devDependency from 0.80.6; parsing `dd-auth -v` expiry output.
**Architecture:** A work-profile extension fetches both keys per Datadog domain with async `execFile("dd-auth", …)` after `session_start`, then registers each server with `pi.registerMcpServer` and literal headers. A 5-minute interval refreshes the keys and re-registers a server only when its keys change. The `run_onchange` script removes the old `mcp.json` entries, because a same-name `mcp.json` server takes precedence over an extension registration.
**Tech Stack:** TypeScript, Pi `ExtensionAPI` (`registerMcpServer`, `session_start`, `session_shutdown`, `ctx.ui.notify`), Node `child_process.execFile`, `node:test` with mock timers, chezmoi source, Bash.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | `/plan` requires skill discovery | Selected the skills below from the affected files. |
| `learning-lookup` | `prompt-required` | Required before planning decisions | Searched `Datadog/Learnings.md` for `mcp`, `dd-auth`, `extension`, `registerMcpServer`, `pi extension`, and `timer`; no sections matched. |
| `codebase-research` | `skill-loader` | Pi MCP header resolution is unfamiliar code | Traced `resolve-config-value.js` (`execSync`, 10s timeout, no cache for MCP headers) and `mcp/runtime.js` (headers resolved per transport). |
| `chezmoi` | `skill-loader` | Files under the chezmoi source change | Applied the extension contract (default factory, helpers in the extension directory) and `.chezmoiignore` profile gating. |
| `script-best-practices` | `skill-loader` | `run_onchange_pi-mcp-servers.sh.tmpl` changes | Keep the existing script style; change only the two `datadog-*` registrations. |
| `feature-worktree` | `prompt-required` | Durable plans need a feature worktree | Created `maruina/datadog-mcp-async-auth` from `origin/main` under `~/src/.worktrees/dotfiles/`. |

### Execution
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `resolve-worktree` | `prompt-required` | Resolve the supplied plan path to its owning worktree | Resolved the plan under `~/src/.worktrees/dotfiles/` and used that worktree throughout. |
| `feature-worktree` | `prompt-required` | Continue implementation in the feature worktree | Confirmed the plan's branch and continued in the existing worktree. |
| `skill-loader` | `prompt-required` | Required at the start of `/execute` | Selected execution skills based on the affected TS, chezmoi, and shell files. |
| `codebase-research` | `skill-loader` | MCP registration and async auth are behavior-bearing and unfamiliar | Checked existing extension/test patterns and verified the Pi 1.0.4 MCP registration API and replacement behavior. |
| `chezmoi` | `skill-loader` | Source files in the chezmoi repository are changing | Followed source-only editing and profile/template validation guidance. |
| `script-best-practices` | `skill-loader` | The MCP registration run script will change in this slice | Matched the existing Bash script style and validated rendered syntax. |
| `reviewable-pr-workflow` | `skill-loader` | Prepare this completed slice for review | Applied the stack-split check and kept the coupled extension/configuration work in one PR. |
| `write` | `skill-loader` | Draft the PR description | Wrote concise change, rationale, reviewer focus, and verification sections. |
| `resolve-worktree` | `prompt-required` | Resolve the plan path in this session | Confirmed the existing feature worktree owns the plan. |
| `feature-worktree` | `prompt-required` | Continue the plan in its feature worktree | Confirmed the active feature branch and kept the base checkout on `main`. |
| `skill-loader` | `prompt-required` | Required at the start of this `/execute` stage | Selected skills for the async refresh behavior and existing draft PR. |
| `codebase-research` | `skill-loader` | Modify auth refresh and timer lifecycle behavior | Traced the existing auth cycle and timer/test boundaries before changing them. |
| `chezmoi` | `skill-loader` | The extension source under the chezmoi repo is changing | Kept all edits in source files and used the existing package/test workflow. |
| `reviewable-pr-workflow` | `skill-loader` | Update the open draft PR after this slice | Confirmed no human review started, found no stack split, and updated PR #101 for Slices 1 and 2. |
| `write` | `skill-loader` | Update the plan ledger and PR description | Followed concise, evidence-based prose guidance. |

## Source of truth and confirmed decisions
- Evidence from pi 1.0.4: `dist/core/resolve-config-value.js` runs `!command` values with blocking `execSync`, a 10s timeout, and stderr ignored. `dist/extensions/mcp/runtime.js` `createDefaultTransport` resolves headers each time it creates a transport. `docs/extensions.md` says `registerMcpServer` replaces an earlier registration with the same name, and a same-name `mcp.json` server takes precedence.
- Evidence from `dd-auth` v1.5.1: a cache hit spends about 2.3s before its first log line (feature-flag startup). PATs are cached in the Keychain for about 8 hours. `dd-auth --domain <d> -- printenv DD_API_KEY DD_APP_KEY` prints two lines that match `^[A-Za-z0-9_-]+$`. Four parallel `dd-auth` calls hung for more than 120s.
- Matteo confirmed: refresh by polling every 5 minutes (no `-v` parsing); notify with a warning on the first failure and once after recovery; keep the last good registration on failure.
- Matteo's goal: startup must not block; `dd-auth` finishes while he picks the model and writes the prompt.

## Implementation Contract
### Components Affected
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Extension entry | `dot_pi/agent/exact_extensions/datadog-mcp-auth/index.ts` | Default factory; wires the real `dd-auth` runner and timers into the core | `npm run test:smoke`; manual pi start |
| Extension core | `dot_pi/agent/exact_extensions/datadog-mcp-auth/_core.ts` | Server table, key fetch and validation, registration, refresh, notification state | `_core.test.ts` |
| Tests | `dot_pi/agent/exact_extensions/datadog-mcp-auth/_core.test.ts`, `dot_pi/agent/package.json` (`test:unit` list) | Scenarios below | `npm run test:unit` |
| MCP registration script | `run_onchange_pi-mcp-servers.sh.tmpl` | Remove `datadog-prod` and `datadog-staging` from `mcp.json` in both profiles | `chezmoi --source "$PWD" execute-template` render; `jq` on `~/.pi/agent/mcp.json` after apply |
| Profile gate | `.chezmoiignore` | Ignore `.pi/agent/extensions/datadog-mcp-auth` in the personal profile | Render with `--override-data '{"profile":"personal"}'` |
| Guidance | `AGENTS.md`, `dot_pi/agent/exact_skills_work/datadog-mcp/SKILL.md` | Describe extension-based auth | Review |

### Key Decisions
- **Literal headers through `registerMcpServer`:** pi still runs header values through template resolution, so the extension accepts only keys that match `^[A-Za-z0-9_-]+$`. A key with `$` or a leading `!` would otherwise be interpolated or run as a command.
- **One `dd-auth` call per domain, run in sequence:** `printenv DD_API_KEY DD_APP_KEY` returns both keys in one call. Sequential calls avoid the observed parallel hang and halve the startup cost.
- **`execFile` without a shell, 60s timeout, `stdin` ignored, `DD_EXPERIMENTS_NOOP=true`:** no shell quoting, and a hung login or network stall ends with an observable failure. Subprocess environment sets `DD_EXPERIMENTS_NOOP=true` to skip feature flag evaluation and shave ~30% off each `dd-auth` call without polluting the user's shell.
- **Poll every 5 minutes, re-register only on change:** the `dd-auth` Keychain cache makes a poll cheap (about 2.3s of async work per domain), and change detection avoids a reconnect on every poll. The worst-case window with an expired key is about 5 minutes.
- **Fire-and-forget from `session_start`:** the handler must not await the fetch, so pi never waits for `dd-auth`.
- **Inject the runner and scheduler at the core boundary:** `_core.ts` takes a `runDdAuth(domain) => Promise<string>` function and uses `setInterval`/`clearInterval`, so tests mock the child process and use `node:test` mock timers. This matches the `jira/` pattern of injecting the request function at the registrar boundary.

### Implementation Constraints
- Match the server config from the current script exactly: URL `https://mcp.datadoghq.com/api/unstable/mcp-server/mcp`, `exposure: "deferred"`, and the two existing descriptions.
- Never log, notify, or persist key values. Error messages name the domain and the failure kind (exit code, timeout, invalid output) only.
- Allow at most one fetch cycle at a time. If a cycle is still running when the interval fires, skip that tick.
- `unref()` the interval so it never keeps the process alive. Clear it in an idempotent `session_shutdown` handler. Mark the runner inactive on shutdown so any in-flight fetch cycle that settles after shutdown discards its result and skips registration.
- Stop and ask if `registerMcpServer` does not exist at runtime in pi 1.0.4, or if re-registering the same name does not replace the earlier server.

### Security Requirements
- Keys stay in pi process memory only. They are never written to disk, logs, notifications, or test fixtures (tests use fake keys).
- The child process gets no shell, and its arguments are constants.
- Key validation blocks pi's header template interpolation and `!command` execution.

### Observability Requirements
- `ctx.ui.notify(..., "warning")` on the first failed cycle for a domain, with the domain and failure kind.
- `ctx.ui.notify(..., "info")` once when a domain recovers after a failure.
- No notification for successful cycles while the domain is healthy.
- `/mcp` in a session shows the extension as the source of both servers.

### Failure Modes to Handle
| Failure | Expected behavior | Verification |
|---|---|---|
| `dd-auth` exits non-zero or times out | Keep any earlier registration, warn once, retry on the next tick | Unit test |
| Output has fewer than two lines or keys fail validation | Same as above; do not register | Unit test |
| Prod fails, staging succeeds | Staging registers; prod warns | Unit test |
| Interval fires while a cycle runs | Skip the tick; no parallel `dd-auth` calls | Unit test |
| Session shuts down | Interval cleared; later ticks do nothing | Unit test |
| `tool_search` before the first registration | Datadog tools are absent until registration finishes | Accepted; documented |

### Rollout and Rollback
- **Rollout:** apply the source change on the work machine. The extension and the script change land together, so `mcp.json` has no `datadog-*` entries when the extension starts.
- **Rollback:** revert the commit and run `chezmoi apply`. The script reruns and adds the `!dd-auth` `mcp.json` entries again; `exact_extensions` removes the extension.
- **Owner:** Matteo.

### Test Strategy
- Test through the exported core API with a fake `ExtensionAPI` (records `registerMcpServer` calls and handlers), a fake `runDdAuth`, a fake `ctx.ui.notify`, and `node:test` mock timers. Mock only the child-process boundary.
- The first failing command: `cd dot_pi/agent && node --experimental-strip-types --test exact_extensions/datadog-mcp-auth/_core.test.ts`, which fails before `_core.ts` exists.
- The real `dd-auth`, the network, and the pi MCP runtime are covered by the manual check in Task 4.

## Acceptance criteria
### Requirement: Startup does not wait for `dd-auth`
The extension SHALL return from `session_start` without awaiting any `dd-auth` call.

#### Scenario: Handler returns before the fetch resolves
- GIVEN a `runDdAuth` that never resolves
- WHEN the `session_start` handler runs
- THEN the handler returns, and `registerMcpServer` has not been called

### Requirement: Both servers register with literal headers
The extension SHALL register `datadog-prod` (domain `app.datadoghq.com`) and `datadog-staging` (domain `ddstaging.datadoghq.com`) with `DD-API-KEY` and `DD-APPLICATION-KEY` headers from one `dd-auth` call per domain, run in sequence.

#### Scenario: Happy path
- GIVEN `runDdAuth` returns `"api1\napp1\n"` for each domain
- WHEN the first cycle completes
- THEN `registerMcpServer` was called once per server with the expected URL, exposure, description, and headers
- AND `runDdAuth` was never called for the second domain before the first call settled

#### Scenario: Partial failure
- GIVEN `runDdAuth` rejects for `app.datadoghq.com` and succeeds for `ddstaging.datadoghq.com`
- WHEN the cycle completes
- THEN only `datadog-staging` is registered, and one warning names `app.datadoghq.com`

#### Scenario: Invalid output
- GIVEN `runDdAuth` returns one line, or a key that contains `$` or starts with `!`
- WHEN the cycle completes
- THEN that server is not registered, and the warning does not contain the output

### Requirement: Keys refresh without needless reconnects
The extension SHALL re-run the fetch every 5 minutes, call `registerMcpServer` again only when a server's keys changed, and allow at most one cycle at a time.

#### Scenario: Unchanged keys
- GIVEN a registered server
- WHEN the interval fires and `runDdAuth` returns the same keys
- THEN `registerMcpServer` is not called again

#### Scenario: Changed keys
- GIVEN a registered server
- WHEN the interval fires and `runDdAuth` returns new keys
- THEN `registerMcpServer` is called again with the new headers

#### Scenario: Overlapping tick
- GIVEN a cycle that is still running
- WHEN the interval fires
- THEN no new `runDdAuth` call starts

### Requirement: Failures are visible once, and recovery is announced
The extension SHALL warn on the first failure of a domain, stay quiet on repeated failures, and send one info notification when that domain recovers.

#### Scenario: Fail, fail, recover
- GIVEN three cycles where prod fails, fails, then succeeds
- WHEN they complete
- THEN `notify` received exactly one warning and one info for prod, and the last good registration was kept during the failures

### Requirement: Shutdown stops refresh
The extension SHALL clear the interval on `session_shutdown`, and a second shutdown SHALL be harmless.

#### Scenario: Shutdown
- GIVEN a started session
- WHEN `session_shutdown` runs twice and mock time advances 10 minutes
- THEN `runDdAuth` is not called again

#### Scenario: In-flight fetch during shutdown
- GIVEN an in-flight fetch cycle
- WHEN `session_shutdown` runs before the fetch settles
- THEN `registerMcpServer` is not called when the fetch completes

### Requirement: The `mcp.json` entries no longer override the extension
The work profile SHALL NOT register `datadog-prod` or `datadog-staging` through `pi mcp add`, and the extension SHALL exist only in the work profile.

#### Scenario: Rendered config
- GIVEN the source change
- WHEN the script and `.chezmoiignore` are rendered for `work` and `personal`
- THEN both profiles run `pi mcp remove` for both servers, and only the personal `.chezmoiignore` lists `.pi/agent/extensions/datadog-mcp-auth`

## Tasks
### Slice 1: No startup freeze, servers register in the background
#### Task 1: Async registration core and entry point
**Delivers:** The extension registers both servers after `session_start` without blocking, with validation and once-only warnings.
**Blocked by:** None
**Traces to:** Requirements "Startup does not wait", "Both servers register", "Failures are visible once"
**Files:** `dot_pi/agent/exact_extensions/datadog-mcp-auth/_core.ts`, `dot_pi/agent/exact_extensions/datadog-mcp-auth/_core.test.ts`, `dot_pi/agent/exact_extensions/datadog-mcp-auth/index.ts`, `dot_pi/agent/package.json`

- [x] Run `npm ci --ignore-scripts` in `dot_pi/agent`.
- [x] Write `_core.test.ts` for the startup, happy path, partial failure, invalid output, and fail-fail-recover scenarios; run `cd dot_pi/agent && node --experimental-strip-types --test exact_extensions/datadog-mcp-auth/_core.test.ts`; expect failure because `_core.ts` is missing.
- [x] Implement `_core.ts` and `index.ts`. `index.ts` runs `execFile("dd-auth", ["--domain", domain, "--", "printenv", "DD_API_KEY", "DD_APP_KEY"], { timeout: 60_000, env: { ...process.env, DD_EXPERIMENTS_NOOP: "true" } })` with `stdin` ignored.
- [x] Add `"$ext"/datadog-mcp-auth/*.test.ts` to `test:unit` in `dot_pi/agent/package.json`.
- [x] Run the focused test (`cd dot_pi/agent && node --experimental-strip-types --test exact_extensions/datadog-mcp-auth/_core.test.ts`); expect all scenarios to pass. Run `lsp_diagnostics` on the new files.
- [x] Commit with `feat(pi): register Datadog MCP servers with async dd-auth`.

**Execution note:** The worktree's Pi devDependency is 0.80.6 and does not type `registerMcpServer`; the installed runtime is 1.0.4 and its API types confirm registration and same-name replacement. The extension uses a narrow type assertion rather than changing the planned devDependency. One initial focused test run exposed a fixture that returned malformed output for both domains; the fixture now fails only production and confirms staging still registers.

#### Task 2: Remove the blocking `mcp.json` entries and gate the extension
**Delivers:** No `!dd-auth` header commands remain in `mcp.json`, and personal machines do not get the extension.
**Blocked by:** 1
**Traces to:** Requirement "The `mcp.json` entries no longer override the extension"
**Files:** `run_onchange_pi-mcp-servers.sh.tmpl`, `.chezmoiignore`

- [x] In the work branch of the script, replace the two `pi mcp add datadog-*` commands with `pi mcp remove datadog-prod >/dev/null 2>&1 || true` and the same for staging. Remove the now-unused `DD_MCP_URL` constant.
- [x] Add `.pi/agent/extensions/datadog-mcp-auth` to the personal block of `.chezmoiignore`.
- [x] Run `chezmoi --source "$PWD" execute-template < run_onchange_pi-mcp-servers.sh.tmpl` and the same with `--override-data '{"profile":"personal"}'`; expect `pi mcp remove datadog-prod` and `pi mcp remove datadog-staging` in both outputs and no `dd-auth`.
- [x] Run `chezmoi --source "$PWD" --override-data '{"profile":"personal"}' execute-template < .chezmoiignore`; expect `.pi/agent/extensions/datadog-mcp-auth`. Run it without the override; expect the path to be absent.
- [x] Run `bash -n` on the rendered work script; expect no syntax errors.
- [x] Commit with `feat(pi): drop dd-auth header commands from Datadog MCP entries`.

**Execution note:** `origin/main` advanced by one non-overlapping commit during implementation. The feature branch was rebased onto the updated `origin/main` before review preparation.

### Slice 2: Long sessions keep valid keys
#### Task 3: Interval refresh with change detection and shutdown cleanup
**Delivers:** Keys refresh every 5 minutes, servers reconnect only when keys change, and shutdown stops the refresh.
**Blocked by:** 1
**Traces to:** Requirements "Keys refresh without needless reconnects", "Shutdown stops refresh"
**Files:** `dot_pi/agent/exact_extensions/datadog-mcp-auth/_core.ts`, `dot_pi/agent/exact_extensions/datadog-mcp-auth/_core.test.ts`, `dot_pi/agent/exact_extensions/datadog-mcp-auth/index.ts`

- [x] Add tests for unchanged keys, changed keys, overlapping tick, double shutdown, and in-flight fetch discarded on shutdown with `node:test` mock timers; run the focused test (`cd dot_pi/agent && node --experimental-strip-types --test exact_extensions/datadog-mcp-auth/_core.test.ts`); expect the new tests to fail.
- [x] Implement the `unref`'d 5-minute interval, the single-cycle guard, change detection, in-flight shutdown guard, and the idempotent `session_shutdown` handler.
- [x] Run the focused test (`cd dot_pi/agent && node --experimental-strip-types --test exact_extensions/datadog-mcp-auth/_core.test.ts`); expect all scenarios to pass.
- [x] Commit with `feat(pi): refresh Datadog MCP keys in the background`.

**Execution note:** Tests also verify that repeated failures keep the last successful registration and that recovery re-registers only when keys changed. Continued in open draft PR #101 because no human review had started and Slice 2 extends the same async-auth behavior.

### Slice 3: Guidance
#### Task 4: Documentation and end-to-end check
**Delivers:** Guidance describes extension-based auth, and a real pi start confirms the goal.
**Blocked by:** 2, 3
**Traces to:** Goal; documentation requirement for Medium plans
**Files:** `AGENTS.md`, `dot_pi/agent/exact_skills_work/datadog-mcp/SKILL.md`

- [ ] Update the `AGENTS.md` "Pi MCP" section: the `datadog-*` servers come from `exact_extensions/datadog-mcp-auth/`, not `mcp.json`, so `pi mcp list` does not show them; use `/mcp` in a session.
- [ ] Update `datadog-mcp/SKILL.md` lines about `dd-auth` header commands to say the extension fetches keys in the background and the tools appear a few seconds after startup.
- [ ] Run `npm test` and `npm run test:all` in `dot_pi/agent`; expect success and no `[Extension issues]`. Then remove `dot_pi/agent/node_modules`.
- [ ] Manual check after `chezmoi apply`: `jq 'keys' ~/.pi/agent/mcp.json` shows no `datadog-*` entries. Start `pi`; expect the prompt to accept input at once and no MCP warning. After about 10s, `/mcp` shows both servers connected, and `tool_search` for "datadog metrics" returns `mcp__datadog_prod` tools. Automation is impractical because it needs real SSO credentials and the pi TUI.
- [ ] Commit with `docs(pi): describe async Datadog MCP auth`.

## Final verification
- Feature-level: pi startup does not block, both servers connect in the background, and keys refresh during a long session. Tasks 1–3 cover these with unit tests, and Task 4 confirms them on a real pi start.

## Learning candidates
None yet.
