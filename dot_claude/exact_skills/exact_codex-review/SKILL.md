---
name: codex-review
description: Use Codex CLI for AI-powered code reviews
---

# Codex Review

Run AI-powered code reviews using the Codex CLI.

## Commands

**Review uncommitted changes:**
```bash
codex exec review --uncommitted
```

**Review against base branch:**
```bash
codex exec review --base main
```

**Review specific commit:**
```bash
codex exec review --commit <SHA>
```

**Review commit with title:**
```bash
codex exec review --commit <SHA> --title "Description"
```

## When to Use

- Use `--uncommitted` before committing changes
- Use `--base main` before creating a PR
- Use `--commit <SHA>` to review a specific commit
- Add `--title` to provide context for commit reviews