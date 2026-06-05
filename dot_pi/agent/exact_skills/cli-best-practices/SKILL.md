---
description: Design agent-friendly CLI commands. Use when creating, implementing, reviewing, or modifying a CLI command, flags, output, errors, prompts, or command workflows.
---
# Agent-Friendly CLI
Core test: **what is the human caller implicitly expected to figure out?** Remove that inference from the command contract.

Prioritize:
- **Structured output:** support `--json` on every command. When output is piped or captured, default to JSON. Keep stdout for data and stderr for diagnostics. Use minimal default fields; add `--fields` or `--full` for more. Treat output fields as a stable contract.
- **Legible failures:** use consistent semantic exit codes. Return structured errors with stable `error`/`code`, human `message`, `retryable`, and concrete recovery `suggestions`. Return all validation errors at once.
- **Non-interactive execution:** never block on prompts, pagers, menus, or browser auth in non-interactive contexts. Mutating commands should have `--dry-run --json` for preview and `--yes`/`--no-interactive` for execution.
- **Next-step context:** include fields agents would otherwise query or compute: `total_count`, pagination/truncation metadata, summaries, specific next commands, and `undo_command` for mutations when available.
- **Safe input handling:** reject ambiguous, dangerous, or structurally invalid input. Normalize only trivial unambiguous formatting, such as case or trailing whitespace.
- **Secrets:** never print secrets to stdout, stderr, dry-run, verbose output, or process args. Prefer stdin, env vars, or credential files.
- **Streaming:** use NDJSON for large or streamed results.
- **Cancellation:** make interrupted commands report whether partial progress occurred and what completed.
- **Auth:** support stdin, environment variables, or credential files; do not require browser flows for automation.
- **Command shape:** prefer a predictable noun-verb hierarchy with clear required arguments and examples in `--help`.
- **Long flags:** prefer full long-name flags over shorthand; they are easier to read and understand. For example, prefer `curl --fail --silent --show-error` over `-fsS`.
- **Schema quality:** version output schemas and validate them in CI when downstream automation depends on them.
- **Useful defaults:** content-first no-arg defaults are helpful only when the target context is obvious and safe.
- **Idempotency:** prefer idempotent operations where practical so retries do not create duplicate side effects.

Do not add large agent docs for behavior the CLI already exposes through help or structured output. A `SKILL.md` should contain only non-inferable workflow rules and domain constraints.
