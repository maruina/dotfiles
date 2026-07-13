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

**Exception:** when the affected code interacts with Kubernetes in any way — including but not limited to controller-runtime, reconcilers, watches, finalizers, status conditions, envtest, admission webhooks, authorization webhooks, `client-go`, or any `k8s.io/*` / `sigs.k8s.io/*` import — load `k8s-controller-dev` as the primary skill and `go-best-practices` as the secondary. If `k8s-controller-dev` is unavailable, continue with `go-best-practices` and note the missing skill. The controller skill takes precedence where they conflict.

### Go + Kubernetes API types — `k8s-api-design`
Load in addition to `go-best-practices` when the affected `.go` files define or evolve CRD types (`+kubebuilder:*` markers, `spec`/`status` structs, conversion webhooks, or storage version annotations). If `k8s-api-design` is unavailable, continue with `go-best-practices` and note the missing skill.

### Shell scripts — `script-best-practices`
Load when any `.sh`, `.bash`, or `run_onchange_*` file is created or modified, or when CI pipeline scripts are affected.

### Terraform/OpenTofu — `terraform-best-practices`
Load when any `.tf`, `.tfvars`, or Terraform/Terragrunt `.hcl` file is created or modified, or when planning/reviewing Terraform modules, providers, backends, state operations, imports, moved blocks, CI validation, or plan/apply workflows.

### CLI commands — `cli-best-practices`
Load when implementing or modifying a CLI command, its flags, output format, error messages, or interactive prompts.

## Domain skills

### Unfamiliar code area — `codebase-research`
Load before proposing, planning, reviewing, or modifying behavior in an unfamiliar area, especially when correctness depends on callers, existing patterns, or cross-file effects.

### Chezmoi source files — `chezmoi`
Load when files under the chezmoi source directory (`~/.local/share/chezmoi/`) are created or modified.

### Obsidian Markdown — `obsidian-markdown`
Load when `.md` files inside an Obsidian vault are created or modified, or when the user mentions wikilinks, callouts, frontmatter, embeds, or Obsidian notes.

### PR creation or update — `reviewable-pr-workflow`
Load when opening a new PR, amending commits before review, or responding to review feedback that requires a force-push.

### PR review comments — `pr-comment-triage`
Load when the user provides a GitHub PR or review-discussion URL and asks to assess, address, or decide whether comments apply. Also load `reviewable-pr-workflow` when the result changes commits or PR structure.

### ddoc-managed documentation — `ddoc`
Load when creating or modifying Markdown with `ddoc:` frontmatter or `<!-- ddoc:... -->` directives, syncing code-adjacent docs to Confluence, or invoking the `ddoc` CLI. Also load `write` for prose changes.

### Prose and documentation — `write`
Load when drafting PR descriptions, design docs, runbooks, commit messages, or any freeform user-facing text that will be read by humans.

### Mermaid diagrams — `mermaid-best-practices`
Load when creating or editing any Mermaid diagram (`.mmd` files or ` ```mermaid ` blocks), or when adding diagrams to runbooks, design docs, or Confluence pages.

## Skill load checklist

Before editing, confirm each of these:

- [ ] Identified all file extensions and paths affected by the task.
- [ ] Loaded every skill whose trigger matches.
- [ ] For Go: confirmed whether any Kubernetes interaction is involved (controller-runtime, webhooks, `client-go`, `k8s.io/*`, `sigs.k8s.io/*`); loaded `k8s-controller-dev` if available, otherwise noted the missing skill and continued with `go-best-practices`.
- [ ] For Go CRD types: confirmed whether API type evolution is involved; loaded `k8s-api-design` if available, otherwise noted the missing skill and continued with `go-best-practices`.
- [ ] For Terraform/OpenTofu: confirmed whether any `.tf`, `.tfvars`, or Terragrunt `.hcl` file or state/plan workflow is involved; loaded `terraform-best-practices` if so.
- [ ] For Mermaid: confirmed whether any diagram is being created or modified; loaded `mermaid-best-practices` if so.
- [ ] Noted any conflicts between loaded skills and recorded which takes precedence.

If no trigger matches (e.g. pure YAML config or Helm), proceed without a best-practice skill and note that in chat.
