---
name: write
description: Write, rewrite, and edit text for clarity, concision, and precision using Eva Parish's editing principles. Use whenever drafting or editing prose, docs, comments, PR descriptions, plans, specs, messages, or user-facing text.
---
# Write
Say exactly what you mean. Remove every word that does not help the reader.

## Process
1. Identify the purpose and requested format. Formulate the main point in one or two sentences; if you cannot, fix the structure before the wording.
2. When editing, preserve intent and meaningful uncertainty. Change expression, not meaning.
3. Do not invent rationale, evidence, risks, or tradeoffs that the request or source does not support. Ask for context or identify the gap.
4. Cut, clarify, then polish.

## Audience and structure
- Unless the request says otherwise, assume software-engineering fluency, not subsystem fluency. Do not explain common engineering concepts from first principles; explain what *this* component does and why it matters here.
- Lead with the main point. Give each paragraph a clear purpose that supports the text's goal.
- Write for readers across cultures and levels of English fluency. Prefer short, literal sentences with a clear subject, verb, and object. Use terminology, capitalization, punctuation, and formatting consistently.
- Avoid idioms, slang, jokes, culturally specific references, and phrasal verbs when a direct verb says the same thing.
- When a concept may be unfamiliar, explain behavior the reader can picture before introducing the technical term.
- Replace unnecessary jargon with precise, familiar words. If a specialized term is necessary, define it on first use and use it consistently. Format a term as code only when referring to the exact code item.
- Expand unfamiliar acronyms on first use and explain their function, not only what the letters mean.
- Split sentences that carry more than one main idea. Use headings, lists, and tables when they make the text easier to scan.

## Language
- Use concrete nouns. Replace vague pronouns such as `this` or `that` when their referents may be unclear.
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

## Technical decisions
- When rejecting an alternative, state its benefit before explaining why it does not fit this case.
- Describe risks as specific failures, not abstract categories. `A caller could reuse a token meant for one cluster against another` is clearer than `Cross-cluster replay risk`.
- When selecting a default, state what changing it would require or cost. `By default, requests continue when the dependency is unavailable (fail-open). Rejecting them instead (fail-closed) requires an availability target, monitoring, and a tested bypass` explains the decision space.

## Output
Follow the requested delivery format. If none is specified, return the draft or revised text directly. After a substantial rewrite, briefly explain the material changes when the requested or default format permits commentary.
