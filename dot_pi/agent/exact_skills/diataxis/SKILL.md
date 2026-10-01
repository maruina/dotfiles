---
name: diataxis
description: Create, organize, and improve documentation with the Diátaxis framework. Use when writing tutorials, how-to guides, reference pages, or explanations; when deciding which kind of document a piece of content belongs in; when reviewing or restructuring existing docs; or when applying documentation style rules (tone, prescriptive language, claims, code formatting, jargon).
---
# Diátaxis
Documentation has exactly four kinds, defined by two user needs: the user is either at study (acquiring skill) or at work (applying it), and the content either informs action or informs cognition. Classify before writing. Each kind has its own purpose, form, and language. Crossing the boundaries between kinds is the most common cause of bad documentation.

## Classify first: the compass
Ask two questions: action or cognition? acquisition or application?

| If the content… | …and serves the user's… | …then it belongs in… |
| informs action | acquisition of skill (study) | a tutorial |
| informs action | application of skill (work) | a how-to guide |
| informs cognition | application of skill (work) | reference |
| informs cognition | acquisition of skill (study) | explanation |

Apply the questions at any scale — a whole document, a paragraph, a sentence. When intuition is unreliable or gives an answer that feels wrong, use the compass terms loosely: action = doing, cognition = thinking, acquisition = study, application = work.

## The four kinds at a glance

| | Tutorials | How-to guides | Reference | Explanation |
| answers | "Can you teach me to…?" | "How do I…?" | "What is…?" | "Why…?" |
| oriented to | learning | goals | information | understanding |
| purpose | a learning experience | a particular task | describe the machinery | illuminate a topic |
| form | a lesson | a series of steps | dry description | discursive discussion |
| analogy | teaching a child to cook | a recipe | a food packet label | culinary social history |

## Tutorials — learning-oriented
A tutorial is a lesson: a guided, practical experience whose purpose is the learner's skill and confidence, not the artifact produced. The learner learns through what they do, not through what you say.

- Start by showing what the learner will accomplish ("In this tutorial we will create and deploy a scalable web application"). Never write "you will learn…".
- Concrete steps only. Every step produces a visible, meaningful result; deliver results early and often.
- Maintain a narrative of the expected: "The output should look something like…", "You will notice…". Flag likely failure signs.
- Point out what the learner should notice; prompt observation.
- Ruthlessly minimize explanation. One plain sentence ("We use HTTPS because it's more secure") plus a link to an explanation doc.
- Ignore options and alternatives. One managed path, no forks, no choices.
- Target perfect reliability: safe, repeatable, testable end to end. Confidence builds layer by layer and breaks easily.
- Language: first-person plural ("we"), imperative sequence ("First do x. Now do y."), "Notice that…", "Let's check…".

## How-to guides — goal-oriented
A how-to guide helps an already-competent user accomplish a real-world task or solve a problem. It serves work, not study.

- Define the guide by a human need ("how to make X happen"), not by tool operations ("press Deploy to deploy"). Tools are bit-players in the user's project.
- Title states exactly what the guide shows: "How to integrate application performance monitoring". Avoid "Integrating…" and bare topic titles.
- Use conditional imperatives: "If you want x, do y."
- Describe a logical sequence; the order must have meaning. Steps include judgement and thinking, not only commands.
- Allow forking and branching: "If this, then that." Prepare for the unexpected; the real world cannot be controlled like a lesson.
- Omit the unnecessary. Practical usability beats completeness. Start and end in meaningful places; link to reference and explanation instead of embedding them.
- How-to guides can cover basic tasks; tutorials can cover advanced topics. The difference is study vs work, not basic vs advanced.

## Reference — information-oriented
Reference describes the machinery: facts the user consults while working. It is austere, authoritative, and neutral.

- Describe and only describe. No instruction, explanation, or opinion. Link to how-to guides, tutorials, and explanation instead.
- Use consistent, standard patterns; consistency is what makes reference usable.
- Mirror the structure of the thing documented — code layout, module hierarchy, command groups.
- Include short examples to illustrate, but do not let examples grow into explanation ("why", "what if", history).
- Language: facts ("Django's default logging config is defined in `django/utils/log.py`"), lists ("Sub-commands are: a, b, c"), warnings ("You must use a. You must not apply b unless c.").
- Rule of thumb: if it is boring, unmemorable, a list, or a table, it is probably reference.

## Explanation — understanding-oriented
Explanation provides context and background. It answers "Can you tell me about…?" and is the only kind of documentation that makes sense to read away from the product.

- Title admits an implicit "About": "About user authentication", "About database connection policies".
- Make connections to other topics, including outside the immediate subject.
- Provide context: design decisions, historical reasons, technical constraints, implications.
- Admit opinion, perspective, and alternatives. Weigh approaches; consider counter-examples.
- Keep it bounded. Do not absorb instruction or technical description; those live in how-to guides and reference.
- Use a real or imagined "why" question as the prompt to bound the topic's scope.

## Common conflations
- Tutorial vs how-to guide: the most frequent and most harmful confusion. The tutorial teaches (study, managed path, no choices, safety guaranteed); the how-to guides work (real world, forking paths, user bears responsibility). A recipe is not a cooking lesson.
- Reference vs explanation: both are theoretical. Reference is consulted mid-task (work); explanation is read away from the task (study). When writing reference, do not let examples or side notes drift into explanation.
- Neighbors blur naturally: tutorials↔how-to (both action), how-to↔reference (both work), reference↔explanation (both cognition), explanation↔tutorials (both study). Check the compass when a piece of writing feels off.

## Working method
- Do not create empty four-section structures. Never impose the taxonomy as a plan; it is a guide.
- Improve one small piece at a time: pick something in front of you, assess it against the user need it serves, decide one improvement, do it, publish/commit. Repeat. Structure emerges from the inside.
- Documentation is never finished but should always be complete: useful at its current stage of growth.
- Diátaxis exposes functional-quality lapses (accuracy, completeness, consistency, usefulness) but does not fix them — verify facts against the actual product.

## Style
Apply the `write` skill for sentence-level prose. The rules below are type-independent conventions for documentation; several are deliberately stricter than ordinary writing because docs must survive translation, outlive their author, and be actionable.

### Prescriptive language
Documentation prescribes a path instead of listing options.
- Use imperative for a required action, `must` for a hard requirement, `can` for an option, `might` for a possible outcome. Avoid `should`: readers cannot tell whether it means required or optional. Decide which you mean (required vs optional, expected vs possible, is vs ought to be) and say it.
- Tutorial steps are unconditional commands; how-to guides are where forking belongs: "If you want x, do y."
- In reference, describe behavior with `must`, `can`, and `cannot` instead of hedging with `should`.

### No excessive claims
- Do not use superlatives (*best*, *fastest*, *simplest*) or absolutes (*always*, *never*) unless the statement is exactly true for the reader and easy to verify.
- Do not guarantee performance, cost, or security. Write what the feature does rather than promising an outcome: "encrypts traffic in transit", "helps prevent account takeover", not "prevents phishing" or "is secure". A claim a single incident can invalidate stays out.
- Back performance and cost numbers with a source the reader can check, or drop the number.
- Compare with third-party products factually and neutrally; never disparage, never assert how their internals work.

### Timeless documentation
- Describe how the product works now. Avoid *now*, *new*, *currently*, *latest*, *soon*, *eventually*, *at present*, *as of this writing* in product documentation; they anchor the text to a date or leak plans.
- Do not promise or imply future change. Link to release notes or a roadmap instead of writing "will support".
- Time-bound words are fine only where time is the point: release notes, blog posts, and similar time-stamped content.

### Jargon
- Let the audience decide: a term the reader uses daily is vocabulary, everything else is jargon.
- In order of preference: write around the term, replace it with a plainer or more precise word, or define it on first use in parentheses (or a link to a trusted definition): "move the check earlier in the process (*shifting left*)".
- Replace known non-inclusive jargon (*whitelist*, *blacklist*, *master/slave*) everywhere in your own prose.
- Jargon inside commands or identifiers is code, not prose: format it as code and discuss the concept around it in plain words.
- Keep one word per concept across a document, including capitalization.

### Code in text
- Format as code anything the reader types verbatim or that names a code entity: commands, subcommands and flags, file names and paths, function/class/method names, config keys and values, environment variables, placeholders (`API_TOKEN`), HTTP status codes and ranges (`4xx`), and text entered into UI fields.
- Do not format domain names, product names, organizations, or prose.
- UI elements that render previously entered text take bold plus code; other UI elements take bold only.
- Do not inflect code elements grammatically: "send a `POST` request", never "`POST` the data". Attach the English noun after the code and inflect that noun.
- Introduce each code block with a standard phrase ("The output is similar to the following:"), and explain placeholders in a list after the block, in order of appearance.

### Commands
- Show one runnable command for the common case, with the fewest arguments that complete the task. Link to the command reference for the full option list.
- Never put bracket, brace, pipe, or ellipsis syntax (`[arg]`, `{a|b}`, `...`) in a command the reader copies; those characters break commands. Show each variant as its own click-to-copy block with its own sentence.
- Show output only when the reader must verify or copy something from it. Trim with `...` on its own line; never fabricate plausible output values.
- Break long commands on flags with a trailing continuation character (`\\`) and indent continuation lines; the command must still run pasted as-is.
