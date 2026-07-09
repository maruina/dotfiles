---
name: skill-loader
description: Load the right best-practice skills before writing, reviewing, or planning code. Use this skill at the start of /execute, /plan, and /systematic-review to determine which language and domain skills to read based on affected files.
---
# Skill Loader

Use this skill before editing, planning, or reviewing code. Based on the files affected, read the skills listed below. Read them now — do not defer.

Prefer specific skills over general ones. When multiple skills apply, read all of them; note any conflicts and follow the more specific skill.

## Language skills

### Go — `go-best-practices`
Load when any `.go` file is created or modified.

**Exception:** when the affected code involves controller-runtime, reconcilers, CRDs, watches, finalizers, status conditions, or envtest, load `k8s-controller-dev` as the primary skill and `go-best-practices` as the secondary. The controller skill takes precedence where they conflict.

### Go + Kubernetes API types — `k8s-api-design`
Load in addition to `go-best-practices` when the affected `.go` files define or evolve CRD types (`+kubebuilder:*` markers, `spec`/`status` structs, conversion webhooks, or storage version annotations).

### Shell scripts — `script-best-practices`
Load when any `.sh`, `.bash`, or `run_onchange_*` file is created or modified, or when CI pipeline scripts are affected.

### CLI commands — `cli-best-practices`
Load when implementing or modifying a CLI command, its flags, output format, error messages, or interactive prompts.

## Domain skills

### Chezmoi source files — `chezmoi`
Load when files under the chezmoi source directory (`~/.local/share/chezmoi/`) are created or modified.

### Obsidian Markdown — `obsidian-markdown`
Load when `.md` files inside an Obsidian vault are created or modified, or when the user mentions wikilinks, callouts, frontmatter, embeds, or Obsidian notes.

### PR creation or update — `reviewable-pr-workflow`
Load when opening a new PR, amending commits before review, or responding to review feedback that requires a force-push.

### Prose and documentation — `write`
Load when drafting PR descriptions, design docs, runbooks, commit messages, or any freeform user-facing text that will be read by humans.

## Skill load checklist

Before editing, confirm each of these:

- [ ] Identified all file extensions and paths affected by the task.
- [ ] Loaded every skill whose trigger matches.
- [ ] For Go: confirmed whether controller-runtime is involved; loaded `k8s-controller-dev` if so.
- [ ] For Go CRD types: confirmed whether API type evolution is involved; loaded `k8s-api-design` if so.
- [ ] Noted any conflicts between loaded skills and recorded which takes precedence.

If no trigger matches (e.g. pure YAML config, Terraform, Helm), proceed without a best-practice skill and note that in chat.
