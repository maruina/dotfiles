---
name: codebase-research
description: Use when investigating an unfamiliar codebase area before designing, planning, reviewing, debugging, or editing. Guides staged discovery: zoom out, locate relevant files, analyze current behavior, find existing patterns, map assumptions, then summarize evidence before recommendations.
---
# Codebase Research
Use this skill before proposing designs, implementation plans, reviews, or edits in code you do not already understand.

The goal is to understand the system as it exists today before judging or changing it.

## Posture
Be a documentarian first.

Do not critique, redesign, or propose fixes until you can explain:
- where the relevant code lives
- how the current behavior works
- which existing patterns the repository already uses
- what is known, assumed, and still unverified

If the area is unfamiliar, zoom out before reading locally: go up one abstraction layer and map the relevant modules, callers, owners, and boundaries using the project's domain vocabulary.

## Discovery modes
Use these modes in order. Skip a mode only when direct evidence already answers it.

### 1. Locate
Find the relevant files and organize them by purpose.

Look for:
- entry points
- core implementation files
- tests
- configuration
- API types and interfaces
- generated code
- docs, architecture decision records, runbooks, and ownership files
- examples and sample usages

Output a compact map:
- implementation files
- tests
- configs
- docs
- entry points
- related directories
- likely owners or package boundaries

Use text search for broad discovery, then use LSP for semantic navigation when the language server is available. LSP is especially useful once you know a symbol, type, field, interface, method, YAML key, or Helm value. Use it to find definitions, references, implementations, type information, diagnostics, and file symbols. Do not rely on grep alone for semantic claims.

Do not analyze deeply in this phase. The goal is navigation.

### 2. Analyze
Read the most relevant files and trace how the system works.

Start from entry points, then follow calls across boundaries. For Go, TypeScript, JavaScript, YAML, and Helm, prefer LSP tools for semantic relationships: definitions, references, implementations, type definitions, hover/type information, and diagnostics. Use LSP evidence before claiming where a symbol is defined, how broadly it is used, or which implementations satisfy an interface.

Capture:
- control flow
- data flow
- state changes
- validation
- error handling
- retries, timeouts, and concurrency
- external dependencies
- config and feature flags
- public interfaces and downstream callers

Use precise file and line references for important claims.

Do not review quality yet. The goal is accurate documentation.

### 3. Find patterns
Search for similar implementations and tests.

Look for:
- nearby features with similar shape
- existing API, CLI, controller, handler, or service patterns
- test setup and assertion style
- error handling and observability conventions
- migration or compatibility examples

Show concrete examples with file and line references. Include multiple variants when they exist.

Do not declare a pattern best unless repository guidance or repeated local usage makes that clear. Prefer: "this repository commonly does X in these places."

### 4. Map assumptions
Maintain a short assumption ledger:

| Assumption | Evidence | Impact if wrong | Validation path |
|---|---|---|---|

Stop and ask if a high-impact assumption cannot be validated from available evidence.

### 5. Summarize before action
Before recommending a design, plan, review finding, or code change, summarize:
- domain map: key concepts in repository vocabulary
- context reviewed
- current behavior
- existing patterns
- known facts vs assumptions
- unavailable or skipped sources
- remaining risks or open questions

Only after this summary should you propose changes, critique the design, or implement.

## Research command pattern
For broad research requests, first read any directly mentioned files fully. Then decompose the question into independent research areas, investigate them in parallel when possible, and synthesize findings.

Prioritize live code as the source of truth. Use historical notes, prior plans, tickets, incidents, and docs as context, not as a substitute for current implementation evidence.

When producing a durable research note, include:
- research question
- date, repository, branch, and commit when available
- summary
- detailed findings
- code references
- architecture or pattern notes
- historical context
- open questions

## Output templates
### File map
```markdown
## Codebase map: <topic>

### Entry points
- `path/file.go:123` — what enters here

### Core implementation
- `path/file.go` — role

### Tests
- `path/file_test.go` — coverage area

### Configuration and docs
- `path/config.yaml` — role
- `docs/foo.md` — relevant guidance

### Related patterns
- `path/example.go:45` — similar implementation
```

### Current behavior
```markdown
## Current behavior: <topic>

### Overview
<2-4 sentences>

### Flow
1. `path/entry.go:10` receives ...
2. `path/service.go:42` transforms ...
3. `path/store.go:88` persists ...

### Interfaces and boundaries
- `pkg/foo.Interface` separates ...
- External dependency: ...

### Error handling and operational behavior
- ...
```

### Pattern catalog
````markdown
## Existing patterns: <topic>

### Pattern: <name>
Found in `path/file.go:10-40`.

```<language>
<small relevant snippet>
```

Used for:
- ...

Tested in:
- `path/file_test.go:20-60`
````

## When used for review
For code review, run discovery before critique.

First understand:
- what the code is trying to do
- where it fits
- how similar code works
- what behavior tests already cover

Then evaluate correctness, security, performance, maintainability, and tests.

Separate documentation from judgment:
- Current behavior describes what exists.
- Findings explain why something is risky and what to change.
