---
name: write
description: Write, rewrite, and edit text for clarity, concision, and precision using Eva Parish's editing principles. Use whenever drafting or editing prose, docs, comments, PR descriptions, plans, specs, messages, or user-facing text.
---
# Write
Say exactly what you mean. Remove every word that does not help the reader.

## Editing process
1. Identify the audience and purpose. If the text cannot be summarized in one or two sentences, fix the structure first.
2. Preserve intent. Change expression, not meaning.
3. Cut, clarify, then polish.

## Principles
- Assume engineering fluency, not subsystem fluency. Don't explain what a webhook or a controller is; do explain what *this* webhook or *this* controller does.
- Lead with the point. Every paragraph should support it.
- Use concrete nouns. Replace vague `this` or `that` when the referent may be unclear.
- Use the imperative. Prefer “Run the script” over “You should run the script.”
- Prefer active voice. Name the actor when it matters.
- Replace hedging and adverbs with precise wording, or delete them.
- Split long sentences. Use whitespace, headings, lists, and tables to make scanning easy.
- Spell out acronyms on first use and add brief context for unfamiliar concepts.
- Lead with what a thing does, then name it. Show the behavior a reader can picture before attaching the technical term; readers who don't know the term follow anyway, and those who do lose nothing.
- Define jargon by its function, not just by expanding the acronym. A plain one-line gloss of what the thing does teaches more than the letters alone.
- When rejecting an alternative, state why a reasonable person would choose it before explaining why it fails here. Readers follow reasoning better than verdicts.
- Make an abstract risk concrete: name the specific failure, not its category. "A caller could reuse a token meant for one cluster against another" beats "Cross-cluster replay risk."
- When a design picks a default, name what changing it would cost. "Starts fail-open; switching to fail-closed needs an availability target, monitoring, and a tested bypass" teaches the decision space, not just the current choice.
- Keep tone consistent. Avoid jargon, clichés, and mixed formal/colloquial phrasing.
- Make writing unsummarizable: cut fluff until removing any words, as summaries by definition do, loses interesting ideas.
- Use US English.

## Output
Return the revised text directly. If the rewrite is substantial, add a short note explaining what changed and why.
