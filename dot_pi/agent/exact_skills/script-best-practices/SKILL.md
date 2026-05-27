---
name: script-best-practices
description: Applies shell script best practices when writing or modifying Bash or shell scripts. Use for executable scripts, shell libraries, CI scripts, install scripts, dotfile scripts, and shell command snippets.
---
# Script Best Practices
Use this skill when writing or modifying shell scripts, especially Bash scripts.

Default to the repository's conventions. Make small, readable changes. Do not rewrite working scripts only to satisfy style preferences.

This guidance comes from Google's Shell Style Guide: https://google.github.io/styleguide/shellguide.html

## When to use shell
- Use shell for small utilities, wrappers, glue code, and simple automation.
- Use another language when logic becomes complex, data structures become non-trivial, parsing is subtle, or robust error handling matters.
- Prefer builtins and direct shell constructs over clever pipelines.

## Interpreter and file shape
- For executable Bash scripts, use `#!/bin/bash` unless the repository requires another interpreter.
- Set shell options with `set` instead of shebang flags so `bash script_name` behaves like direct execution.
- Use `.sh` or no extension for executables. Use `.sh` for shell libraries, and do not make libraries executable.
- Never use SUID or SGID shell scripts. Use `sudo` or another controlled privilege boundary for elevated access.
- Start each file with a brief comment describing what it does.
- Put constants near the top, then functions, then executable code.
- If a script has functions, put program entry in `main`, make `main` the bottom-most function, and call `main "$@"` as the last non-comment line.

## Formatting
- Match the existing file style first.
- For new Bash code, use 2-space indentation and no tabs.
- Keep lines near 80 characters when practical. Use here-documents or variables for long literal strings.
- Put `; then` and `; do` on the same line as `if`, `for`, `while`, `until`, or `select`.
- Put `else`, `fi`, `done`, and `esac` on their own lines, aligned with the opening statement.
- Split long pipelines one segment per line. Put the pipe at the start of continuation lines:
  ```bash
  command1 \
  | command2 \
  | command3
  ```
- For `case`, indent patterns one level under `case` and actions one more level. Avoid `;&` and `;;&` unless there is a clear reason.

## Naming and scope
- Use lowercase names with underscores for functions and regular variables.
- Use uppercase names with underscores for constants and exported environment variables.
- Mark constants `readonly` after assignment.
- Use `local` for function-local variables.
- Split local declaration from command-substitution assignment so the command exit code is preserved:
  ```bash
  local output
  output="$(some_command)" || return
  ```
- Name loop variables after the item being iterated, for example `for zone in "${zones[@]}"; do`.
- Prefer functions over aliases in scripts.

## Quoting and expansion
- Quote variables by default.
- Prefer `"${var}"` over `"$var"` for regular variables.
- Remember that braces are not quoting. Use `"${var}"`, not just `${var}`.
- Use `"$@"` when forwarding arguments. Avoid `$*` and unquoted `$@`.
- Use arrays for lists and command arguments, then expand them with `"${array[@]}"`.
- Do not store multiple command arguments in one string.
- Use `$(command)` instead of backticks.
- Use explicit paths for wildcard expansion, for example `./*` instead of `*`, so filenames beginning with `-` do not become options.

## Tests and conditionals
- Prefer `[[ ... ]]` over `[ ... ]` or `test` in Bash.
- Use `-z` and `-n` for empty and non-empty string checks.
- Use `==` for string equality inside `[[ ... ]]`.
- Use `(( ... ))` or `$(( ... ))` for arithmetic. Avoid `let`, `$[ ... ]`, and `expr`.
- Do not use `<` or `>` inside `[[ ... ]]` for numeric comparison. They are lexicographic there.
- In `[[ string =~ regex ]]`, quote variables, but do not quote the regex pattern when pattern semantics are intended.

## Error handling and output
- Send errors and non-output status messages to stderr: `echo "message" >&2`.
- Check return values and return useful status codes.
- Prefer direct checks:
  ```bash
  if ! mv "${files[@]}" "${dest_dir}/"; then
    echo "Unable to move files to ${dest_dir}" >&2
    return 1
  fi
  ```
- For pipelines, use `set -o pipefail` when appropriate. Inspect `PIPESTATUS` immediately when you need per-command failure handling.
- Avoid parsing fragile human-readable output when a machine-readable format is available.

## Common footguns
- Avoid `eval`.
- Avoid parsing `ls`. Use globs, `find`, `readarray`, or null-delimited output instead.
- Avoid piping into `while read` when loop-side variable changes must survive; the loop may run in a subshell. Prefer process substitution or `readarray`:
  ```bash
  while IFS= read -r line; do
    lines+=("${line}")
  done < <(some_command)
  ```
- Use `read -r` unless backslash escapes are intentional.
- Use `--` before user-controlled paths or values when invoking commands that support it.
- Do not rely on aliases, interactive shell configuration, the current working directory, or ambient environment unless the script documents that dependency.

## Comments and documentation
- Comment tricky, non-obvious, security-sensitive, or compatibility-sensitive behavior.
- Do not comment every command.
- For non-trivial functions, document purpose, globals, arguments, outputs, and return behavior.
- Include an owner or identifier in TODO comments, for example `# TODO(matteo): ...`.

## Before finishing
- Run ShellCheck on changed shell scripts whenever practical:
  ```bash
  shellcheck path/to/script.sh
  ```
- Run existing script tests or exercise the changed path with representative inputs.
- If changing executable scripts, verify they still execute with the intended interpreter.
