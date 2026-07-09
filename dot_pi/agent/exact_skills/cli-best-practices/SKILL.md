---
name: cli-best-practices
description: Design agent-friendly CLI commands. Use when creating, implementing, reviewing, or modifying a CLI command, flags, output, errors, prompts, or command workflows.
---
# Agent-Friendly CLI
Design CLIs so humans and agents do not need to infer hidden state, parse prose, or guess recovery steps.

## Contract
- Support `--json` on every command. Default to JSON when stdout is piped or captured.
- Keep stdout for data and stderr for diagnostics.
- Treat JSON fields as stable API. Version schemas when automation depends on them.
- Use NDJSON for large or streamed results.
- Prefer predictable noun-verb commands, explicit required arguments, and clear examples in `--help`.
- Prefer full long flags over shorthand in docs and generated commands.

## Failures
- Use consistent semantic exit codes.
- Return structured errors: stable `code`, human `message`, `retryable`, and concrete `suggestions`.
- Report all validation errors at once.
- Include enough context to retry safely: resource IDs, partial progress, and completed steps.

## Automation
- Never block non-interactive callers on prompts, pagers, menus, or browser auth.
- Mutating commands should support `--dry-run --json` and `--yes` or `--no-interactive`.
- Include pagination/truncation metadata, `total_count`, next commands, and `undo_command` when available.
- Prefer idempotent operations so retries do not create duplicate side effects.

## Safety
- Reject ambiguous, dangerous, or structurally invalid input. Normalize only trivial formatting.
- Never print secrets to stdout, stderr, dry-run, verbose output, or process args.
- Accept credentials through stdin, environment variables, or credential files.
- Do not add large agent docs for behavior already exposed by help or structured output. A skill should contain only workflow rules and domain constraints.
