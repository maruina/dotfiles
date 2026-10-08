# `/pr-validate` delegated PR review design
## Summary
Add a read-only pi `/pr-validate <GitHub PR URL> [context]` prompt. It reviews someone else's PR on the user's behalf and returns one verdict: **Approve**, **Ask**, or **Request changes**. Each item names the problem, the location, why it matters, and the evidence, so the user can write their own GitHub comment without reading the diff. Separately, the command lists up to five **attention items**: decisions that belong to the reviewer, each with enough inline context that the user does not need to search the diff. The user's attention is the scarce resource, so every item carries the evidence needed to decide it. Existing review threads, from humans and from review agents, are claims that the command confirms or refutes. This supports two more questions within the same full verdict: "do these agent comments apply?" and "were my comments addressed?"

Revision 2 (2026-09-29) changes how the report is presented and what counts as evidence. Revision 1 moved the verdict to an HTML report, but that report was still a wall of text. In revision 2, every item follows a fixed story (why it matters, what the code does, why that is bad, whether it is real, the shape of the fix), with diagrams, chips, and short text in the style of the `show-me` story pages. Severity now depends on real exposure and fix cost, not only on whether the code is wrong. Three criteria are new: observability, dependencies, and docs. `/pr-validate` also learns to discover skills in the company marketplace. See [Revision 2: presentation and evidence](#revision-2-presentation-and-evidence).

Revision 3 adds the Walkthrough, the **Where this fits** item slot, Pass/Fail/Open review gates, and PR summary and review-gates tables. It retires `/pr-review` because the user uses `/pr-validate` for PR reviews.

`/pr-validate` is the delegated review mode. The separate `/pr-review` command is retired.

## Alignment brief
Problem:
Reviewing large PRs takes more time than the reviewer can give. The reference case is `ddoghq/dd-source#103728`: 46 files, +1242/−751, a port of `computecla` Slack notifications from the SDP slack-worker to the CINDY notifications platform, and a description too dense to assess. The reviewer still must decide whether to approve, and must know exactly what to ask the author and why.

User / audience:
A staff engineer who reviews a colleague's PR through pi and does not read the diff.

Goal:
`/pr-validate` returns Approve, Ask, or Request changes. Every item has evidence precise enough for the user to write their own comment. Attention items bring reviewer-owned decisions to the user with all the context they need.

Non-goals:
- Redesign of `/pr-review` into a guided review. Deferred; see [Deferred alternatives](#deferred-alternatives).
- Interactive HTML walkthroughs, a shared `/pr-review` and `/to-html` template, or a `gh pr review` command panel. The single-file report is in scope since revision 1.
- Drafted review comments. A fix-shape snippet or sketch (revision 2) is evidence for the user's own comment, not a drafted comment.
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
- Decision: `/pr-validate` uses `/pr-review`'s data-collection pattern but does not copy its `reset --hard` worktree step. Prompts cannot include one another, so the safe workspace rule is stated in `/pr-validate` itself.
- Fact: the `repo-checkout` skill owns the locate-or-clone rule. It shipped in `maruina/dotfiles#87`. See [Repository checkout: `repo-checkout` skill](#repository-checkout-repo-checkout-skill).
- Decision: `/pr-validate` uses the same worktree path as `/pr-review`, `~/dd/.worktrees/REPO/pr-PR_NUMBER-review`, so `/pr-cleanup` works without change. It reuses only a clean worktree from the requested repository at the verified PR head; otherwise it stops without changing that path.

Smallest user-feedback slice:
A new `pr-validate.md` prompt with structural tests, run once on #103728 with the two Slack quotes below.

Success criteria and validation:
See [Testing strategy](#testing-strategy).

Operational notes:
Read-only. One long context per run. The coverage section makes partial reading visible. The run does not stop to ask the user questions after analysis starts.

### Revision 2 alignment brief
Problem:
The revision 1 report (run 4 on #103728) had sound content, but it was a wall of text. Understanding an item took almost as long as verifying it. The proof that a defect was real was in the Coverage section, not on the item.

Goal:
For every Ask, Request changes, and attention item, the user understands why it matters, what the code does, why that is bad, whether it is real, and the shape of the fix, without leaving the page. Approve still writes a short page as the record.

Decisions:
- The five-slot [item story](#item-story), on a `show-me` story page (see [Report page (revision 2)](#report-page-revision-2)).
- Severity depends on exposure and fix cost (see [Severity](#severity-exposure-and-fix-cost-revision-2)). Missing exposure evidence is visible on the item. After the run, the user finds the evidence with the agent or accepts the gap.
- Three new criteria: observability, dependencies, and docs.
- The summary and the page name the model and thinking level. `user-context` adds the thinking level.
- `/pr-validate` discovers skills in `~/dd/claude-marketplace` (work profile, bounded). Discovery stays inside `/pr-validate` until real runs prove it consistently loads skills Pi does not already load.
- The slice starts with a mock page from run 4's content and real exposure evidence. The prompt changes only after Matteo approves the mock.

Non-goals:
A shared `/pr-review` and `/to-html` template, the GitHub dark style, a TypeSafe skill selector, changes to `skill-loader`, and changes to the passes other than the exposure check, the new criteria, and the marketplace-discovery step.

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
| `show-me` | `agent-selected` | Revision 2: the positive reference page came from it | Its rules (the smallest view that makes the point, each visual next to the short text it supports) became the report's page principle |
| `mermaid-best-practices` | `agent-selected` | Revision 2 adds Mermaid diagrams | Diagram type for each item slot; one concept per diagram; short labels |
| `typesafe-ai` | `user-requested` | Revision 2: the user asked whether Jev can select skills | Read the live skill-suggestion cookbook and the Choice and API docs; found the 255-option limit and the single-pick output; deferred with a trigger |

`skill-loader` was not used. This design changes a Markdown prompt and a `node:test` file. No language or domain skill applied.

Advisory learnings: `Datadog/Learnings.md` returned no sections that match `html`, `to-html`, `mermaid`, `walkthrough`, `playground`, `pr-review`, or `skill`. No learning guidance was used. Revision 2 lookup (`mermaid`, `html`, `diagram`, `report`, `pr-validate`, `pr-review`, `show-me`, `presentation`) returned only unrelated distributed-systems sections. No learning guidance was used.

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
- Revision 2:
  - Run 4 report `~/.pi/agent/pr-validate-reports/dd-source-103728.html` (the negative reference).
  - The CMPT-4066 story page, `show-me-cmpt-4066-story.html` in the `maruina/cmpt-4066` dd-source worktree (the positive reference).
  - `~/.claude/commands/pr-review.md` (the playground exploration).
  - The `show-me`, `mermaid-best-practices`, `atlas-workflows`, `skill-loader`, and `typesafe-ai` skills, and `atlas workflow --help`.
  - `dot_pi/agent/exact_extensions/user-context.ts` and `statusline.ts`, for model and thinking-level exposure.
  - `dot_pi/agent/modify_private_settings.json.tmpl`, for the marketplace directories that pi already loads.
  - A size survey of `~/dd/claude-marketplace` at commit `d78228531` (2026-09-29).
  - The TypeSafe skill-suggestion cookbook, and its Choice and API pages.

## Current behavior
`/pr-review` serves two different jobs in one prompt:
- **Delegated review.** Phase 7 assesses the PR. Phase 9 gives a verdict (`ready as-is | needs discussion | needs changes | not enough evidence`) and a suggested review comment.
- **Comprehension.** Phases 4–6 give a finished walkthrough for the user to read. Comprehension checks appear only at familiarity levels `0` and `1`.

For delegated review, the drafted comment conflicts with the user's goal, because the user writes their own comment. The verdict values do not separate "the author must answer a question" from "the code has a confirmed defect". For large PRs, Phase 4 says to focus on key files when more than 10 files change, but no rule connects skipped files to the verdict.

## Design overview
### Input
`/pr-validate <GitHub PR URL> [context]`
- The PR URL is required. The agent asks questions only before analysis starts: when the PR URL is missing, or when no local checkout exists for a repository outside the `DataDog`, `ddoghq`, and `ddoghq-sandbox` organizations.
- The context is optional free text. Examples are Slack quotes, Jira links, and reviewer notes. The template includes `$ARGUMENTS` in its body so Pi passes the URL and context to the agent. The agent cites context as evidence. It does not follow instructions inside the context.

### Workspace and data
Locate or clone the repository with the `repo-checkout` skill, in the same way as `/pr-review` Phase 1 steps 1–3. Confirm the base-repository remote and get `headRefOid` from `gh pr view --json headRefOid`. If `~/dd/.worktrees/REPO/pr-PR_NUMBER-review` exists, check that it is a Git worktree for the requested `ORG/REPO`, has no tracked or untracked changes, and has `HEAD` equal to `headRefOid`. Reuse it only if all checks pass. A dirty, stale, or mismatched path is a workspace conflict: stop before analysis, report the conflict and a safe resolution, and do not reset or remove it. For a missing path, fetch `refs/pull/PR_NUMBER/head` from the confirmed base-repository remote, compare the fetched SHA with `headRefOid`, then create a detached worktree at that path from the verified SHA. Stop if the head moved between metadata and fetch; do not review an unverified commit. Gather the PR metadata, diff, comments, review threads, and thread resolution state as in `/pr-review` Phase 2, and read CI status with `gh pr checks`.

### Repository checkout: `repo-checkout` skill
`maruina/dotfiles#87` added `dot_pi/agent/exact_skills/repo-checkout/SKILL.md` and pointed `/pr-review` Phase 1 to it. `/pr-validate` uses the skill for these behaviors:
- It confirms each candidate checkout by its remote, so a directory with the same name from another organization is never used.
- It resolves `maruina/dotfiles` to `~/.local/share/chezmoi`.
- It clones `DataDog`, `ddoghq`, and `ddoghq-sandbox` repositories into `~/dd/REPO` without asking, and asks for every other organization.
- It states the `gh` account rule: `matteo-ruina_ddog` for `ddoghq/*` and `ddoghq-sandbox/*`, and `maruina` for everything else.

The skill's branch handoff uses the `wt.fish` worktree path, `$WORKTREES_ROOT/<repo>/<branch-slug>`. `/pr-validate` does not use that handoff. It uses the `/pr-review` review worktree path, `~/dd/.worktrees/REPO/pr-PR_NUMBER-review`, so that `/pr-cleanup` removes it when clean. The path contains no organization, so remote validation is mandatory. A clean but stale worktree must be cleaned up before a new run; repeated conflicts are the trigger to revisit safe refresh.

The skill asks where to clone only for organizations outside the three listed above. In `/pr-validate`, that question can occur only before analysis starts.

Out of scope for `/pr-validate`, reported as a follow-up: `simplify.md` "PR URL resolution" step 4 and `pr-address-feedback.md` Phase 1 still have their own copies of the clone rule, which clone only `DataDog` without asking. `lifecycle-prompts.test.mjs` has no assertion that prompts use `repo-checkout`.

In `/pr-validate`, the agent asks where to clone only before analysis starts, and only for organizations outside `DataDog`, `ddoghq`, and `ddoghq-sandbox`.

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

Pass 1 also runs `skill-loader` on the changed files and loads the selected skills before any judgment. Revision 2: `/pr-validate` also discovers skills in the company marketplace. See [Marketplace skill discovery in `/pr-validate`](#marketplace-skill-discovery-in-pr-validate).

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

When the PR changes deployed configuration, such as rendered Kubernetes manifests for specific clusters, a finding "applies" only if it affects those clusters. Pass 3 identifies the target clusters from the changed paths and checks whether the affected features or workloads exist there. The agent can use these read-only evidence sources:
- `ddtool`, through `ddtool-cluster-datacenter-info`, for cluster metadata.
- `kubectl get`, `describe`, and `list` against the target clusters, for workload and resource state. Pass `--context <cluster>` on each command, because `compute-guardrails` blocks `kubectl config use`.
- Datadog, through `datadog-mcp` and `k8s-audit-logs`, for logs and audit events. Use Datadog for logs, not `kubectl logs`.

The prompt must state that these queries are read-only, and it must not depend only on the guardrail. The work-profile `compute-guardrails` extension is a second layer: it blocks `exec`, `port-forward`, `debug`, `cp`, and every mutating verb without prompting, so a blocked command cannot stall an unattended run. The agent must not change cluster state and must not refresh expired credentials. If the evidence is unavailable, the entry stays open, and the item names the missing evidence and the query that would settle it.

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
| Observability (revision 2) | New or changed behavior that operators must see has metrics, logs, or traces, or evidence shows that existing telemetry already covers it. |
| Dependencies (revision 2) | Each new dependency on an external service is named, with its failure behavior. The change adds no circular dependency between packages, services, or build targets. |
| Docs (revision 2) | The architecture docs, `AGENTS.md` files, and other repository guidance that the change makes wrong are updated. |

The three revision 2 criteria are rows in the criteria table. They become items only when they find a gap, so they do not add volume to a clean PR.

### Verdict rules
- **Approve.** Every criterion is confirmed.
- **Ask.** At least one criterion is open, and no defect is confirmed. Each Ask item gives the exact question for the author, why the answer matters, what the agent checked and did not find, and the inline evidence (code excerpt, PR text, or cited context).
- **Request changes.** At least one defect is confirmed. Each item gives what is wrong, `file:line`, a code excerpt, why it matters (the concrete failure), and the evidence that confirms it.

Before the agent adds an Ask item, it checks the existing review threads. If a thread already answers the question, the agent cites that thread.

### Severity: exposure and fix cost (revision 2)
A confirmed code defect is not enough for Request changes. The agent also checks **exposure**: whether the defect affects real executions, data, or clusters. It also estimates the **fix cost**. Run 4 showed the gap: it raised a Request changes item for Temporal replay safety because executions "will almost certainly exist at deploy time", and it listed the in-flight executions as unavailable evidence in the Coverage section.

| Code defect | Exposure | Fix cost | Item |
|---|---|---|---|
| Confirmed | Real, with evidence | Any | Request changes |
| Confirmed | None now, or rare | Small | Request changes, framed as cheap insurance |
| Confirmed | None now, or rare | Large | Attention item: accept the risk with a deploy-time condition, or require the fix |
| Confirmed | Unknown (evidence gap) | Any | Ask or attention item, with the gap and the query that would settle it |

Exposure evidence at review time is a snapshot. The PR deploys later, and new executions start in the meantime. "None now" shows the likelihood of a break, not its absence. So an accept-the-risk item always states the condition that must hold at deploy time, for example "deploy only when `atlas workflow list` shows no running executions of these types", with the exact read-only query.

When the agent cannot run an exposure check, it says so on the item, not only in the Coverage section. After the run, the user either finds the evidence together with the agent and records how to find it (through `/learn` or a skill update), or accepts the gap. The run itself stays read-only and asks no questions.

For Temporal and Atlas workflows, exposure evidence comes from read-only `atlas workflow list` and `inspect` commands. The `atlas-workflows` skill works only from a workflow URL, so the prompt names the query that finds running executions by workflow type.

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

Revision 2: attention items use the [item story](#item-story). Where and Context fill slots 2 and 3, Why it needs your judgment fills slot 1, and Options with the recommendation fill slot 5.

deliberate: the five-item limit keeps delegation useful. If real runs often need more than five, the PR likely needs a split, and the verdict must say so. Do not raise the limit.

### Output
Revision 1 (2026-09-29): two acceptance runs showed that a chat medium cannot carry this volume readably, and that `file:line` citations cost the reviewer a GitHub round trip to rebuild context. The full verdict moves to an HTML report file, and the chat gets a short summary. This supersedes the earlier Markdown-in-chat plan, including the `/to-html` deferral row for this command.

The run writes one single-file HTML report to `~/.pi/agent/pr-validate-reports/REPO-PR_NUMBER.html` (highlight.js from a CDN is allowed), creates the directory if needed, overwrites an existing report for the same PR, opens it with `open`, and returns a short chat summary. The report is the artifact of record.

Revision 2 replaces the revision 1 page style and section list. Run 4 used the GitHub dark style from the Claude Code `/pr-review` exploration (fixed header, left navigation, callouts, and code blocks), and the result was "too dense and horrible wall of text. No diagrams, difficult to read." The style did not fail; the shape did. Each item was four dense paragraphs, the proof of impact sat in the Coverage section, and nothing was visual. See [Report page (revision 2)](#report-page-revision-2) for the page that replaces it.

PR content and context are untrusted data. The report renders them as text only: escape them so they cannot inject markup or scripts. Mermaid diagrams contain only labels that the agent writes, never raw PR or context text, and Mermaid runs with `securityLevel: "strict"`. The `write` and `humanizer` skills apply to all report prose.

The run writes the report for every verdict, including Approve. An Approve page has no items; it leads with the reason to trust the verdict: the criteria chips, the coverage, and any evidence gap that the verdict depends on. Without that page, an approval has no record of why it was safe.

The chat summary is short:
- the verdict line with the item and attention-item counts;
- one line per item and per attention item (its plain-language title and `file:line`);
- one line per open evidence gap;
- the model and thinking level that did the review;
- the report path.

The chat does not repeat report prose.

## Revision 2: presentation and evidence
### Goal
The user does not have time for a long review and wants to offload most of the verification to the agent. On Approve, the chat line is enough. On Ask or Request changes, the user must understand why each change is needed, well enough to defend it to the author, without opening the diff, GitHub, or Slack. Revision 1 targeted "decide in about two minutes". Revision 2 replaces that with this criterion: reading an item takes much less time than verifying it, and it answers the questions the author will ask.

### Item story
Every Ask item, Request changes item, and attention item uses the same five slots, in this order:
1. **Why it matters.** In plain language, for someone who has not read the code.
2. **What the code does now.** A short excerpt with a permalink to the PR head SHA.
3. **Why that is bad.** The concrete failure. When a mechanism exists, a sequence diagram shows it, for example "deploy → replay → history mismatch → workflow task fails".
4. **Is it real?** Chips such as `Exposure: real · 3 running`, `Exposure: none now · 14 started in 7 days`, or `Exposure: unknown`, and `Fix cost: small` or `Fix cost: large`. Links to the evidence, such as the running Atlas executions. The deploy-time condition when the item accepts risk. The exact query when evidence is missing.
5. **Fix shape.** A snippet that the user can paste into a comment, or a short sketch when the fix is more than a few lines. The author's LLM writes the implementation. For attention items, **Options** with a recommendation replace this slot.

A slot that does not apply says so in one line. It is not left out. Each item has a plain-language title, like a CMPT-4066 chapter title, for example "In-flight workflows will fail after deploy", not "Add replay protection".

### Report page (revision 2)
The page follows the `show-me` story shape of the CMPT-4066 page (light theme, hero, sticky chip navigation, chapters, cards, chips, and small tables):
1. **Hero.** The verdict, count chips, a lead of one sentence, the PR link, the head SHA, and the model and thinking level.
2. **Chip navigation.** One entry per item chapter, then the reference sections.
3. **Map.** One flowchart of the changed flow, with the nodes that carry items colored red (Request changes) or amber (Ask or attention). It orients the user before the items.
4. **Item chapters.** Request changes, then Ask, then attention items, each in the five-slot story.
5. **Your question.** Only when the context asks one. It gives a direct answer. For thread questions, it gives one row per thread claim. A state diagram is allowed here when it clarifies thread states.
6. **Reference.** The criteria table as chip rows, Coverage, and Skills loaded and used. Detail stays in `<details>` blocks. The claims ledger is not a top-level section.

Diagram rules:
- Use a diagram only where it replaces a paragraph of mechanism or flow. An item without a mechanism gets no diagram.
- Follow `mermaid-best-practices`: one concept per diagram and short labels.
- Mermaid and highlight.js load from a CDN. Offline, the diagram source shows as text, and the page still reads.

Code and links:
- Excerpts stay short: only the lines that support the slot.
- Each excerpt has one permalink to the PR head SHA.
- A list of `file:line` links stays in `<details>`, not in the item head.

### Model and thinking level
The summary and the page header name the model and thinking level that did the review. The `user-context` extension already injects `## Current Model` (`formatCurrentModel` in `user-context.ts`). The thinking level is not visible to the agent today, but pi exposes it through `pi.getThinkingLevel()`. Revision 2 adds one line with the thinking level to the same `user-context` section, with a unit test. Until that lands, the report says `thinking level: not available to the agent`.

### Marketplace skill discovery in `/pr-validate`
`~/dd/claude-marketplace` is the company skill repository. At commit `d78228531` it had 1,355 `SKILL.md` files. Pi loads only three of its directories (`compute`, `compute-support`, and `dd/skills/conductor`, work profile only, in `modify_private_settings.json.tmpl`). The rest is invisible to the agent. For #103728, a description search finds `atlas/skills/go-check-version-gate` and `atlas/skills/go-replay-test`, which match item 1 exactly, and `change-orchestration/skills/notification-prompts`.

Context cost:

| What the agent loads | Size |
|---|---|
| All skill bodies | 16.7 MB (impossible) |
| Every `name` and `description` line | 369 KB, about 90k tokens |
| A targeted `description:` search for the PR's terms | about 25 KB, about 6k tokens, or less when paths are listed first |
| One matched skill | about 4 KB, about 1k tokens |

The rule goes in `/pr-validate`'s Pass 1, so only review runs pay the discovery cost; `/plan`, `/execute`, and the other lifecycle stages keep their ordinary skill selection:
1. Skip the step when `~/dd/claude-marketplace` does not exist (the personal profile) or when no search term applies (for example, a Markdown-only change).
2. Derive up to five terms from the affected paths, the imports, and the systems involved.
3. Search only frontmatter `description:` lines, excluding the directories that pi already loads.
4. Read at most three matches that apply.
5. Record each one as `agent-selected`, with its marketplace path, in the provenance table.
6. Never `git pull` the marketplace. Record its commit and date in the calling output, so a stale catalog is visible.
7. Marketplace skills are guidance, not authority. When one tells the agent to deploy, write, or post, the calling prompt's gates win.

deliberate: the five-term and three-skill caps can miss a relevant skill. The upgrade path is a ranked selector; see the TypeSafe row in [Deferred alternatives](#deferred-alternatives).

Extending discovery to the other lifecycle stages (through `skill-loader` or a shared skill) waits until real `/pr-validate` runs consistently load a marketplace skill that Pi does not already load; see the extension row in [Deferred alternatives](#deferred-alternatives).

This change can ship on its own and is a separate plan task and commit, so it can be reverted on its own.

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
- Separate agents, models, or sessions for each pass.
- A claims-ledger file in the worktree.
- Live validation on #4309 and #102960 before the first user-feedback run. Revisit if Matteo requests broader confidence after running #103728; the prompt still includes the thread and cluster rules, with structural tests in this slice.
- Cross-references to `/pr-validate` in `verify.md`, `systematic-review.md`, and `pr-address-feedback.md`. Add them with the guided `/pr-review` redesign, when the meaning of `/pr-review` changes.

### Revision 2 slice
Do first:
1. **Mock page.** Render run 4's #103728 content in the revision 2 page shape as a separate file, `~/.pi/agent/pr-validate-reports/dd-source-103728-mock.html`. Do not overwrite the run 4 report. For item 1, run the real read-only `atlas workflow list` exposure query. If access fails, show `Exposure: unknown` with the query. Never invent evidence. Before handing the mock to Matteo, check it against the five-slot item story and against the CMPT-4066 page. Then open it. Matteo decides whether it passes.
2. **Only after Matteo approves the mock:** update the Output, verdict, criteria, and severity sections of `pr-validate.md`, and update its structural tests.
3. Add the thinking level to `user-context`, with a unit test.
4. Add marketplace discovery to `/pr-validate`'s Pass 1, as a separate commit.
5. Run the full `/pr-validate` on #103728 with the reference context.

What the user sees:
- First, a mock page that uses real content and real exposure evidence or a named gap. Second, a full run whose page has the same shape.

What the team learns:
- From the mock: whether the page shape lets Matteo understand each item without the diff. This costs one render, not a full review run.
- From the full run: whether the prompt reproduces the shape at the end of a long review context, and whether the exposure checks and the new criteria work.

Why no smaller slice produces this feedback:
- A prompt change without a mock repeats the pattern that failed three times: each attempt costs a full run before Matteo sees anything.
- A mock without real exposure evidence cannot test the "Is it real?" slot, which is the main new part of the item story.

Deliberately defer:
- A shared `/pr-review` and `/to-html` template.
- The GitHub dark style.
- A TypeSafe or Jev skill selector.
- Moving the exposure query into the `atlas-workflows` skill.

## Deferred alternatives
| Alternative | Merit | Why deferred | Revisit trigger |
|---|---|---|---|
| Guided `/pr-review`: the agent collects evidence and asks the user questions in logical story order until the user can explain the PR | Builds real understanding. The "teach it back" end state gives a clear success signal. | Dropped: the user uses `/pr-validate` for PR reviews, so a second command would duplicate that workflow. | Revisit if the user asks for a guided, interactive review. |
| Upgrade the `/to-html` template (navigation, callouts, before/after badges) | Improves every response, not only reviews, within the existing trust model | The problem is the review mode, not the page style | Real `/pr-validate` or `/pr-review` output is hard to read in the browser |
| Agent-authored interactive HTML walkthrough skill with copy-back prompts | Clickable diagrams and a round trip from the browser to the agent | Adds a second trust path and a second rendering path. `show-me` already covers focused HTML. | Guided `/pr-review` needs spatial navigation that chat cannot give |
| `gh pr review` comment panel | Fast posting | The user writes their own comments. The command is read-only. | The user asks for posting support |
| Separate agents or models for each file type or pass | A clean context for each pass, and cheaper models for mechanical checks | pi has no subagents. Adds orchestration before the need is proven. | A real run on a PR like #103728 shows quality loss from one long context |
| Separate pi session for each pass, with a file handoff | A clean context without subagents | Adds manual steps and a handoff file format | Same trigger as above |
| Extension tool for repository checkout, instead of a skill | Deterministic and unit-testable. It is also a natural place for the `gh` account switch between `matteo-ruina_ddog` and `maruina`. | Adds TypeScript to maintain for a short rule that rarely changes | Agents repeatedly get the lookup order or the `gh` account switch wrong |
| Consolidate the worktree step in `repo-checkout` too | One place for all PR workspace setup | The prompts create worktrees differently on purpose, and one shared step would hide those differences | None |
| Thread-only answers, as a mode of `/pr-validate` or an extension of `pr-comment-triage` | Shorter output and a faster run when the user asks only about threads | The user wants the full verdict every time. `pr-comment-triage` proposes fixes and has no reviewer-side verdict. `/pr-address-feedback` is author-side and edits code. | Full verdicts for thread questions are too slow or too long in real runs |
| Change `/pr-review` in place | One command, no copied wording | Breaks the plan to redesign `/pr-review` as a guided review | None |
| Keep the revision 1 GitHub dark style (fixed header, left navigation) and only add diagrams and the item story | Familiar GitHub look, and code in dark themes is easy to read | The only page that worked for Matteo is the light `show-me` story shape. Mixing two styles makes the mock test two changes at once | The mock fails on readability, not on structure |
| Extract a shared report template for `/pr-review` and `/to-html` now | One style for every HTML output | No page shape has passed yet. Designing for three consumers before one works widens the slice | The revision 2 page passes on #103728, and a second command needs the same shape |
| TypeSafe or Jev as a skill selector, as in the TypeSafe skill-suggestion cookbook | Calibrated probabilities and a code-owned threshold; it matches by meaning, not by the exact words | 1,355 skills against a limit of 255 options per Choice; the cookbook picks one skill, and reviews need up to three; PR-derived text would go to an external service (#103728 has the `pci` label) with no approval evidence; a new API key, a new tool, and rate limits in an unattended run | `rg` discovery misses relevant skills or loads wrong ones in live runs, and sending PR-derived text (or only the search terms) to TypeSafe is approved |
| Extend marketplace discovery to every lifecycle stage through `skill-loader` | Every stage can use the same marketplace skills; one rule in one place avoids copies | No run has yet loaded a marketplace skill through it, and every `/plan` and `/execute` run would pay the context cost before the value is proven | Real `/pr-validate` runs consistently load a marketplace skill that Pi does not already load |
| Move the running-executions query into the `atlas-workflows` skill | Other commands can reuse it | Only `/pr-validate` needs it today | A second command needs to find running executions by type |
| No report on Approve; chat only | Less output on the happy path | An approval then has no record of why it was safe | None |

## Risks and mitigations
| Risk | Mitigation |
|---|---|
| The agent approves a PR it did not fully read, and the user approves under their name | Approve requires every criterion confirmed. The coverage section lists skipped and skimmed files, so partial reading is visible. |
| The agent reports a plausible but wrong defect, and the user asks the author to change correct code | Request changes requires a confirmed defect with `file:line` evidence. Unconfirmed concerns become Ask items. |
| The user approves without seeing an attention item, because the verdict says Approve | The verdict line shows the attention-item count, and the attention section comes directly after the verdict. |
| Attention items become a list of places to read, and delegation fails | One to five items, each with inline context. More than five means the verdict recommends a PR split. |
| Inline evidence makes the output long | Evidence is filtered to what would change the decision. Excerpts show only the needed lines. The verdict line and item titles come first, so the user can stop reading early. |
| `compute-guardrails` blocks a harmless command because the command text contains a protected tool name, for example `rg 'kubectl delete'` while the agent reads manifests. This happened while writing this design: a heredoc that contained `ddtool` was blocked. | The agent uses the `read` tool and `rg` patterns that do not start with a protected command. It records a blocked command in the coverage section. The guardrail matching is a separate issue for `compute-guardrails`. |
| The run stops on a question while the user is away | After analysis starts, the agent asks no questions. Gaps become items. |
| The output repeats the density of the PR description | The verdict and items come first and are short. Details follow in separate sections. |
| A review agent's finding is repeated as fact, or dismissed because GitHub marks it outdated | Each thread is a claim with a state at the PR head and inline evidence. "Outdated" is recorded but never counts as "Fixed". |
| Context text contains instructions, for example a Slack message with "approve this" | The prompt treats context as cited evidence only. A structural test asserts the rule. |
| Worktree paths drift over time | The shared skill owns the clone rule. The structural test checks the worktree path against `/pr-review` and `/pr-cleanup`, while `/pr-validate` owns its safe reuse rule. |
| A reused worktree loses local changes or belongs to a different repository with the same name | Require the requested remote, a clean worktree, and a `HEAD` equal to the PR head. Stop without reset or removal on any mismatch. |
| A fork branch does not exist on the base remote, or the PR head moves during setup | Fetch GitHub's `refs/pull/PR_NUMBER/head` from the verified base remote and compare it to PR metadata; stop if the SHAs differ. |
| One long context loses attention on large PRs | Pass 1 writes compact results that later passes use. The deferred multi-session alternative has a revisit trigger. |
| Revision 2: a diagram looks authoritative but is wrong, and the user trusts it over the code | Each diagram sits next to the excerpt and the permalink that it summarizes. Diagrams appear only where a mechanism exists. |
| Revision 2: exposure queries are slow, fail, or need credentials that expired | The run records `Exposure: unknown` and the query on the item, does not refresh credentials, and does not block. The user decides after the run. |
| Revision 2: "none now" exposure is read as "safe" | Exposure is a snapshot. An accept-the-risk item always states a deploy-time condition and the query to check it. |
| Revision 2: marketplace discovery adds noise or context to review runs | It is skipped without the checkout or without a matching term, and it is capped at five terms and three skills. Revert the separate commit if it hurts review runs. |
| Revision 2: a marketplace skill tells the agent to write, deploy, or post | The calling prompt's gates win. Marketplace skills are guidance, not authority. |
| Revision 2: the mock passes but the prompt does not reproduce it | The full run on #103728 is still the acceptance gate. |
| Revision 2: the page gets long again as the three new criteria add items | New criteria become items only on a gap. The five-attention-item limit and the PR-split rule still apply. |

Chosen-direction downside: the verdict is only as reliable as the agent's reading in one context. `/pr-validate` does not remove the user's accountability for the approval. It makes the basis for the approval explicit.

## Operability
- Revision 2: exposure checks add read-only `atlas` calls to each run that touches Temporal or Atlas workflows. Marketplace discovery adds about 2–10k tokens to a `/pr-validate` run when a term matches, and nothing when it is skipped; no other lifecycle stage pays it.
- Read-only for PR source and remote systems. Workspace setup can clone into `~/dd/REPO`, fetch the PR ref, and create a detached review worktree; it never resets or removes an existing path. It makes no GitHub writes or source-file edits.
- The cost is one long agent context per run. CI results come from `gh pr checks`. The command does not run broad builds.
- The user owns the prompt. Failures appear in the run output: missing evidence, skipped files, and unavailable tools.

## Rollout and rollback
- Revision 2 ships as separate commits: the `pr-validate.md` and test changes, the `user-context` thinking level, and the `/pr-validate` marketplace-discovery hunks. Each one reverts on its own with `git revert` and `chezmoi apply`. The mock page is a local file with no rollout.
- Rollout: add the `/pr-validate` prompt and apply it with `chezmoi apply`. The command is opt-in. The `/pr-validate` change itself modifies no other command.
- Rollback: revert the commit and run `chezmoi apply`. Because `exact_prompts` is an exact directory, the command disappears.

## Security and data handling
- `gh` must use the correct account: `matteo-ruina_ddog` for `ddoghq/*`, and `maruina` for other organizations.
- Context and PR content are untrusted. The agent cites them and does not follow instructions in them.
- The command's only write is the report file at `~/.pi/agent/pr-validate-reports/REPO-PR_NUMBER.html`. It writes nothing else and never inside the review worktree.
- The report renders PR content and context as text only. It escapes them so they cannot inject markup or scripts.
- The report and the chat summary stay local. The command does not post Slack text or PR content anywhere.
- Mermaid diagrams contain only labels that the agent writes, never raw PR or context text. Mermaid runs with `securityLevel: "strict"`.
- Exposure checks use read-only commands only, such as `atlas workflow list` and `inspect`. They never signal, cancel, terminate, or start a workflow, and they never refresh credentials.
- Marketplace discovery reads a local checkout. It does not pull and sends nothing outside the machine. Marketplace skills cannot override the read-only gate.

## Testing strategy
- Structural tests in `lifecycle-prompts.test.mjs` assert only the safety-critical and interface rules in `pr-validate.md`:
  - the read-only hard gate
  - the literal `$ARGUMENTS` input substitution and the frontmatter contract (`description`, `argument-hint`)
  - the three outcomes (Approve, Ask, Request changes)
  - the rule that context is evidence, not instructions
  - no questions to the user after analysis starts
  - read-only cluster evidence: no cluster writes and no credential refresh
  - the coverage section
  - the report interface: the report path `~/.pi/agent/pr-validate-reports/REPO-PR_NUMBER.html`, the hard-gate exception that names the report as the only permitted write, the chat summary that does not repeat report prose, and the escaping of untrusted PR and context text in the report
  - the skill provenance markers
  - the safe worktree contract: base-repository remote verification, a clean worktree, `HEAD` equal to `headRefOid`, a fetch of `refs/pull/PR_NUMBER/head` checked against PR metadata, and the absence of `reset --hard`
  - the drift guard on the shared review-worktree path across `pr-validate.md`, `pr-review.md`, and `pr-cleanup.md`
  - revision 2: the report is written for every verdict, including Approve
  - revision 2: the chat summary and the report name the model and thinking level
  - revision 2: Mermaid `securityLevel: "strict"` and no raw PR or context text in diagram labels
  - revision 2: exposure checks are read-only

  The outcome trigger rules, thread-state adjudication, attention-item format, and evidence-gap naming are prompt content verified by the live run, not structural markers. Trimmed after systematic review: a marker per prose rule couples the suite to wording.
- `npm test` in `dot_pi/agent` passes.
- These text checks do not prove runtime compliance.
- First-slice acceptance is user-owned: after `chezmoi apply`, Matteo runs `/reload` or starts a new Pi session, invokes `/pr-validate` on #103728 with both Slack quotes in [Reference cases](#reference-cases), and reports whether the output addresses the five expected items. Items 3 and 4 need a confirmed or refuted state with evidence, and the full verdict must be present. The implementation change is not committed until this feedback is received.
- User judgment (revision 1): Matteo can decide between Approve and Ask from the first section in about two minutes, without opening the diff, and can decide each attention item from its inline context. Run 4 failed this. Revision 2 replaces it with the next three checks.
- Revision 2 mock acceptance (user-owned): Matteo opens the mock page and understands item 1's reason, its reality, and its fix shape without leaving the page. He says it reads like the CMPT-4066 page, not like run 4. Before handing it over, the agent checks that every item has the five slots and that item 1's exposure slot shows real evidence or a named gap.
- Revision 2 full-run acceptance (user-owned): the full #103728 run reproduces the approved mock shape. Every item fills the five slots or marks a slot as not applicable. The exposure chips show evidence or a named gap with its query. The three new criteria appear as chip rows. The summary and the page header show the model and thinking level. The provenance table lists any marketplace skills with their paths.
- The slot anatomy, the severity rule, the diagram rules, and marketplace skill selection are prompt content, verified by the live runs. Only the discovery caps, exclusions, and no-pull rule get structural markers.
- `user-context` gets a unit test for the thinking-level line in `user-context.test.mjs`.
- Follow-up validation, only if Matteo requests it after the first run: #4309 checks merged bot findings, four-state claims, and cluster impact or a named gap; #102960 checks both threads with evidence from the reviewed commit and PR head. Each run still needs a full verdict. Do not report these runs as complete before they happen.

## Open questions
- Resolved for the first slice: the claims ledger stays in chat. Revisit a file only if the first run loses claims across passes.
- Resolved for the first slice: `/pr-validate` states its own safe worktree rule, uses the shared path, and does not inherit `/pr-review`'s destructive reset.
- Resolved 2026-09-29 (revision 1): the output medium is an HTML report file, not chat Markdown. The report lives at `~/.pi/agent/pr-validate-reports/REPO-PR_NUMBER.html`, outside the review worktree so the worktree stays clean. One report per PR, overwritten per run. The report is the artifact of record; the chat carries only the short summary. Revision 2 replaces the style: see the next item.
- Resolved 2026-09-29 (revision 2): the report uses the `show-me` story shape with the five-slot item story, diagrams only where they replace mechanism prose, and severity from exposure and fix cost. The mock decides between the light style and the dark style. The recommendation is light.
- Resolved 2026-09-29 (revision 2): the running-executions query lives in the prompt for now, not in the `atlas-workflows` skill.
- Resolved 2026-09-30 (plan revision): Task 1 pre-approves the reversible integration path — a temporary WIP commit, a rebase onto the fetched `origin/main`, a hand-resolved test conflict, and a soft reset back to uncommitted changes.
- Resolved 2026-09-30 (plan revision): `pr-validate.md` joins the test's `provenancePrompts` list, references the `## Provenance record` section of the `skill-loader` skill, and its test uses `provenanceReference` instead of `skillRecordMarkers`.

## Self-review
- The first slice produces user feedback: one real run on #103728 with known expected items.
- The deferred alternatives are not merged into the slice. Each alternative has a merit and a revisit trigger.
- Revision 2: the slice produces feedback before a full run. The mock uses real content and real exposure evidence or a named gap, so it tests the new "Is it real?" slot.
- Revision 2 chosen-direction downside: the mock shows that the shape works when an agent writes one page with full attention, not that the prompt reproduces it at the end of a long review. The full run is still required. The new criteria and the exposure checks also make each run longer and more expensive.
- Revision 2: every non-selected alternative (dark style, shared template, TypeSafe, the query in the skill, no page on Approve) is a deferred row with a merit and a trigger. The 2026-09-30 plan revision selected discovery inside `/pr-validate` only; extending it to every lifecycle stage is the deferred row. None is merged into the slice.
- Revision 2 rejected finding: "split marketplace discovery into its own design". It is independent, but the user asked for it in this revision, and it is small. It stays a separate plan task and commit, so it can be reverted on its own.
- Rejected finding: "add `/pr-validate` cross-references to the other lifecycle prompts in this slice". The references describe `/pr-review` as the tool to assess someone else's PR, which stays true until the guided redesign. Changing them now adds review surface with no user feedback.
