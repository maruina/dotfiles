# Jira Issue Links Implementation Plan
> Steps use checkbox (`- [ ]`) syntax for tracking.
**Goal:** Add a standalone `jira_link` tool that creates Jira `Blocks` and `Duplicate` links between two existing issues in either direction.
**Smallest user-feedback slice:** Call `jira_link` for two existing issues using either supported relationship and verify the Jira request and returned outcome.
**Out of Scope:** Links during `jira_create`, bulk linking, link types other than `Blocks` and `Duplicate`, unlinking, and reading issue links.
**Architecture:** Register a standalone Pi tool with a narrow internal registrar. Map the selected relationship and direction to Jira REST API v2’s `Blocks` or `Duplicate` link type and call the existing `jiraRequest` client. Keep the extension entry point stable and inject the request function only at the registrar boundary for deterministic tests.
**Tech Stack:** TypeScript, Pi `ExtensionAPI`, TypeBox, Jira REST API v2, Node test runner, chezmoi source.
---
## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | The planning prompt requires matching skill discovery | Identified the applicable planning, codebase, and repository guidance. |
| `resolve-worktree` | `prompt-required` | The prompt requires searching all worktrees for a design | Searched the worktrees; no Jira issue-link design matched, so the request is the source of truth. |
| `learning-lookup` | `prompt-required` | Required before planning decisions | Searched `Datadog/Learnings.md` for Jira, issue-link, and MCP-tool guidance; no sections matched. |
| `obsidian-cli` | `agent-selected` | Needed to read the learning store | Read `Datadog/Learnings.md` through the Obsidian CLI. |
| `codebase-research` | `skill-loader` | The Jira extension is an unfamiliar code area | Traced tool registration, request handling, tests, and existing patterns. |
| `chezmoi` | `skill-loader` | The plan and implementation belong to the chezmoi source repository | Applied source-only, worktree, and completion guidance. |
| `write` | `skill-loader` | The durable plan is human-readable documentation | Applied concise, direct prose guidance. |
| `feature-worktree` | `prompt-required` | Durable plans must be written in a feature worktree | Created a clean feature worktree from the latest `origin/main`; left the base checkout and its unrelated untracked content unchanged. |

### Execution
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `resolve-worktree` | `prompt-required` | The execution prompt requires resolving the plan path | Resolved the plan to this worktree and confirmed its root and branch. |
| `feature-worktree` | `prompt-required` | The execution prompt requires a feature worktree before edits | Confirmed this is the correct feature worktree; no switch or creation was needed. |
| `skill-loader` | `prompt-required` | The execution prompt requires execution-stage skill discovery | Selected the applicable codebase, chezmoi, and writing guidance before editing. |
| `codebase-research` | `skill-loader` | The Jira extension is unfamiliar behavior-bearing code | Mapped the Jira entry point, request client, write helpers, tests, and current registration pattern. |
| `chezmoi` | `skill-loader` | The implementation changes chezmoi source files | Confirmed source-only edits, npm verification, and apply requirements. |
| `write` | `skill-loader` | The plan and any prompt guidance are durable prose | Applied concise, direct wording guidance. |
| `reviewable-pr-workflow` | `prompt-required` | The execution prompt requires a stack-split check before PR creation | Confirmed the change is one Jira extension feature and does not need a stack. |

## Source of truth and confirmed decisions
- Matteo confirmed a standalone `jira_link` tool rather than adding link fields to `jira_create`.
- The tool accepts one link per call with `key` (primary issue), `linkedIssueKey`, and `linkType` (`blocks`, `is blocked by`, `duplicates`, or `is duplicated by`). The relationship is from the primary issue’s perspective.
- `blocks` and `duplicates` make the primary issue `outwardIssue`; `is blocked by` and `is duplicated by` make the linked issue `outwardIssue`. The API type names are `Blocks` and `Duplicate`, respectively.
- Matteo approved adding both duplicate directions to the existing PR. Jira Cloud documents the built-in `Duplicate` type with outward label `Duplicates` and inward label `Duplicated by`; the configured Jira instance must expose that link type.
- On success, return JSON fields `key`, `linkedIssueKey`, `linkType`, and `url`. Reject identical issue keys before making a request.
- Jira REST API v2 documents `POST /rest/api/2/issueLink` with `inwardIssue`, `outwardIssue`, and `type`. The endpoint returns an empty successful response. Jira documents duplicate link requests as successful without creating a duplicate link.
- Advisory learning lookup matched no sections. TypeScript LSP initially failed because the workspace dependencies were absent; `npm ci --ignore-scripts` enabled diagnostics, which reported one unchanged baseline error in `jira_create`.

## Implementation Contract
**Components Affected:**
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Jira tool registration | `dot_pi/agent/exact_extensions/jira/index.ts`, `dot_pi/agent/exact_extensions/jira/_link.ts` | Register and describe `jira_link`; keep the default extension signature unchanged; accept an injectable request function in the internal registrar | Capture the registered tool using a fake `ExtensionAPI`; invoke it with a stub request function |
| Jira link request mapping | `dot_pi/agent/exact_extensions/jira/_write.ts` | Build the request body and map the selected relationship and link type to inward/outward issue keys | Unit assertions for all four directions and both API type names |
| Jira link tests | `dot_pi/agent/exact_extensions/jira/_link.test.ts` | Verify registration, schema, request path/body, success result, validation, cancellation signal, and API failure | Focused Node test and the `dot_pi/agent` test suites |

**Feasibility:**
| Requirement | Mechanism | Evidence it exists | Validation | If unavailable |
|---|---|---|---|---|
| Expose a standalone Jira tool | Pi `registerTool` with a TypeBox schema | `jira/index.ts` registers `jira_issue`, `jira_search`, `jira_create`, and `jira_update` this way | Test registration and inspect the registered schema | Stop if the Pi registration contract has changed; do not substitute a different interface without approval |
| Create a directional issue link | Existing `jiraRequest` client calling Jira REST API v2 `POST /issueLink` | `_client.ts` supports POST requests and empty responses; [Atlassian issue-link API](https://developer.atlassian.com/cloud/jira/platform/rest/v2/api-group-issue-links/) documents the endpoint and payload; [issue-link types](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-link-types/) documents `Duplicate` direction labels | Stub the request at the registrar boundary and assert method, path, type name, inward/outward keys, signal, and returned tool result | Stop if the endpoint or payload is unsupported. Jira errors propagate if the configured instance does not expose `Duplicate`. |
| Validate behavior without mutating live Jira | Internal request-function injection at the `jira_link` registrar | Existing `_write.test.ts` tests pure request-body helpers; the new tool registrar can accept a fake request function without changing the public extension entry point | Invoke the registered tool with a fake requester and assert calls and errors | Add only this narrow internal seam; do not require live Jira credentials or create test links in a real project |

**Key Decisions:**
- Use a separate tool because link creation is an independent Jira relationship operation. This supports any pair of existing issues, including an issue just returned by `jira_create`, without coupling link success to issue creation.
- Accept one link per call. This keeps the operation bounded and makes each relationship and failure independently observable.
- Use required `key` and `linkedIssueKey` string parameters and a `linkType` enum limited to `blocks`, `is blocked by`, `duplicates`, and `is duplicated by`. Map only to Jira `Blocks` and `Duplicate`; reject identical issue keys before making a request.
- Preserve the public `jiraExtension(pi)` signature. Inject the request function only into the internal link-tool registrar so tests do not read credentials or call Jira.
- Return JSON fields `key`, `linkedIssueKey`, `linkType`, and `url` after Jira reports success. Jira’s successful response has no body.
- Do not pre-read links or retry. Jira documents duplicate creation requests as successful without creating a duplicate; other Jira errors propagate through the existing client.

**Implementation Constraints:**
- Edit chezmoi source files only; do not edit rendered files under `$HOME`.
- Keep the tool’s `AbortSignal` on the API call. Add no retries, polling, or fan-out.
- Keep credential handling in `_client.ts` unchanged. Do not log or return credentials or raw API response bodies.
- The new registrar is internal; do not change existing tools or their behavior.
- Before `/verify`, run `npm ci --ignore-scripts` in `dot_pi/agent`. Keep dependencies until `npm test` and `npm run test:all` pass, then remove `dot_pi/agent/node_modules`.

**Security Requirements:** Use the existing 1Password-backed Jira client and its authenticated account. Add no secrets, new credential sources, or logging of request headers. Jira remains responsible for project permissions and issue access.

**Observability Requirements:** Add no metrics or logs. Tool success returns the requested relationship; Jira request failures remain visible through the existing `jiraRequest` error.

**Failure Modes to Handle:**
| Failure | Expected behavior | Verification |
|---|---|---|
| Primary and linked keys identify the same issue | Reject before making a Jira request | Tool test asserts rejection and zero requester calls |
| A caller supplies a relationship outside the four supported values | TypeBox schema rejects it | Assert the registered schema exposes only `blocks`, `is blocked by`, `duplicates`, and `is duplicated by` |
| Jira rejects duplicate linking because `Duplicate` is unavailable or disallowed | Propagate the Jira client error without retrying | Stub requester rejection and assert tool execution rejects |
| Jira rejects the request, including permission or missing-issue errors | Propagate the client error; do not return a success result or retry | Stub requester rejection and assert tool execution rejects |
| Caller cancels the operation | Pass the provided `AbortSignal` to `jiraRequest` | Assert the stub receives the same signal |
| Jira returns an empty success body | Return the compact relationship result from the tool inputs | Stub a successful `null` result and assert returned content/details |

**Rollout and Rollback:** Apply the chezmoi source change on Matteo’s machine after review. Roll back by reverting the implementation commit and applying the source again. Owner: Matteo Ruina.

**Test Strategy:**
| Requirement or scenario | Highest deterministic interface | Test seam and boundaries |
|---|---|---|
| Tool registration and allowed relationship values | Registered Pi tool schema | Fake `ExtensionAPI`; inspect the TypeBox schema |
| `blocks`, `is blocked by`, `duplicates`, and `is duplicated by` payload directions | Registered tool `execute` function | Internal registrar receives a stub request function; assert `POST /rest/api/2/issueLink`, Jira type name, and exact inward/outward fields |
| Self-link rejection | Registered tool `execute` function | Fake requester; assert no request occurs |
| Successful empty response | Registered tool `execute` function | Stub the Jira boundary to return `null`; assert compact success result |
| Jira API rejection and cancellation | Registered tool `execute` function | Stub the Jira boundary to reject or capture the same `AbortSignal` |
| Full Pi agent regression | `npm test` and `npm run test:all` in `dot_pi/agent` | Existing test scripts include `exact_extensions/jira/*.test.ts` |

## Acceptance Criteria
### Requirement: Create a Jira link in either supported direction
The system SHALL expose a standalone `jira_link` tool that creates one `Blocks` or `Duplicate` link between two distinct issue keys, using the direction selected by the caller.
#### Scenario: Primary issue blocks linked issue
- GIVEN two distinct existing issue keys
- WHEN `jira_link` is called with `linkType` set to `blocks`
- THEN the tool sends `POST /rest/api/2/issueLink` with the primary issue as `outwardIssue`, the linked issue as `inwardIssue`, and type name `Blocks`
- AND the tool returns JSON fields `key`, `linkedIssueKey`, `linkType`, and `url` with the requested values
#### Scenario: Primary issue is blocked by linked issue
- GIVEN two distinct existing issue keys
- WHEN `jira_link` is called with `linkType` set to `is blocked by`
- THEN the tool sends `POST /rest/api/2/issueLink` with the linked issue as `outwardIssue`, the primary issue as `inwardIssue`, and type name `Blocks`
- AND the tool returns JSON fields `key`, `linkedIssueKey`, `linkType`, and `url` with the requested values

### Requirement: Create a duplicate relationship in either direction
The system SHALL create a Jira `Duplicate` relationship in the direction selected from the primary issue’s perspective.
#### Scenario: Primary issue duplicates linked issue
- GIVEN two distinct existing issue keys
- WHEN `jira_link` is called with `linkType` set to `duplicates`
- THEN the tool sends `POST /rest/api/2/issueLink` with type name `Duplicate`, the primary issue as `outwardIssue`, and the linked issue as `inwardIssue`
- AND the tool returns JSON fields `key`, `linkedIssueKey`, `linkType`, and `url` with the requested values
#### Scenario: Primary issue is duplicated by linked issue
- GIVEN two distinct existing issue keys
- WHEN `jira_link` is called with `linkType` set to `is duplicated by`
- THEN the tool sends `POST /rest/api/2/issueLink` with type name `Duplicate`, the linked issue as `outwardIssue`, and the primary issue as `inwardIssue`
- AND the tool returns JSON fields `key`, `linkedIssueKey`, `linkType`, and `url` with the requested values

### Requirement: Reject invalid link requests before mutation
The system SHALL reject a self-link before making a Jira request and SHALL expose only the four supported relationship values.
#### Scenario: Link an issue to itself
- GIVEN the primary and linked issue keys identify the same issue
- WHEN the tool executes
- THEN it returns an input error and makes no Jira request
#### Scenario: Unsupported relationship
- GIVEN a caller supplies a value other than `blocks`, `is blocked by`, `duplicates`, or `is duplicated by`
- WHEN Pi validates the tool parameters
- THEN the value fails the registered schema and no Jira request occurs

### Requirement: Surface Jira request failures
The system SHALL propagate Jira request failures and SHALL NOT report a successful link when Jira rejects the request.
#### Scenario: Jira rejects link creation
- GIVEN Jira’s request function returns an error
- WHEN the tool executes
- THEN execution reports that error and does not return a success result or retry

## Execution Plan
### Slice 1: Create Jira issue links
Delivers a standalone tool that links two existing issues in either requested direction and gives the caller an observable result.
#### Task 1: Add `jira_link` with deterministic request tests
**Execution status:** Complete; focused and full-suite tests passed.
**Delivers:** The extension registers a tested `jira_link` tool for the two supported directions.
**Blocked by:** None
**Traces to:** Goal; Requirements: Create a Jira link in either supported direction, Reject invalid link requests before mutation, Surface Jira request failures.
**Files:** `dot_pi/agent/exact_extensions/jira/index.ts`; `dot_pi/agent/exact_extensions/jira/_link.ts`; `dot_pi/agent/exact_extensions/jira/_write.ts`; `dot_pi/agent/exact_extensions/jira/_link.test.ts`
- [x] Run `cd dot_pi/agent && npm ci --ignore-scripts` to install the test dependencies.
- [x] Add focused failing tests for registration/schema, both direction mappings, self-link rejection, successful empty response, API failure, and signal propagation.
- [x] Run `cd dot_pi/agent && node --experimental-strip-types --test exact_extensions/jira/_link.test.ts`; expect the new behavior assertions to fail before implementation.
- [x] Add the internal registrar, TypeBox tool contract, request-body mapping, and compact success result. Keep `jiraExtension(pi)` unchanged and wire the default Jira request function from `index.ts`.
- [x] Add tool descriptions and prompt guidance that identify when to use `jira_link` and explain the two directions.
- [x] Rerun `cd dot_pi/agent && node --experimental-strip-types --test exact_extensions/jira/_link.test.ts`; expect all focused tests to pass.
- [x] Refactor only after green; rerun the focused test. No refactor was needed; the passing focused test is the final check.
- [x] Commit with `feat(pi): add Jira issue link tool` when implementation is approved.

**Execution notes:** LSP diagnostics found an existing error at `index.ts` in `jira_create` (`unknown` passed to `trimCreateResult`); the unchanged code is present in the committed baseline. After dependencies were reinstalled, LSP also reported package-resolution errors in both unchanged and changed Jira files; the project-local TypeScript compiler resolved dependencies and reported only the same baseline error. `chezmoi diff` shows only the planned Jira extension files; no target files were applied because the rollout plan requires review first.
#### Task 3: Support duplicate issue links
**Execution status:** Complete.
**Delivers:** `jira_link` creates Jira `Duplicate` links in either direction while preserving the existing `Blocks` behavior.
**Blocked by:** Task 1
**Traces to:** Requirement: Create a duplicate relationship in either direction; Requirements: Reject invalid link requests before mutation, Surface Jira request failures.
**Files:** `dot_pi/agent/exact_extensions/jira/_link.ts`; `dot_pi/agent/exact_extensions/jira/_write.ts`; `dot_pi/agent/exact_extensions/jira/_link.test.ts`; `plans/jira-issue-links/plan.md`
- [x] Add failing tests for the four-value schema and both `Duplicate` directions, including type name, inward/outward keys, returned fields, and signal propagation.
- [x] Run `cd dot_pi/agent && node --experimental-strip-types --test exact_extensions/jira/_link.test.ts`; the new schema and duplicate-direction assertions failed before implementation.
- [x] Extend the relationship mapping and tool description/prompt guidance to support `duplicates` and `is duplicated by`, mapping them to Jira type name `Duplicate`; keep the existing `Blocks` mappings unchanged.
- [x] Rerun `cd dot_pi/agent && node --experimental-strip-types --test exact_extensions/jira/_link.test.ts`; all seven tests passed.
- [x] Run `cd dot_pi/agent && npm test` and `cd dot_pi/agent && npm run test:all`; both suites passed.
- [x] Update the open PR body to describe `Duplicate` support and refresh review links; do not post another `@codex review` trigger. Updated PR #99; retained the single existing review trigger.
- [x] Commit with `feat(pi): support duplicate Jira links`.

#### Task 2: Review documentation and future-agent guidance
**Delivers:** User-facing tool guidance is complete, and repository guidance reflects any durable new command or workflow.
**Blocked by:** Task 1
**Traces to:** Explicit planning requirement to review documentation and relevant `AGENTS.md` guidance.
**Files:** `dot_pi/agent/AGENTS.md`
- [x] Review whether the new tool adds a durable command, setup step, source-of-truth rule, testing trap, or rollout procedure that belongs in `AGENTS.md`.
- [x] Update `dot_pi/agent/AGENTS.md` only if such durable guidance is required; otherwise record that the tool’s schema and prompt guidance are sufficient and no agent-guidance change is needed. The registered tool description and prompt guidance are sufficient; no AGENTS.md change is needed.
- [x] Confirm no docs or guidance outside the Jira extension require updates; the repository has no Jira-extension README.
- [x] Run `cd dot_pi/agent && npm test` and `cd dot_pi/agent && npm run test:all`; both suites passed.
- [x] Remove `dot_pi/agent/node_modules` after both suites pass, as required by `dot_pi/agent/AGENTS.md`. Dependencies were removed after the suites passed, then reinstalled for `/verify` preparation.
- [x] Commit any required documentation change with a Conventional Commit message; do not create an empty commit. No separate guidance change was required.
### Final verification
- [x] Before `/verify`, run `cd dot_pi/agent && npm ci --ignore-scripts`; dependencies are installed and must remain until verification completes.
- [ ] During `/verify`, run `cd dot_pi/agent && npm test` and `cd dot_pi/agent && npm run test:all`, then remove dependencies after both pass.
- [x] Confirm all acceptance scenarios, including both `Duplicate` directions, pass through the registered tool with the fake Jira boundary; no live Jira writes were performed.
