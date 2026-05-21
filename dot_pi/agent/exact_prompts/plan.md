---
description: Turn an approved design.md into a detailed implementation plan
argument-hint: "<path-to-design.md> [extra instructions]"
---

# Planning Approved Designs Into Implementation Tasks

Design spec: `$1`

Extra instructions:

> `${@:2}`

Create a comprehensive implementation plan from the approved design spec. If `$1` is missing, ask for the design path and stop.

<HARD-GATE>
Do not write implementation code, scaffold application files, modify files outside `plans/<jira-ticket-or-feature-name>/plan.md`, or take implementation action. This command creates the plan only.
</HARD-GATE>

## Posture

Write plans for a skilled engineer with zero context for this codebase, our toolset, or the problem domain. Keep them on the rails: DRY, YAGNI, TDD, bite-sized work, frequent commits, exact files, exact commands, and expected outputs.

Be convinced, not compliant. If the design is not ready to plan from, say so directly and ask for the missing decision or revision.

## Flow

1. Read the design spec from `$1` completely.
2. Inspect enough codebase context to make the plan concrete: guidance files, project shape, package boundaries, entry points, tests, build commands, and relevant existing patterns.
3. Load every relevant skill before writing the plan. Examples:
   - Kubernetes controllers or controller-runtime: `k8s-controller-dev`
   - Kubernetes APIs, CRDs, versions, validation, conversion, status: `k8s-api-design`
   - CLI commands, flags, output, prompts, errors: `cli-best-practices`
   - Go implementation details: `go-best-practices`, unless a more specific skill supersedes it
   - Datadog compute or operational workflows: relevant compute skills
4. Check scope. If the spec covers multiple independent subsystems, stop and suggest separate plans, one per subsystem, unless the spec already decomposes them into independently testable deliverables.
5. Map the file structure before tasks: exact files to create/modify, responsibilities, boundaries, and tests.
6. Write the implementation plan to `plans/<jira-ticket-or-feature-name>/plan.md`, using the same directory as the design when appropriate.
7. Self-review the plan and fix issues inline.
8. Report: `Plan complete and saved to plans/<jira-ticket-or-feature-name>/plan.md`.

The terminal state is a saved implementation plan, not implementation.

## File Structure

Before defining tasks, map out which files will be created or modified and what each one is responsible for. This is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces.
- Give each file one clear responsibility.
- Prefer smaller, focused files over large files that do too much.
- Keep files that change together near each other.
- Split by responsibility, not by technical layer.
- Follow existing patterns. If the codebase uses large files, do not unilaterally restructure. If a file being modified has grown unwieldy, a focused split can be part of the plan.

Use this structure to decompose tasks. Each task should produce self-contained changes that make sense independently.

## Plan Document Header

Every plan MUST start with this header:

```markdown
# [Feature Name] Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

---
```

## Task Structure

Use this structure for every task. Adapt language and commands to the repository, but keep the same level of exactness.

````markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

- [ ] **Step 1: Write the failing test**

```python
def test_specific_behavior():
    result = function(input)
    assert result == expected
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/path/test.py::test_name -v`
Expected: FAIL with `function not defined`

- [ ] **Step 3: Write minimal implementation**

```python
def function(input):
    return expected
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/path/test.py::test_name -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: add specific feature"
```
````

Each step should be one 2-5 minute action: write a test, run it, implement minimal code, run tests, or commit. Break up tasks until each step is small and independently understandable.

Every code, test, and commit step must include exact paths, exact commands, complete code blocks, expected output, and a Conventional Commit message where applicable.

## Required Documentation and Agent-Knowledge Task

Every plan MUST include a final task for docs and future-agent guidance.

That task must require the implementer to inspect each item below and either update it or record why no update is needed:

- user-facing documentation
- developer documentation
- README files
- runbooks or operational docs
- examples or generated reference docs
- every relevant `AGENTS.md` file in scope, including repository and nested package guidance files

For `AGENTS.md`, capture only durable knowledge useful for future interactions with the system, such as:

- new commands or generation steps required after this change
- repository-specific traps discovered during implementation
- ownership or source-of-truth rules
- testing or rollout procedures future agents must not miss

Do not add noisy implementation history, one-off decisions, or obvious coding style reminders.

## No Placeholders

Every step must contain the actual content an engineer needs. These are plan failures — never write them:

- `TBD`, `TODO`, `implement later`, `fill in details`
- `Add appropriate error handling`
- `add validation`
- `handle edge cases`
- `Write tests for the above` without actual test code
- `Similar to Task N`
- steps that describe what to do without showing how when code is needed
- references to types, functions, methods, commands, or files not defined in any task or existing in the repo

## Self-Review

After writing the complete plan, review it yourself and fix issues inline before reporting completion.

1. **Spec coverage:** Skim each section and requirement in the spec. Can you point to a task that implements it? Add tasks for gaps.
2. **Placeholder scan:** Search the plan for red flags from the No Placeholders section. Replace vague text with concrete instructions.
3. **Type consistency:** Check that types, method signatures, property names, command flags, and file paths used later match earlier definitions and the existing codebase.
4. **Skill consistency:** Check that the plan follows the relevant loaded skill guidance.
5. **Docs and AGENTS coverage:** Confirm the final docs task checks user docs, developer docs, and every relevant `AGENTS.md` file.

## Execution Handoff

After saving the plan, say exactly:

> Plan complete and saved to `plans/<jira-ticket-or-feature-name>/plan.md`
