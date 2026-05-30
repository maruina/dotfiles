---
description: Turn an approved design.md into a detailed implementation plan
argument-hint: "<path-to-design.md> [extra instructions]"
---

# Planning Approved Designs Into Implementation Tasks

Design spec: `$1`

Extra instructions:

> `${@:2}`

Create a comprehensive implementation plan from the approved design spec. If `$1` is missing, ask for the design path and stop.

Lifecycle:

1. `/design` turns an idea into an approved design spec.
2. `/plan` turns an approved design spec into an approved implementation plan.
3. `/execute` turns an approved implementation plan into verified changes.

<HARD-GATE>
Do not write implementation code, scaffold application files, modify files outside `plans/<jira-ticket-or-feature-name>/plan.md`, or take implementation action. This command creates the plan only.
</HARD-GATE>

## Posture

Write plans for a skilled engineer with zero context for this codebase, our toolset, or the problem domain. Keep them on the rails: DRY, YAGNI, TDD, bite-sized work, frequent commits, exact files, exact commands, and expected outputs.

Be convinced, not compliant. If the design is not ready to plan from, say so directly and ask for the missing decision or revision.

## Flow

1. Read the design spec from `$1` completely.
2. Inspect enough codebase context to make the plan concrete: guidance files, project shape, package boundaries, entry points, tests, build commands, and relevant existing patterns.
3. Load relevant planning skills before writing the plan. Prefer specific skills over general ones. Examples:
   - Kubernetes controllers or controller-runtime: `k8s-controller-dev`
   - Kubernetes APIs, CRDs, versions, validation, conversion, status: `k8s-api-design`
   - CLI commands, flags, output, prompts, errors: `cli-best-practices`
   - Go implementation details: `go-best-practices`, unless a more specific skill supersedes it
   - Datadog compute or operational workflows: relevant compute skills
4. Check scope. If the spec covers multiple independent subsystems, stop and suggest separate plans, one per subsystem, unless the spec already decomposes them into independently testable deliverables.
5. Map the file structure before tasks (see File Structure below).
6. Write the implementation plan to `plans/<jira-ticket-or-feature-name>/plan.md`, using the same directory as the design.
7. Self-review the plan and fix issues inline.
8. Report: `Plan complete and saved to plans/<jira-ticket-or-feature-name>/plan.md`.

The terminal state is a saved implementation plan, not implementation.

## File Structure

Before defining tasks, map the files to create or modify, each file's responsibility, boundaries, and tests.
Follow existing patterns. Prefer focused files when the repository style allows it but does not restructure unrelated code.
Inspect existing script and helper locations before choosing paths, such as `.ci/`, `scripts/`, `hack/`, `Makefile`, and existing CI job commands. 
Prefer existing repository or platform CLIs over raw HTTP calls.
Prefer scripts to long inline CI YAML. Put logic in a script when it has branching, loops, retries, temp files, cleanup, multi-line error handling, or user-facing remediation text. Keep CI YAML focused on orchestration.

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
- Create: `exact/path/to/file.go`
- Modify: `exact/path/to/existing.go:123-145`
- Test: `exact/path/to/file_test.go`

- [ ] **Step 1: Write the failing test**

```go
func TestSpecificBehavior(t *testing.T) {
    result := Function(input)
    assert.Equal(t, expected, result)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./path/to/... -run TestSpecificBehavior -v`
Expected: FAIL — `undefined: Function`

- [ ] **Step 3: Write minimal implementation**

```go
func Function(input InputType) OutputType {
    return expected
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./path/to/... -run TestSpecificBehavior -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add path/to/file.go path/to/file_test.go
git commit -m "feat: add specific feature"
```
````

Each step should be one 2-5 minute action: write a test, run it, implement minimal code, run tests, or commit. Break up tasks until each step is small and independently understandable.

Include exact paths, commands, expected outcomes, and Conventional Commit messages where applicable. Include code snippets when they remove ambiguity. Do not invent large code blocks that are better derived from the codebase during execution.

## Required Documentation and Agent-Knowledge Task

Every plan MUST include a final task for docs and future-agent guidance. That task must require the implementer to inspect each item below and either update it or record why no update is needed:

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
- steps that describe what to do without enough detail to execute safely
- references to types, functions, methods, commands, or files not defined in any task or existing in the repo

## Self-Review

After writing the complete plan, review it yourself and fix issues inline before reporting completion.

1. **Spec coverage:** Skim each section and requirement in the spec. Can you point to a task that implements it? Add tasks for gaps.
2. **Placeholder scan:** Search the plan for red flags from the No Placeholders section. Replace vague text with concrete instructions.
3. **Type consistency:** Check that types, method signatures, property names, command flags, and file paths used later match earlier definitions and the existing codebase.
4. **Skill consistency:** Check that the plan follows the relevant loaded skill guidance.
5. **Docs and AGENTS coverage:** Confirm the final docs task checks user docs, developer docs, and every relevant `AGENTS.md` file.
6. **Automation review:** If the plan adds CI, shell, release, or operational automation, confirm existing CLIs were considered before raw HTTP; GitHub operations use `gh` unless explicitly justified; procedural logic with branching lives in a script instead of long inline YAML; and the plan includes syntax checks plus stubbed tests for the script.

## Execution Handoff

After saving the plan, say exactly:

> Plan complete and saved to `plans/<jira-ticket-or-feature-name>/plan.md`
