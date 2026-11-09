---
name: write
description: Write, rewrite, edit, and review prose for clarity, concision, precision, and formulaic LLM patterns using Eva Parish's editing principles. Use whenever drafting or editing prose, docs, comments, PR descriptions, plans, specs, messages, or other user-facing text.
---
# Write
Say exactly what you mean. Remove every word that does not help the reader.

## Process
1. Identify the purpose and requested format. Formulate the main point in one or two sentences; if you cannot, fix the structure before the wording.
2. When editing, preserve intent and meaningful uncertainty. Change expression, not meaning.
3. Do not invent rationale, evidence, risks, or tradeoffs that the request or source does not support. Ask for context or identify the gap.
4. Cut, clarify, then polish.
5. Self-audit for stock or templated prose. Remove generic transitions, conclusions, praise, offers to help, and repeated sentence shapes.
6. Check that an engineer can find each component, step, and error in code or logs from the text alone. If not, restore the exact name.

## Audience and structure
- Unless the request says otherwise, assume software-engineering fluency, not subsystem fluency. Do not explain common engineering concepts from first principles; explain what *this* component does and why it matters here. Subsystem fluency is knowledge you supply, not names you remove.
- Lead with the main point. Give each paragraph a clear purpose that supports the text's goal.
- Write for readers across cultures and levels of English fluency. Prefer short, literal sentences with a clear subject, verb, and object. Use terminology, capitalization, punctuation, and formatting consistently.
- Avoid idioms, slang, jokes, culturally specific references, and phrasal verbs when a direct verb says the same thing.
- Simplify sentence structure, not technical nouns. Name the exact item, then explain its function in a short clause on first use: "`datadog-admission-webhooks`, which injects `VAULT_AUTH_PATH` at pod creation". Avoid both failure modes: do not replace a component, step, field, or error name with a generic description (`"the setup agent"`, `"a request handler"`), and do not drop unexplained shorthand or abstract buzzwords (`"durable outbox"`, `"replay of committed transitions"`) without stating the concrete runtime action.
- Replace jargon only when a familiar word is equally precise. Names that a reader can search for in code, logs, or dashboards are not jargon; keep them and format them as code. Define other specialized terms on first use and use them consistently.
- Connect facts into an explicit mechanism across components: name what writes or sends a value, where it is stored or routed, what reads or validates it, and why the check fails. Do not leave adjacent sentences with an unstated link (for example, stating a version number in one sentence and an empty query in the next without stating that the version caused the empty query).
- Expand unfamiliar acronyms on first use and explain their function, not only what the letters mean.
- Split sentences that carry more than one main idea. A causal chain joined by `because` or `as a result` is one idea; keep it in one sentence when splitting would hide the cause. Use headings, lists, and tables when they make the text easier to scan.
- Do not force rhetorical patterns such as `not just X, but Y`, groups of three, or `from X to Y` when the ideas do not form a real range. Let the content determine the structure.
- If a sentence is generic filler that does not support the request and could appear unchanged in an unrelated project's documentation, replace it with a supported component-specific fact, mechanism, or instruction, or remove it.
- Do not overcompress. Use complete clauses and necessary articles. Avoid arrows, fragments, and abbreviations when they make the reader reconstruct the meaning.

## Language
- Use concrete nouns. Replace vague pronouns such as `this` or `that` when their referents may be unclear.
- Do not append participial phrases such as `ensuring`, `highlighting`, or `showcasing` unless the source supports the claimed consequence. State the mechanism or evidence, or delete the phrase.
- Prefer active voice. Name the actor when it matters.
- Remove empty hedging and intensifiers. Preserve words that communicate meaningful uncertainty.
- Use the conversational, friendly, and respectful tone of a knowledgeable colleague. Be direct, not promotional, cutesy, overly formal, or clever. Avoid unnecessary `please`, exclamation points, and slang; use common contractions when they sound natural.
- Make objective, verifiable claims. Avoid superlatives, absolutes, and guarantees unless evidence supports the exact statement. State the mechanism and scope behind performance, cost, security, or competitive claims, and cite measurable claims.
- For durable documentation, describe behavior without labels such as `new`, `now`, `currently`, `latest`, or `soon`. Do not assume that readers know an earlier version. Use time-bound language only when time is part of the content's purpose, such as in release notes or announcements.
- Cut repetition and filler, but stop when further removal would lose meaning or necessary context.
- Use US English.

## Instructions
- For procedural documentation, recommend one clear path for the common case instead of listing every option. Use realistic scenarios and concrete commands with the arguments needed for the task.
- Use an imperative or `must` for a requirement, `recommend` for a recommendation, `can` for an option, and `might` for a possible outcome. Avoid ambiguous `should`.

## Final review
Use these checks as prompts, not forbidden forms. Edit only to improve clarity, remove repetition, or match the requested voice. Preserve facts, scope, uncertainty, and the writer's position. Keep useful summaries, genuine alternatives, and formatting that helps readers scan.
- Check whether a closing sentence repeats the paragraph or a heading is restated before the point.
- Remove a defense against an objection the reader did not raise unless it carries needed context.
- Check repeated paragraph shapes and sentence openings. Vary them only when the repetition distracts.
- Check for punctuation or formatting applied by habit. Change it only when the change improves clarity or scanability.
- Use the existing rhetorical-pattern guidance above. Do not remove distinct items only because they form a group of three.

## Technical decisions
- When rejecting an alternative, state its benefit before explaining why it does not fit this case.
- Describe risks as specific failures, not abstract categories. `A caller could reuse a token meant for one cluster against another` is clearer than `Cross-cluster replay risk`.
- When selecting a default, state what changing it would require or cost. `By default, requests continue when the dependency is unavailable (fail-open). Rejecting them instead (fail-closed) requires an availability target, monitoring, and a tested bypass` explains the decision space.

## Failures and incidents
- Title: name the component, the failure, and the cause or ordering problem.
- Problem: write the causal chain in order: normal behavior, what was missing or out of order, how the value or state moved across components, and the observed failure. When a failure depends on a sequence of state changes (such as a two-AZ placement followed by a third AZ joining, or a bootstrap-to-normal credential switch), trace each step in order so the outcome does not read as a paradox. Use `because`, `when`, and `as a result` to make causation explicit. Quote the exact error string.
- Fix: state what each cited PR, commit, or manual action changed and when it applies (`falls back to X when Y is unset`, `Merged #513 added the VPC endpoint to build-stable, and #147 created the US7 surrogate IAM roles`), not only that it fixed the problem. Never list bare PR or ticket numbers without stating what each one changed. Name the actor for manual recovery.
- Number independent causes when one record has more than one.
- Give scope with names, counts, and UTC times.
- Correct a misattributed cause or PR explicitly: `#10620 is the initial US7 Vault Terraform setup, not a labeler fix`.

Weak: `The setup agent needed access settings from a service that was not ready.`
Strong: `` Parent `computecla-agent` started before `datadog-admission-webhooks` could inject `VAULT_AUTH_PATH` ``

Weak: `Merged dd-source#148300 derives the auth path from the cluster.`
Strong: `` Merged dd-source#148300 falls back to deriving the Dedicated Vault auth mount path from `cluster.VaultAuthMountPath()` when `VAULT_AUTH_PATH` is unset. ``

Weak: `A zone-spread rule kept tls-vault away from the zone of its volume, so the pod stayed Pending. Merged micro-vaults#159.`
Strong: `` `tls-vault`'s zonal `topologySpreadConstraints` used the default `Honor` policy for `nodeAffinityPolicy` and `nodeTaintsPolicy`, so the scheduler counted only AZs with matching `nodeless` + `arm64` nodes. When a new cluster had matching nodes in only 2 of 3 AZs, `maxSkew: 1` permitted a 2:1 split and bound two zonal EBS PVs in one AZ; once the third AZ had nodes, the spread constraint required the pod to run in the third AZ while its bound EBS volume remained in the first AZ. Merged micro-vaults#159 sets `nodeAffinityPolicy: Ignore` and `nodeTaintsPolicy: Ignore` on the zone spread constraint. ``

## Output
Follow the requested delivery format. If none is specified, return the draft or revised text directly. After a substantial rewrite, briefly explain the material changes when the requested or default format permits commentary.
