---
name: skill-loader
description: Load the right best-practice skills before writing, reviewing, or planning code. Use this skill at the start of /execute, /plan, and /systematic-review to determine which language and domain skills to read based on affected files. Also defines the `Skills loaded and used` provenance record that lifecycle and review prompts report.
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

### AI-powered software — `typesafe-ai`
Load when designing, planning, reviewing, or implementing software that uses TypeSafe, including System One or Jev judgments, semantic classification, ranking, extraction, or other AI-backed decisions.

## Domain skills

### Atlas Go workflows — `atlas-best-practices`
Load when Go Atlas workflow, activity, worker, client, generated-client, or worker-bootstrap code changes; when Atlas Temporal proto definitions or options change; or when work involves determinism, version gates, Breaking Change Detection, replay tests, signals, queries, child workflows, Continue-As-New, retries, timeouts, schedules, checkpoints, or worker deployment configuration using `atlas_domain`, `atlas_context`, task queues, or Atlas worker routing.

For affected `.go` files, also load `go-best-practices`. Follow `atlas-best-practices` when Atlas SDK choice, workflow semantics, determinism, retry or timeout behavior, compatibility, or Atlas testing differs from ordinary Go guidance.

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

### Documentation — `diataxis`
Load when creating, organizing, or reviewing user documentation, including tutorials, how-to guides, reference pages, and explanations. Also load `write` and `humanizer` for prose.

### ddoc-managed documentation — `ddoc`
Load when creating or modifying Markdown with `ddoc:` frontmatter or `<!-- ddoc:... -->` directives, syncing code-adjacent docs to Confluence, or invoking the `ddoc` CLI.

### Prose — `humanizer` and `write`
Load both when drafting, editing, or reviewing human-readable prose, including documentation, PR descriptions, design docs, runbooks, commit messages, and other user-facing text. Use `write` for clarity and precision; use `humanizer` to remove AI-sounding patterns without changing the meaning.

### Presenterm slides — `presenterm`
Load when creating or editing Markdown presentations for presenterm.

### Mermaid diagrams — `mermaid-best-practices`
Load when creating or editing any Mermaid diagram (`.mmd` files or ` ```mermaid ` blocks), or when adding diagrams to runbooks, design docs, or Confluence pages.

## Skill load checklist

Before editing, confirm each of these:

- [ ] Identified all file extensions and paths affected by the task.
- [ ] Loaded every skill whose trigger matches.
- [ ] For Atlas: determined whether affected Go, proto, or deployment files define or invoke Atlas workflows; loaded `atlas-best-practices` when they do.
- [ ] For Go: confirmed whether any Kubernetes interaction is involved (controller-runtime, webhooks, `client-go`, `k8s.io/*`, `sigs.k8s.io/*`); loaded `k8s-controller-dev` if available, otherwise noted the missing skill and continued with `go-best-practices`.
- [ ] For Go CRD types: confirmed whether API type evolution is involved; loaded `k8s-api-design` if available, otherwise noted the missing skill and continued with `go-best-practices`.
- [ ] For Terraform/OpenTofu: confirmed whether any `.tf`, `.tfvars`, or Terragrunt `.hcl` file or state/plan workflow is involved; loaded `terraform-best-practices` if so.
- [ ] For Mermaid: confirmed whether any diagram is being created or modified; loaded `mermaid-best-practices` if so.
- [ ] Noted any conflicts between loaded skills and recorded which takes precedence.

If no trigger matches (e.g. pure YAML config or Helm), proceed without a best-practice skill and note that in chat.

## Provenance record
Lifecycle and review prompts report which skills they used under `Skills loaded and used`. The calling prompt names where the record goes; this section defines its content.

Record a skill only when its `SKILL.md` was read and its guidance was applied in the current stage. Include workflow skills such as `resolve-worktree` or `skill-loader` when their instructions were followed. Do not infer use from skills that were only available, named in this prompt, or listed in an upstream design, plan, or other artifact.

Use this table:

| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-name` | `skill-loader` / `prompt-required` / `user-requested` / `agent-selected` | [trigger] | [guidance applied] |

Sources:
- `skill-loader`: selected by a trigger in this skill.
- `prompt-required`: the calling prompt requires it.
- `user-requested`: the user asked for it.
- `agent-selected`: chosen outside this skill. Say why, because such a choice can show a missing trigger.

If no skill was used, say so explicitly. This provenance is feedback for improving `skill-loader`.
