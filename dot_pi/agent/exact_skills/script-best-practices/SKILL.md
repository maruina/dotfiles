---
name: script-best-practices
description: Applies shell script best practices when writing or modifying Bash or shell scripts. Use for executable scripts, shell libraries, CI scripts, install scripts, dotfile scripts, and shell command snippets.
---
# Script Best Practices
Use for shell scripts and shell snippets. Match existing style first. Do not rewrite working scripts for style alone.

## Choose shell deliberately
- Use shell for small utilities, wrappers, glue code, and simple automation.
- Use another language when logic, parsing, data structures, or error handling become complex.
- Prefer builtins and direct shell constructs over clever pipelines.

## File shape
- For executable Bash scripts, use `#!/bin/bash` unless the repo requires another interpreter.
- Set options with `set`, not shebang flags.
- Put constants near the top, then functions, then executable code.
- If a script has functions, use `main` and call `main "$@"` as the last non-comment line.
- Use `.sh` for shell libraries and do not make libraries executable.

## Formatting and names
- For new Bash code, use 2-space indentation and no tabs unless the repo differs.
- Keep long pipelines readable; split one command per line with the pipe at the start of continuation lines.
- Use lowercase names with underscores for functions and regular variables.
- Use uppercase names for constants and exported environment variables.
- Mark constants `readonly` after assignment.
- Use `local` for function-local variables.
- Split declaration from command substitution so exit codes are preserved:
  ```bash
  local output
  output="$(some_command)" || return
  ```

## Quoting and arguments
- Quote variables by default: `"${var}"`.
- Forward arguments with `"$@"`; avoid `$*` and unquoted `$@`.
- Use arrays for lists and command arguments. Do not store multiple arguments in one string.
- Use `$(command)` instead of backticks.
- Use explicit paths for globs (`./*`) and `--` before user-controlled paths when supported.

## Conditionals and errors
- Prefer `[[ ... ]]` in Bash.
- Use `-z` and `-n` for string emptiness checks.
- Use `(( ... ))` for arithmetic.
- Check return values directly and write diagnostics to stderr.
- Use `set -o pipefail` when pipeline failure should fail the script.
- Avoid fragile human-output parsing when machine-readable output exists.

## Footguns
- Avoid `eval`.
- Do not parse `ls`; use globs, `find`, `readarray`, or null-delimited output.
- Avoid piping into `while read` when loop-side variable changes must survive; use process substitution or `readarray`.
- Use `read -r` unless backslash escapes are intentional.
- Do not rely on aliases, interactive shell config, current directory, or ambient environment unless documented.

## Comments and finish
- Comment tricky, non-obvious, security-sensitive, or compatibility-sensitive behavior.
- For non-trivial functions, document purpose, globals, arguments, outputs, and returns.
- Run ShellCheck and relevant script tests when practical.
- Verify executable scripts run with the intended interpreter.
