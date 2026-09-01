---
name: write
description: Write, rewrite, and edit text for clarity, concision, and precision using Eva Parish's editing principles. Use whenever drafting or editing prose, docs, comments, PR descriptions, plans, specs, messages, or user-facing text.
---
# Write
Say exactly what you mean. Remove every word that does not help the reader.

## Process
1. Identify the purpose and requested format. Unless the request says otherwise, assume the audience is software engineers who may not know the subsystem. Formulate the main point in one or two sentences; if you cannot, fix the structure before the wording.
2. When editing, preserve intent and meaningful uncertainty. Change expression, not meaning.
3. Do not invent rationale, evidence, risks, or tradeoffs that the request or source does not support. Ask for context or identify the gap.
4. Cut, clarify, then polish.

## Audience and structure
- Assume software-engineering fluency, not subsystem fluency. Do not explain common engineering concepts from first principles; explain what *this* component does and why it matters here.
- Lead with the main point. Give each paragraph a clear purpose that supports the text's goal.
- When a concept may be unfamiliar, explain behavior the reader can picture before introducing the technical term.
- Expand unfamiliar acronyms on first use and explain their function, not only what the letters mean.
- Split sentences that carry more than one main idea. Use headings, lists, and tables when they make the text easier to scan.

## Language
- Use concrete nouns. Replace vague pronouns such as `this` or `that` when their referents may be unclear.
- Use the imperative for instructions. Prefer “Run the script” over “You should run the script.”
- Prefer active voice. Name the actor when it matters.
- Remove empty hedging and intensifiers. Preserve words that communicate meaningful uncertainty.
- Choose a tone that fits the audience and keep it consistent. Avoid clichés and unnecessary or unexplained jargon.
- Cut repetition and filler, but stop when further removal would lose meaning or necessary context.
- Use US English.

## Technical decisions
- When rejecting an alternative, state its benefit before explaining why it does not fit this case.
- Describe risks as specific failures, not abstract categories. “A caller could reuse a token meant for one cluster against another” is clearer than “Cross-cluster replay risk.”
- When selecting a default, state what changing it would require or cost. “By default, requests continue when the dependency is unavailable (fail-open). Rejecting them instead (fail-closed) requires an availability target, monitoring, and a tested bypass” explains the decision space.

## Output
Follow the requested delivery format. If none is specified, return the draft or revised text directly. After a substantial rewrite, briefly explain the material changes when the requested format permits commentary.
