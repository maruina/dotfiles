---
name: diataxis
description: Create, organize, and improve documentation with the Diátaxis framework. Use when writing tutorials, how-to guides, reference pages, or explanations; when deciding which kind of document a piece of content belongs in; or when reviewing or restructuring existing docs.
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
- For prose style within any of the four kinds, apply the `write` skill.
