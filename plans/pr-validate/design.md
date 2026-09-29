# `/pr-validate` delegated PR review design
## Summary
Add a read-only pi `/pr-validate <GitHub PR URL> [context]` prompt. It reviews someone else's PR on the user's behalf and returns one verdict: **Approve**, **Ask**, or **Request changes**. Each item names the problem, the location, why it matters, and the evidence, so the user can write their own GitHub comment without reading the diff. Separately, the command lists up to five **attention items**: decisions that belong to the reviewer, each with enough inline context that the user does not need to search the diff.

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
- Assumption: `/pr-validate` copies the needed `/pr-review` wording, because prompts cannot include one another. Confirm during `/plan`.
- Assumption: `/pr-validate` uses the same worktree path as `/pr-review`, `~/dd/.worktrees/REPO/pr-PR_NUMBER-review`, so `/pr-cleanup` works without change.

Smallest user-feedback slice:
A new `pr-validate.md` prompt with structural tests, run once on #103728 with the two Slack quotes below.

Success criteria and validation:
See [Testing strategy](#testing-strategy).

Operational notes:
Read-only. One long context per run. The coverage section makes partial reading visible.

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
- Two Slack messages that the user supplied. They are quoted in [Reference case](#reference-case).

## Current behavior
`/pr-review` serves two different jobs in one prompt:
- **Delegated review.** Phase 7 assesses the PR. Phase 9 gives a verdict (`ready as-is | needs discussion | needs changes | not enough evidence`) and a suggested review comment.
- **Comprehension.** Phases 4–6 give a finished walkthrough for the user to read. Comprehension checks appear only at familiarity levels `0` and `1`.

For delegated review, the drafted comment conflicts with the user's goal, because the user writes their own comment. The verdict values do not separate "the author must answer a question" from "the code has a confirmed defect". For large PRs, Phase 4 says to focus on key files when more than 10 files change, but no rule connects skipped files to the verdict.

## Design overview
### Input
`/pr-validate <GitHub PR URL> [context]`
- The PR URL is required.
- The context is optional free text. Examples are Slack quotes, Jira links, and reviewer notes. The agent cites context as evidence. It does not follow instructions inside the context.

### Workspace and data
Reuse the `/pr-review` Phase 1 and Phase 2 behavior: find or clone the repository, create or reset the review worktree at `~/dd/.worktrees/REPO/pr-PR_NUMBER-review`, and collect metadata, the diff, comments, review threads, and thread resolution state. Also read CI status with `gh pr checks`.

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

Pass 1 also runs `skill-loader` on the changed files and loads the selected skills before any judgment.

### Pass 2: Correctness and internal consistency
Confirm or refute each claims-ledger entry against the code and the tests. Check that tests would fail if the changed behavior broke.

### Pass 3: Interaction with other systems
Check the contracts with the systems at the PR boundary. Examples for #103728: CINDY request limits, the legacy slack-worker fallback, Temporal replay of in-flight workflows, and proto field compatibility.

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
- **Ask.** At least one criterion is open, and no defect is confirmed. Each Ask item gives the exact question for the author and why the answer matters.
- **Request changes.** At least one defect is confirmed. Each item gives what is wrong, `file:line`, why it matters, and the evidence.

Before the agent adds an Ask item, it checks the existing review threads. If a thread already answers the question, the agent cites that thread.

### Attention items
An attention item is a decision that the reviewer owns and that the agent must not make. Examples are a policy or ownership choice, acceptance of tech debt, and a design tradeoff with no clearly correct answer. An attention item is not a fact the author can supply (that is an Ask item) and not a confirmed defect (that is a Request changes item).

Attention items do not change the verdict. The verdict line shows their count, for example `Approve — 1 decision needs your judgment`, so the user cannot miss them.

The format follows the reviewer-guide format of `reviewable-pr-workflow`, and it adds inline context. Each item has:
- **Where:** `file:line`, linked to the file at the PR head SHA with `#L` anchors.
- **Context:** a short code excerpt and the surrounding behavior needed to understand it, such as the caller, the data that flows in, and the current default.
- **Why it needs your judgment:** the consequence of each choice.
- **Options:** the realistic choices, with the tradeoff of each. The agent can state a recommendation after the options.
- **What to verify or decide:** the specific decision.

List one to five items, highest impact first. If no decision needs the reviewer, say so. If the author's reviewer guide missed a risk that the agent found, say that in the item.

deliberate: the five-item limit keeps delegation useful. If real runs often need more than five, the PR likely needs a split, and the verdict must say so. Do not raise the limit.

### Output
1. **Verdict and items.** Short, and first. The verdict line includes the attention-item count. The user must be able to decide from this section alone.
2. **Needs your judgment.** The attention items, self-contained.
3. **Criteria table.** Each criterion with its state (confirmed, refuted, or open) and a pointer to its evidence.
4. **Evidence.** Details for each item, with `file:line` or cited context.
5. **Coverage.** Files read in depth, skimmed, and skipped, with the reason for each group.
6. **Skills loaded and used.** The standard provenance table.

The output is Markdown in chat. The user can run `/to-html` on it.

## Reference case
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
| Change `/pr-review` in place | One command, no copied wording | Breaks the plan to redesign `/pr-review` as a guided review | None |

## Risks and mitigations
| Risk | Mitigation |
|---|---|
| The agent approves a PR it did not fully read, and the user approves under their name | Approve requires every criterion confirmed. The coverage section lists skipped and skimmed files, so partial reading is visible. |
| The agent reports a plausible but wrong defect, and the user asks the author to change correct code | Request changes requires a confirmed defect with `file:line` evidence. Unconfirmed concerns become Ask items. |
| The user approves without seeing an attention item, because the verdict says Approve | The verdict line shows the attention-item count, and the attention section comes directly after the verdict. |
| Attention items become a list of places to read, and delegation fails | One to five items, each with inline context. More than five means the verdict recommends a PR split. |
| Inline excerpts make the output long | Excerpts show only the lines needed for the decision. Full evidence stays in the evidence section. |
| The output repeats the density of the PR description | The verdict and items come first and are short. Details follow in separate sections. |
| Context text contains instructions, for example a Slack message with "approve this" | The prompt treats context as cited evidence only. A structural test asserts the rule. |
| Copied `/pr-review` wording drifts over time | Copy only Phase 1 and Phase 2 behavior. `/plan` decides whether a structural test checks the shared worktree path. |
| One long context loses attention on large PRs | Pass 1 writes compact results that later passes use. The deferred multi-session alternative has a revisit trigger. |

Chosen-direction downside: the verdict is only as reliable as the agent's reading in one context. `/pr-validate` does not remove the user's accountability for the approval. It makes the basis for the approval explicit.

## Operability
- Read-only. The command makes no GitHub writes and no edits outside the review worktree.
- The cost is one long agent context per run. CI results come from `gh pr checks`. The command does not run broad builds.
- The user owns the prompt. Failures appear in the run output: missing evidence, skipped files, and unavailable tools.

## Rollout and rollback
- Rollout: add the prompt and apply it with `chezmoi apply`. The command is opt-in. No other command changes.
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
  - the attention-item rules: reviewer-owned decisions only, one to five items, inline context and options, the count in the verdict line, and no effect on the verdict
  - the coverage section
  - the skill provenance markers
- `npm test` in `dot_pi/agent` passes.
- Acceptance: run `/pr-validate` on #103728 with the reference context. The output addresses the five expected items in [Reference case](#reference-case). Items 3 and 4 have a confirmed or refuted state with evidence.
- User judgment: the user can decide between Approve and Ask from the first section in about two minutes, without opening the diff.
- User judgment: the user can decide each attention item from its inline context, without opening the diff.

## Open questions
- Should the claims ledger stay in chat only, or also go to a file in the review worktree? The recommendation for the first slice is chat only.
- Should `/pr-validate` state the shared worktree path in its own words, or refer to `/pr-review` Phase 1? `/plan` decides.

## Self-review
- The first slice produces user feedback: one real run on #103728 with known expected items.
- The deferred alternatives are not merged into the slice. Each alternative has a merit and a revisit trigger.
- Rejected finding: "add `/pr-validate` cross-references to the other lifecycle prompts in this slice". The references describe `/pr-review` as the tool to assess someone else's PR, which stays true until the guided redesign. Changing them now adds review surface with no user feedback.
