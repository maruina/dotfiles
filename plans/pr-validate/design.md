# `/pr-validate` delegated PR review design
## Summary
Add a read-only pi `/pr-validate <GitHub PR URL> [context]` prompt. It reviews someone else's PR on the user's behalf and returns one verdict: **Approve**, **Ask**, or **Request changes**. Each item names the problem, the location, why it matters, and the evidence, so the user can write their own GitHub comment without reading the diff. Separately, the command lists up to five **attention items**: decisions that belong to the reviewer, each with enough inline context that the user does not need to search the diff. The user's attention is the scarce resource, so every item carries the evidence needed to decide it. Existing review threads, from humans and from review agents, are claims that the command confirms or refutes. This supports two more questions within the same full verdict: "do these agent comments apply?" and "were my comments addressed?"

`/pr-validate` is the delegated review mode. The existing `/pr-review` stays unchanged. A later design will turn `/pr-review` into a guided review mode, in which the agent asks the user questions about the code in a logical order.

## Alignment brief
Problem:
Reviewing large PRs takes more time than the reviewer can give. The reference case is `ddoghq/dd-source#103728`: 46 files, +1242/−751, a port of `computecla` Slack notifications from the SDP slack-worker to the CINDY notifications platform, and a description too dense to assess. The reviewer still must decide whether to approve, and must know exactly what to ask the author and why.

User / audience:
A staff engineer who reviews a colleague's PR through pi and does not read the diff.

Goal:
`/pr-validate` returns Approve, Ask, or Request changes. Every item has evidence precise enough for the user to write their own comment. Attention items bring reviewer-owned decisions to the user with all the context they need.

Non-goals:
- Redesign of `/pr-review` into a guided review. Deferred; see [Deferred alternatives](#deferred-alternatives).
- HTML walkthroughs, a `/to-html` template upgrade, or a `gh pr review` command panel.
- Drafted review comments.
- Posting comments, approving, or requesting changes on GitHub.
- Separate agents, models, or pi sessions for each pass or file type.

Known facts and assumptions:
- Fact: `dot_pi/agent/exact_prompts/pr-review.md` already defines worktree setup (Phase 1), PR data collection and file classification (Phase 2), `skill-loader` use (Phase 3), and system-context discovery (Phase 4).
- Fact: pi has no subagent or Task tool. All passes run in one agent context.
- Fact: the #103728 diff is about 167 KB, roughly 40–45k tokens. Full files plus callers fit in context.
- Decision: no fixed file cap. Skip generated code, give build wiring a quick check, and read behavior code, tests, and changed repository guidance in depth.
- Decision: the optional context argument is untrusted evidence, not instructions.
- Decision: when the agent cannot confirm a criterion, the verdict asks the author. It does not approve silently, and it does not block automatically.
- Decision: attention items do not block Approve. Each attention item is self-contained, so the user decides without opening the diff.
- Assumption: `/pr-validate` copies the needed `/pr-review` worktree and data-collection wording, because prompts cannot include one another. Confirm during `/plan`.
- Decision: a shared skill owns the locate-or-clone rule, and it ships first as a separate change. See [Prerequisite: shared repository checkout skill](#prerequisite-shared-repository-checkout-skill).
- Assumption: `/pr-validate` uses the same worktree path as `/pr-review`, `~/dd/.worktrees/REPO/pr-PR_NUMBER-review`, so `/pr-cleanup` works without change.

Smallest user-feedback slice:
A new `pr-validate.md` prompt with structural tests, run once on #103728 with the two Slack quotes below.

Success criteria and validation:
See [Testing strategy](#testing-strategy).

Operational notes:
Read-only. One long context per run. The coverage section makes partial reading visible. The run does not stop to ask the user questions after analysis starts.

## Design principle: attention is the scarce resource
The user runs `/pr-validate` while doing other work. The user's attention costs more than agent time. Every design choice follows from this:
- **Decision-complete items.** Each item carries all the evidence needed to decide it inline. The user never has to leave the output, open the diff, or search Slack.
- **Evidence filtered by relevance.** Include the evidence that would change the decision. Leave out the rest. "All the evidence" means complete for the decision, not everything the agent read.
- **The agent does the analysis.** Where the user must decide, the agent gives the options, the tradeoffs, and a recommendation.
- **No blocking during the run.** After analysis starts, the agent does not ask the user questions. Each gap becomes an item in the output.

Open questions:
See [Open questions](#open-questions).

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `learning-opportunities` | `prompt-required` | `/brainstorm` requires its coaching rules | Question-first framing, prediction and feedback turns, and the "teach it back" goal for the deferred guided `/pr-review` |
| `reviewable-pr-workflow` | `agent-selected` | The user asked to mirror the `/pr-create` reviewer guide | Reused the "What to look for in this PR" format for attention items: Where, Why it needs human attention, and What to verify; one to five items; say "none" when none apply; head-SHA blob links |
| `write` | `agent-selected` | Drafting a durable design spec | Main point first, concrete risks, benefits stated for rejected alternatives, no time-bound labels |

`skill-loader` was not used. This design changes a Markdown prompt and a `node:test` file. No language or domain skill applied.

Advisory learnings: `Datadog/Learnings.md` returned no sections that match `html`, `to-html`, `mermaid`, `walkthrough`, `playground`, `pr-review`, or `skill`. No learning guidance was used.

## Context reviewed
- `plans/html-walkthrough/brainstorm-input.md` (untracked seed on `main`): the original request for interactive HTML walkthroughs and the prior art.
- `dot_pi/agent/exact_prompts/pr-review.md`: the current review phases, the verdict values, and the suggested-comment section.
- `git show d318ca1^:dot_claude/exact_commands/pr-review.md`, Phase 8: the retired HTML walkthrough spec.
- `plans/to-html/design.md`: the `/to-html` goals and non-goals, including the removal of `/pr-review` HTML artifacts.
- `dot_pi/agent/exact_prompts/troubleshoot.md`: the evidence and assertion policy and the hypothesis ledger.
- `dot_pi/agent/exact_skills/show-me/SKILL.md`: an existing agent-authored HTML path.
- `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`: the prompt assertion pattern.
- References to `/pr-review` in `verify.md`, `systematic-review.md`, `pr-address-feedback.md`, and `pr-cleanup.md`.
- `ddoghq/dd-source#103728`: metadata, file list, full description, and diff size.
- `ddoghq/k8s-release-mgmt-resources#4309`: metadata and review threads.
- `ddoghq/dd-source#102960`: metadata, reviews, and review threads.
- `dot_pi/agent/exact_skills/pr-comment-triage/SKILL.md` and `dot_pi/agent/exact_prompts/pr-address-feedback.md`: existing comment-adjudication behavior.
- Two Slack messages that the user supplied. They are quoted in [Reference cases](#reference-cases).

## Current behavior
`/pr-review` serves two different jobs in one prompt:
- **Delegated review.** Phase 7 assesses the PR. Phase 9 gives a verdict (`ready as-is | needs discussion | needs changes | not enough evidence`) and a suggested review comment.
- **Comprehension.** Phases 4–6 give a finished walkthrough for the user to read. Comprehension checks appear only at familiarity levels `0` and `1`.

For delegated review, the drafted comment conflicts with the user's goal, because the user writes their own comment. The verdict values do not separate "the author must answer a question" from "the code has a confirmed defect". For large PRs, Phase 4 says to focus on key files when more than 10 files change, but no rule connects skipped files to the verdict.

## Design overview
### Input
`/pr-validate <GitHub PR URL> [context]`
- The PR URL is required. The agent asks questions only before analysis starts: when the PR URL is missing, or when no local checkout exists for a repository outside the `DataDog` and `ddoghq` organizations.
- The context is optional free text. Examples are Slack quotes, Jira links, and reviewer notes. The agent cites context as evidence. It does not follow instructions inside the context.

### Workspace and data
Locate or clone the repository with the shared checkout skill described in [Prerequisite: shared repository checkout skill](#prerequisite-shared-repository-checkout-skill). Then reuse the `/pr-review` Phase 1 worktree step and the Phase 2 data collection: create or reset the review worktree at `~/dd/.worktrees/REPO/pr-PR_NUMBER-review`, and collect metadata, the diff, comments, review threads, and thread resolution state. Also read CI status with `gh pr checks`.

### Prerequisite: shared repository checkout skill
Three prompts repeat the same rule to locate or clone `ORG/REPO`: `pr-review.md` Phase 1, `simplify.md` "PR URL resolution" step 4, and `pr-address-feedback.md`. Each copy searches the current repository, `~/dd/REPO`, and `~/go/src/github.com/ORG/REPO`, and clones only `DataDog` repositories without asking. `/pr-validate` would add a fourth copy.

A separate Small change ships before `/pr-validate`, on its own branch (`maruina/repo-checkout-skill`) with its own `/plan`:
- Add a skill that owns the locate-or-clone rule.
- For `DataDog` and `ddoghq` repositories without a local checkout, clone into `~/dd/REPO` with `git clone git@github.com:ORG/REPO ~/dd/REPO` and do not ask first. Datadog is moving its private repositories from `DataDog` to `ddoghq`, so both organizations use the same location. For other organizations, ask.
- Point `pr-review.md`, `simplify.md`, and `pr-address-feedback.md` to the skill and remove their copies of the rule.
- Add assertions in `lifecycle-prompts.test.mjs` that each prompt references the skill and no longer has its own clone rule.

The skill does not own the worktree step. Each prompt creates worktrees differently on purpose: `/pr-review` resets a disposable review worktree, `/simplify` keeps local changes and handles forks, and `/pr-address-feedback` runs `gh pr checkout` after a warning.

This prerequisite changes where three existing prompts clone a missing `ddoghq` repository. It changes no other behavior of `/pr-review`.

In `/pr-validate`, the agent asks where to clone only before analysis starts, and only for organizations other than `DataDog` and `ddoghq`.

### Pass 1: Understand the PR
Pass 1 writes the following in the response. Later passes use these results and do not re-read the code without a reason.
- **System schema.** The components the PR touches, their roles, and the data and control flow.
- **PR summary.** What the PR changes, in a few sentences.
- **File classification.** Each file gets a type (generated, build wiring, behavior, test, docs or guidance, schema or API) and the passes that must read it.
  - Skip generated code.
  - Give build wiring a quick check for dependency edges.
  - Read behavior code, tests, and changed repository guidance in depth.
- **Claims ledger.** Concrete statements that later passes confirm or refute:
  - *Author claims* from the description, commits, and context. If the PR body has a reviewer guide, such as the `/pr-create` "What to look for in this PR" section, its items are author claims about where the risk is.
  - *Parity rows* when the PR ports behavior: old site, new site, and what must stay the same. An intentional behavior drop is also a row, with its stated reason.
  - *Thread claims* from review threads. Each unresolved thread is an entry, whether a human or an agent wrote it. Each thread by the user running the command is an entry, resolved or not. An author reply such as "fixed" or "this already handles it" is its own claim. Merge duplicate findings from different reviewers into one entry, and list every source thread. Record whether GitHub marks the thread outdated, but do not treat "outdated" as "fixed".

Pass 1 also runs `skill-loader` on the changed files and loads the selected skills before any judgment.

### Pass 2: Correctness and internal consistency
Confirm or refute each claims-ledger entry against the code and the tests at the PR head. Check that tests would fail if the changed behavior broke.

For thread claims, use these states:
- **Applies:** the problem exists at the PR head.
- **Does not apply:** the problem does not exist, and the evidence shows why. An example is a bot finding based on a wrong assumption.
- **Fixed:** the problem existed, and a later commit fixed it. Cite the commit.
- **Open:** the agent cannot confirm or refute it. Name the missing evidence.

For threads by the user, compare the code at the commit the user reviewed with the PR head. The review record gives that commit. A thread that still applies becomes a Request changes item. An author reply that is not confirmed becomes an Ask item.

### Pass 3: Interaction with other systems
Check the contracts with the systems at the PR boundary. Examples for #103728: CINDY request limits, the legacy slack-worker fallback, Temporal replay of in-flight workflows, and proto field compatibility.

When the PR changes deployed configuration, such as rendered Kubernetes manifests for specific clusters, a finding "applies" only if it affects those clusters. Pass 3 identifies the target clusters from the changed paths and checks whether the affected features or workloads exist there. The agent can use read-only evidence tools that loaded skills provide, such as `ddtool-cluster-datacenter-info` for cluster metadata and `datadog-mcp` or `k8s-audit-logs` for workload evidence. The agent must not change cluster state and must not refresh expired credentials. If the evidence is unavailable, the entry stays open, and the item names the missing evidence and the query that would settle it.

### Pass 4: Consistency with the codebase
Compare the change with neighboring code, repository guidance, and the loaded skills.

### Verdict criteria
| Criterion | Confirmed when |
|---|---|
| Correctness | Each claims-ledger entry is confirmed. For a port, each parity row holds or has a stated reason. |
| Meaningful tests | Tests exist for the changed behavior, and they would fail if that behavior broke. |
| Human validation provided | Behavior that code and tests cannot prove is named, and the PR or the context has evidence for it. Examples are a staging run and screenshots. |
| Why recorded | The reason for each material change is in the PR, the commits, or a linked durable document, not only in chat or Slack. |
| Fixable | Another engineer can find and fix a bug from the structure and names. |
| Best practices | No unresolved violation of repository guidance or of a loaded skill. |
| Necessity | Evidence shows why the change must exist. |

### Verdict rules
- **Approve.** Every criterion is confirmed.
- **Ask.** At least one criterion is open, and no defect is confirmed. Each Ask item gives the exact question for the author, why the answer matters, what the agent checked and did not find, and the inline evidence (code excerpt, PR text, or cited context).
- **Request changes.** At least one defect is confirmed. Each item gives what is wrong, `file:line`, a code excerpt, why it matters (the concrete failure), and the evidence that confirms it.

Before the agent adds an Ask item, it checks the existing review threads. If a thread already answers the question, the agent cites that thread.

### Attention items
An attention item is a decision that the reviewer owns and that the agent must not make. Examples are a policy or ownership choice, acceptance of tech debt, and a design tradeoff with no clearly correct answer. An attention item is not a fact the author can supply (that is an Ask item) and not a confirmed defect (that is a Request changes item).

Attention items do not change the verdict. The verdict line shows their count, for example `Approve — 1 decision needs your judgment`, so the user cannot miss them.

The format follows the reviewer-guide format of `reviewable-pr-workflow`, and it adds inline context. Each item has:
- **Where:** `file:line`, linked to the file at the PR head SHA with `#L` anchors.
- **Context:** a short code excerpt and the surrounding behavior needed to understand it, such as the caller, the data that flows in, and the current default.
- **Why it needs your judgment:** the consequence of each choice.
- **Options:** the realistic choices, with the tradeoff of each. After the options, the agent states its recommendation and the reason.
- **What to verify or decide:** the specific decision.

List one to five items, highest impact first. If no decision needs the reviewer, say so. If the author's reviewer guide missed a risk that the agent found, say that in the item.

deliberate: the five-item limit keeps delegation useful. If real runs often need more than five, the PR likely needs a split, and the verdict must say so. Do not raise the limit.

### Output
1. **Verdict.** One line with the outcome and the attention-item count.
2. **Items.** Request changes items, then Ask items. Each item is decision-complete, with its evidence inline.
3. **Needs your judgment.** The attention items, decision-complete.
4. **Your question.** When the context asks a specific question, such as "do the agent comments apply to the clusters" or "were my comments addressed", answer it directly, with one row per thread claim: source threads, the claim in one line, the state, and the inline evidence.
5. **Criteria table.** Each criterion with its state (confirmed, refuted, or open) and a one-line evidence summary, so the user can see why a confirmed criterion is trustworthy.
6. **Coverage.** Files read in depth, skimmed, and skipped, with the reason for each group.
7. **Skills loaded and used.** The standard provenance table.

Without a specific question in the context, thread claims appear only through the items and the criteria table. The run always produces the full verdict, including when the context asks a specific question.

The output has no separate evidence section. Evidence lives with the item it supports.

The output is Markdown in chat. The user can run `/to-html` on it.

## Reference cases
### Delegated review of a large port
`ddoghq/dd-source#103728`, with this context from the user.

Slack message from the author:
> This moves off of calling the shared slack-worker and onto the recommended happy path of using CINDY. No one was asking us to do this […] One neat thing this'll bring is that we can set up custom notification routing for CLA's notifications. […] One annoying thing: I haven't been able to test this part of the PR yet, because I'm not quite sure how I feel about exposing all of our notification types as routing to all of…datadog? engineering?

Slack thread about the `azure_cloudops` peering prompt:
> it was needed back when k8s-platform provisioned the vnets and we needed the peering to be created after CLA's tf apply but before we deploy stuff that would need that connectivity. with everything on network/v3 and all the networking resources created before CLA, i agree we can drop the prompt

Expected items. These are hypotheses from the description and the context, not verified against the code:
1. **Routing.** Two separate items:
   - **Ask:** the author says routing is untested, and the PR `## Summary` presents routing as a feature. The question for the author: does the PR ship collections that anyone can subscribe to, and how was routing tested?
   - **Attention:** whether CLA notification types can be routed by any Datadog engineer is a policy decision for the reviewer and the owning team. The item must include the collection and tag code inline, which notification types it exposes, and the options (ship as is, restrict, or split out).
2. **`azure_cloudops` prompt removal: Ask.** The reason exists only in Slack. The PR says "legacy processes no longer required". Ask the author to record the network/v3 reason in the PR.
3. **`//…/worker/utils:go_default_test`.** The PR `## Testing` lists this target, and the PR deletes `utils/slack.go` and removes lines from `utils/BUILD.bazel`. The run must confirm or refute that the target exists and passes.
4. **Temporal version gating.** The PR changes workflow files such as `manage_lifecycle.go` and `sync_node_image.go` and says in-flight workflows exist. The run must confirm or refute replay safety, with `atlas-best-practices` loaded through `skill-loader`.
5. **Necessity.** The run must cite evidence: the author's routing motivation and the CINDY "recommended happy path" statement.

### Agent comments on a cluster rollout
`ddoghq/k8s-release-mgmt-resources#4309`, "chore(deps): update orange-compute", with the context "do the agent comments apply to the clusters?". Renovate opened the PR. It changes 26 files of rendered manifests. Two `dd-agentic-review-platform` bots left 15 threads with P1 and P2 severity. None are resolved, and 14 are outdated.

Expected behavior:
1. Merge the duplicate findings from the two bots, for example the toleration checks and the system-namespace exclusion, and list both source threads.
2. Give each merged finding a state at the PR head. "Outdated" alone is not "Fixed".
3. For each finding that applies in the manifests, state whether it affects the target clusters, such as `us1.release.staging.dog`, with cluster evidence or a named evidence gap.
4. Address the one thread on current lines, "Confirm namespace opt-outs before upgrade" on `clusters/us1.release.staging.dog/orange.yaml`.
5. Give the full verdict.

### Re-review of the user's own comments
`ddoghq/dd-source#102960`, "computectl cla: guard re-provisioning of soft-deleted clusters", with the context "were my two comments addressed?". The user reviewed commit `a0b19ba8`.

Expected behavior:
1. `delete.go` warning thread (resolved and outdated): confirm or refute the author's claim that the phase-1 warning changed.
2. `provision.go` GovCloud RMS client thread (unresolved and outdated): confirm or refute the author's claim that provisioning uses the survey's RMS client and therefore the federal RMS. An unconfirmed claim becomes an Ask item. A refuted claim becomes a Request changes item.
3. Give the full verdict.

## Smallest user-feedback slice
Do first:
- Add `dot_pi/agent/exact_prompts/pr-validate.md` with the input, passes, criteria, verdict rules, attention items, output, and read-only gate above.
- Add structural assertions for `pr-validate.md` in `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`.

What the user sees:
- One `/pr-validate` run on #103728 with the reference context, and a verdict with evidence-backed items.

What the team learns:
- Whether an evidence-backed verdict lets the user decide without the diff.
- Whether one pi session keeps quality on a PR of this size.

Why no smaller slice produces this feedback:
- A criteria checklist without the passes and the claims ledger produces items that cannot be traced to evidence. The user then must open the diff to trust them.
- A change to `/pr-review` does not work, because `/pr-review` is reserved for the guided redesign.

Deliberately defer:
- The guided `/pr-review` redesign.
- HTML output.
- Separate agents, models, or sessions for each pass.
- A claims-ledger file in the worktree.
- Cross-references to `/pr-validate` in `verify.md`, `systematic-review.md`, and `pr-address-feedback.md`. Add them with the guided `/pr-review` redesign, when the meaning of `/pr-review` changes.

## Deferred alternatives
| Alternative | Merit | Why deferred | Revisit trigger |
|---|---|---|---|
| Guided `/pr-review`: the agent collects evidence and asks the user questions in logical story order until the user can explain the PR | Builds real understanding. The "teach it back" end state gives a clear success signal. | The user has a current use case for delegated review. The guided mode has an unresolved medium question. | `/pr-validate` lands. Then decide where the Q&A happens: pi, browser, or both. |
| Upgrade the `/to-html` template (navigation, callouts, before/after badges) | Improves every response, not only reviews, within the existing trust model | The problem is the review mode, not the page style | Real `/pr-validate` or `/pr-review` output is hard to read in the browser |
| Agent-authored interactive HTML walkthrough skill with copy-back prompts | Clickable diagrams and a round trip from the browser to the agent | Adds a second trust path and a second rendering path. `show-me` already covers focused HTML. | Guided `/pr-review` needs spatial navigation that chat cannot give |
| `gh pr review` comment panel | Fast posting | The user writes their own comments. The command is read-only. | The user asks for posting support |
| Separate agents or models for each file type or pass | A clean context for each pass, and cheaper models for mechanical checks | pi has no subagents. Adds orchestration before the need is proven. | A real run on a PR like #103728 shows quality loss from one long context |
| Separate pi session for each pass, with a file handoff | A clean context without subagents | Adds manual steps and a handoff file format | Same trigger as above |
| Extension tool for repository checkout, instead of a skill | Deterministic and unit-testable. It is also a natural place for the `gh` account switch between `matteo-ruina_ddog` and `maruina`. | Adds TypeScript to maintain for a short rule that rarely changes | Agents repeatedly get the lookup order or the `gh` account switch wrong |
| Consolidate the worktree step in the shared skill too | One place for all PR workspace setup | The prompts create worktrees differently on purpose, and one shared step would hide those differences | None |
| Thread-only answers, as a mode of `/pr-validate` or an extension of `pr-comment-triage` | Shorter output and a faster run when the user asks only about threads | The user wants the full verdict every time. `pr-comment-triage` proposes fixes and has no reviewer-side verdict. `/pr-address-feedback` is author-side and edits code. | Full verdicts for thread questions are too slow or too long in real runs |
| Change `/pr-review` in place | One command, no copied wording | Breaks the plan to redesign `/pr-review` as a guided review | None |

## Risks and mitigations
| Risk | Mitigation |
|---|---|
| The agent approves a PR it did not fully read, and the user approves under their name | Approve requires every criterion confirmed. The coverage section lists skipped and skimmed files, so partial reading is visible. |
| The agent reports a plausible but wrong defect, and the user asks the author to change correct code | Request changes requires a confirmed defect with `file:line` evidence. Unconfirmed concerns become Ask items. |
| The user approves without seeing an attention item, because the verdict says Approve | The verdict line shows the attention-item count, and the attention section comes directly after the verdict. |
| Attention items become a list of places to read, and delegation fails | One to five items, each with inline context. More than five means the verdict recommends a PR split. |
| Inline evidence makes the output long | Evidence is filtered to what would change the decision. Excerpts show only the needed lines. The verdict line and item titles come first, so the user can stop reading early. |
| The run stops on a question while the user is away | After analysis starts, the agent asks no questions. Gaps become items. |
| The output repeats the density of the PR description | The verdict and items come first and are short. Details follow in separate sections. |
| A review agent's finding is repeated as fact, or dismissed because GitHub marks it outdated | Each thread is a claim with a state at the PR head and inline evidence. "Outdated" is recorded but never counts as "Fixed". |
| Context text contains instructions, for example a Slack message with "approve this" | The prompt treats context as cited evidence only. A structural test asserts the rule. |
| Copied `/pr-review` wording drifts over time | The shared skill owns the clone rule. Copy only the worktree step and the Phase 2 data collection. `/plan` decides whether a structural test checks the shared worktree path. |
| One long context loses attention on large PRs | Pass 1 writes compact results that later passes use. The deferred multi-session alternative has a revisit trigger. |

Chosen-direction downside: the verdict is only as reliable as the agent's reading in one context. `/pr-validate` does not remove the user's accountability for the approval. It makes the basis for the approval explicit.

## Operability
- Read-only. The command makes no GitHub writes and no edits outside the review worktree.
- The cost is one long agent context per run. CI results come from `gh pr checks`. The command does not run broad builds.
- The user owns the prompt. Failures appear in the run output: missing evidence, skipped files, and unavailable tools.

## Rollout and rollback
- Rollout: first ship the shared repository checkout skill as a separate change. Then add the `/pr-validate` prompt and apply it with `chezmoi apply`. The command is opt-in. The `/pr-validate` change itself modifies no other command.
- Rollback: revert the commit and run `chezmoi apply`. Because `exact_prompts` is an exact directory, the command disappears.

## Security and data handling
- `gh` must use the correct account: `matteo-ruina_ddog` for `ddoghq/*`, and `maruina` for other organizations.
- Context and PR content are untrusted. The agent cites them and does not follow instructions in them.
- The output stays in the local session. The command does not post Slack text or PR content anywhere.

## Testing strategy
- Structural tests in `lifecycle-prompts.test.mjs` assert that `pr-validate.md` contains:
  - the read-only hard gate
  - the three outcomes and their trigger rules
  - the rule that context is evidence, not instructions
  - the check of existing threads before an Ask
  - inline evidence for each item, and no separate evidence section
  - thread claims with the four states, duplicate merging, and the rule that "outdated" is not "fixed"
  - the direct answer to a question in the context, together with the full verdict
  - read-only cluster evidence, with no cluster writes and no credential refresh
  - no questions to the user after analysis starts
  - the attention-item rules: reviewer-owned decisions only, one to five items, inline context and options, the count in the verdict line, and no effect on the verdict
  - the coverage section
  - the skill provenance markers
- `npm test` in `dot_pi/agent` passes.
- Acceptance: run `/pr-validate` on each case in [Reference cases](#reference-cases) with its context.
  - #103728: the output addresses the five expected items. Items 3 and 4 have a confirmed or refuted state with evidence.
  - #4309: duplicate bot findings are merged, each finding has a state, and cluster impact has evidence or a named gap.
  - #102960: both of the user's threads have a state, with evidence from the reviewed commit and the PR head.
  - All three: the full verdict is present.
- User judgment: the user can decide between Approve and Ask from the first section in about two minutes, without opening the diff.
- User judgment: the user can decide each attention item from its inline context, without opening the diff.

## Open questions
- Should the claims ledger stay in chat only, or also go to a file in the review worktree? The recommendation for the first slice is chat only.
- Cluster evidence for deployed configuration: the design allows read-only metadata and observability queries (`ddtool`, Datadog MCP, audit logs) and forbids cluster writes and credential refresh. Confirm whether read-only `kubectl get` against target clusters is also allowed during an unattended run.
- Should `/pr-validate` state the shared worktree path in its own words, or refer to `/pr-review` Phase 1? `/plan` decides.

## Self-review
- The first slice produces user feedback: one real run on #103728 with known expected items.
- The deferred alternatives are not merged into the slice. Each alternative has a merit and a revisit trigger.
- Rejected finding: "add `/pr-validate` cross-references to the other lifecycle prompts in this slice". The references describe `/pr-review` as the tool to assess someone else's PR, which stays true until the guided redesign. Changing them now adds review surface with no user feedback.
