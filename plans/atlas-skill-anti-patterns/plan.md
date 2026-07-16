# Atlas Skill Anti-Patterns Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Incorporate durable Atlas anti-pattern guidance into the managed `atlas-best-practices` skill.
**Architecture:** Extend the existing concise routing file and focused reference files; do not add scripts or alter the skill’s scope.
**Tech Stack:** Markdown, Pi Agent Skills, chezmoi

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | prompt-required | Determine applicable skills for the managed Markdown files. | Identified `chezmoi` and `write` as required. |
| `chezmoi` | skill-loader | The skill source is managed under the chezmoi source directory. | Use source-only edits, then targeted diff and apply. |
| `write` | skill-loader | The change edits user-facing skill documentation. | Keep guidance concise, imperative, and precise. |
| `atlas-best-practices` | user-requested | The user asked to extend this skill from the Atlas Anti Patterns source. | Compared current skill guidance to the specified Confluence page. |

### Execution
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `chezmoi` | skill-loader | The implementation changes managed source files. | Edited the source worktree and selected targeted chezmoi diff/apply validation. |
| `write` | skill-loader | The implementation changes user-facing Markdown. | Kept additions concise and imperative. |
| `atlas-best-practices` | user-requested | The target skill is the requested subject. | Ensured new guidance preserves its source-precedence and conceptual scope. |

## Scope
- Modify `dot_pi/agent/exact_skills_work/atlas-best-practices/SKILL.md` and its existing references.
- Add only guidance supported by the Atlas Anti Patterns page and consistent with the current skill’s source-precedence rule.
- Do not change the skill’s trigger description, templates, tooling, or runtime behavior.

## Implementation
- [x] Update `dot_pi/agent/exact_skills_work/atlas-best-practices/SKILL.md` with an explicit bounded, partitioned-history non-negotiable.
- [x] Update `dot_pi/agent/exact_skills_work/atlas-best-practices/references/platform-and-sdk.md` with cross-worker dependency-boundary guidance.
- [x] Update `dot_pi/agent/exact_skills_work/atlas-best-practices/references/workflow-authoring.md` with workload-fit, fan-out, history bounds, signal draining, business-result, local-activity, query, and asynchronous HTTP guidance.
- [x] Update `dot_pi/agent/exact_skills_work/atlas-best-practices/references/worker-and-deployment.md` with activity-slot capacity and default-monitor guidance.

### Execution notes
- 2026-07-16: Applied the four planned documentation edits. No behavior-bearing code or automated test surface exists for this skill; validation is targeted source rendering and Markdown diff checks.
- 2026-07-16: `npm run test:skills:profiles`, `npm test`, and `npm run test:all` passed from `dot_pi/agent`; targeted chezmoi rendering matched the applied target.

## Validation
### Requirement: Anti-pattern guidance is discoverable
The skill SHALL route agents to concise guidance for the identified Atlas anti-patterns.

#### Scenario: Agent authors or reviews an affected workflow
- GIVEN an agent loads `atlas-best-practices`
- WHEN the task involves high-volume workflow coordination, signals, local activities, queries, or long-running activity capacity
- THEN the relevant reference states the recommended safe design
- AND the top-level skill highlights bounded, partitioned histories.

Validation: inspect the rendered target with `chezmoi --source <worktree> diff ~/.pi/agent/skills_work/atlas-best-practices` and run `git diff --check`.

### Requirement: Managed source renders cleanly
The changed source SHALL render to the intended Pi skill target without unrelated target changes.

#### Scenario: Chezmoi previews the changed target
- GIVEN the source worktree contains only the planned documentation edits
- WHEN targeted `chezmoi --source <worktree> diff` runs
- THEN the diff contains only the updated Atlas skill files.

## Documentation impact
The managed Pi skill is the user-facing documentation; no separate README, runbook, or `AGENTS.md` change is needed.

## Commit message
`docs(skills): add Atlas anti-pattern guidance`
