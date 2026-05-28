# Transport comparison (appendix)

This file documents why `codex-iterate` uses the `codex-companion.mjs` subprocess transport rather than the `mcp__codex__codex` / `mcp__codex__codex-reply` MCP path. Read this only when troubleshooting transport choice or considering a future MCP-based variant. The SKILL.md body teaches only the subprocess flow.

## Side-by-side

| Aspect | Subprocess (chosen) | MCP (not used) |
|---|---|---|
| Helper | `node "$CODEX_COMPANION" task`, where `$CODEX_COMPANION` is resolved at loop start from the installed `codex@openai-codex` plugin (see SKILL.md "Helper resolution") | `mcp__codex__codex` to open, `mcp__codex__codex-reply` to continue |
| Session continuity | `--resume-last` reattaches to the most recent task thread for the current agent session. The companion stores this state internally. | Explicit `threadId` returned by the first call; passed back to `codex-reply` for every continuation |
| Foreground / blocking | Synchronous by default. The bash call blocks the turn until Codex returns. | Synchronous MCP tool call. Blocks the turn until Codex returns. |
| Background execution | Native `--background` flag returns a job id immediately. Poll with `codex-companion.mjs status`; fetch results with `result <id>`; cancel with `cancel <id>`. | Not native. To background, wrap the MCP call inside an `Agent` invocation with `run_in_background: true`. The Agent owns the `threadId` across its internal turns; surfacing it back to the main thread requires extra plumbing. |
| Per-turn knobs | `--write`, `--model` (with `spark` alias to `gpt-5.3-codex-spark`), `--effort none\|minimal\|low\|medium\|high\|xhigh`, `--resume-last`, `--fresh`, `--background` | `model`, `approval_policy`, `cwd`, `sandbox` (`read-only` / `workspace-write` / `danger-full-access`) |
| Composability with installed skills | Same path as `codex:rescue` and `codex:codex-cli-runtime`. Plays naturally with `/codex:setup` for install/auth. | New path; no other installed skill exercises it. Would diverge from the `codex:*` skill family. |
| Setup dependency | `codex-companion.mjs` + Codex CLI installed via the `openai-codex` plugin and `/codex:setup`. | `mcp__codex__*` MCP server must be connected and healthy. |
| Failure visibility | Stdout and stderr stream directly to the bash tool result. Most subcommands support `--json` for structured output. | MCP errors surface in the tool result; no streaming of intermediate output. |

## Why subprocess won

1. **Native background.** The user explicitly asked whether Codex can run in the background. `--background` answers that without spawning a subagent purely to host the MCP call.
2. **Consistency with the rest of the Codex toolchain.** The skills already installed (`codex:rescue`, `codex:codex-cli-runtime`, `codex:codex-result-handling`, `/codex:setup`) all use `codex-companion.mjs`. Picking the subprocess keeps the skill ecosystem coherent — one transport, one auth gate, one place to debug.
3. **Effort knob.** `--effort xhigh` is exposed cleanly on the subprocess CLI. The MCP path requires going through `approval_policy` and `sandbox` semantics that are oriented toward write-permission gating rather than reasoning effort.
4. **Session ownership.** `--resume-last` keys on the current agent session. That is exactly the granularity the loop wants — one thread per Pi session, automatically reattached without explicit ID juggling. The MCP `threadId` model is more flexible but adds bookkeeping that this skill does not need.

## When would MCP become the right choice?

If any of these become true, revisit the decision:

- The user wants two or more concurrent Codex loops in the same agent session, with explicit `threadId` routing.
- A future Codex MCP server adds capabilities (structured streaming, multi-agent fan-out) that the subprocess CLI does not expose.
- The `codex-companion.mjs` helper is removed or rewritten in a way that breaks `--resume-last`.

None of these apply today. The skill should be revisited — not extended in place to support both transports — if and when one of them does.
