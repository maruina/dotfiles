---
name: terraform-best-practices
description: Applies Terraform and OpenTofu best practices when writing, reviewing, planning, or debugging infrastructure-as-code. Use for .tf, .tfvars, .hcl, Terraform modules, providers, backends, state operations, Terragrunt, CI validation, policy checks, imports, moved blocks, and plan/apply workflows.
---
# Terraform Best Practices

Use this skill when writing, reviewing, planning, or debugging Terraform/OpenTofu code.

Default to the repository's conventions. Make small, reviewable infrastructure changes. Never recommend a direct production apply without a reviewed plan artifact and explicit human approval.

This guidance is synthesized from:
- Anton Babenko's `terraform-skill`: https://github.com/antonbabenko/terraform-skill
- NickCrew's `terraform-best-practices`: https://github.com/NickCrew/Claude-Cortex/tree/main/skills/terraform-best-practices

## Start by Capturing Context

Before changing behavior, state assumptions explicitly:
- Runtime: `terraform` or `tofu`, and version if known.
- Provider names and major versions, especially AWS/GCP/Azure providers.
- Backend and state isolation model.
- Execution path: local, CI, Terraform Cloud, Atlantis, or another deployment system.
- Environment criticality: dev/staging/prod/shared control plane.
- Whether the task can mutate state, destroy resources, rotate secrets, or affect many workspaces.

If this context is missing and the action is low-risk code editing, proceed with assumptions. If the action is state-mutating, destructive, production-facing, or has unclear blast radius, stop and ask.

## Risk Categories

Identify which risks apply before proposing a fix:

| Risk | Common signals | Guardrail |
|---|---|---|
| Identity churn | `count` index changes, resource/module renames, module refactors | Use `for_each` for stable identity; use `moved` blocks for address changes |
| Secret exposure | Secrets in variables, defaults, tfvars, outputs, logs, or state | Keep secrets out of Terraform where possible; mark sensitive values; avoid printing plans with secrets |
| Blast radius | Shared state, broad selectors, global modules, prod changes | Split state/components; review plan; avoid unrelated changes |
| CI drift | Local plan differs from CI, unpinned versions, provider lock changes | Pin versions; commit lockfiles intentionally; validate in the same path CI uses |
| Compliance gaps | Missing policy/security checks, no approval evidence | Run repo-required policy checks and retain plan/review evidence |
| State corruption | Lock issues, backend migration, imports/removals | Prefer declarative `import`, `moved`, and `removed` blocks where supported; back up state before manual operations |
| Provider upgrade risk | Provider/runtime bump mixed with functional changes | Keep upgrade-only PRs separate from behavior changes |
| Testing blind spots | Plan-only checks for computed values, untested module contracts | Use `terraform test`, Terratest, or integration checks when static validation is insufficient |

## Code Organization

- Separate root configurations from reusable modules.
- Keep modules small and single-purpose; compose larger systems from smaller modules.
- Use conventional files unless the repo has a stronger pattern: `main.tf`, `variables.tf`, `outputs.tf`, `versions.tf`, and `README.md` for reusable modules.
- Prefer directory-based environment isolation for production (`env/prod/...`, `prod/...`) over Terraform workspaces unless the repo already standardizes on workspaces.
- Do not introduce Terragrunt, wrapper scripts, or new orchestration layers unless requested or already used.

## Module Design

- Give every input variable a `description` and explicit `type`.
- Use `validation` blocks for important constraints, especially names, regions, CIDRs, enum-like values, and safety toggles.
- Use `nullable = false` when `null` should not silently override defaults.
- Prefer typed objects with `optional()` defaults over untyped `map(any)`.
- Mark secret-like inputs and outputs `sensitive = true`, but remember this only masks display; it does not keep values out of state.
- Expose stable outputs that consumers need. Do not output whole provider resource objects unless the repo already does.
- Avoid unnecessary variables for values that are fixed by the module's purpose.

## Stable Resource Identity

- Use `count` only for optional singleton resources.
- Use `for_each` for collections that may be reordered, inserted into, or removed from.
- Prefer maps keyed by stable names over lists when identity matters.
- Never use list index as long-lived infrastructure identity if removing the middle item is plausible.
- When renaming resources/modules or moving them into modules, add `moved` blocks where supported and verify the plan shows no destroy/recreate.
- Do not replace a safe state move with a text-only address rename.

## State Management

- Never use local state for team-owned or production infrastructure.
- Keep state scoped to a coherent lifecycle. Split state when teams, permissions, environments, or update cadence differ.
- Do not mix broad unrelated resources into the same state just for convenience.
- Before backend migrations, imports, state removals, or manual state moves:
  - confirm the current workspace/backend,
  - capture a state backup or confirm versioned backend recovery,
  - document rollback steps,
  - avoid running state commands unless explicitly requested.
- Prefer declarative `import` blocks and `moved` blocks over imperative state surgery when the runtime supports them.

## Security

- Never hardcode secrets in `.tf`, `.tfvars`, examples, tests, or docs.
- Prefer external secret managers or runtime secret lookup over storing secret values in Terraform state.
- Avoid adding secret values to outputs, logs, CI artifacts, or plan summaries.
- Use least-privilege IAM and avoid broad wildcards unless the repo's pattern or API limitation requires them. If a wildcard is necessary, explain why.
- Keep encryption, logging, and deletion-protection defaults safe for production resources.
- Tag resources consistently with repo/team conventions for ownership and cost tracking.

## Version Management

- Pin Terraform/OpenTofu and provider versions consistently with the repository.
- Commit `.terraform.lock.hcl` intentionally when the repo tracks it.
- Keep provider/runtime upgrades separate from functional infrastructure changes unless the upgrade is required for the fix.
- Check the runtime floor before using newer features:
  - `moved` blocks: Terraform 1.1+
  - `optional()` defaults: Terraform 1.3+
  - `import` blocks and `check` blocks: Terraform 1.5+
  - native `terraform test`: Terraform 1.6+
  - `removed` blocks and mock providers: Terraform 1.7+
  - S3 native lock files: Terraform 1.10+
  - write-only arguments: Terraform 1.11+

## Validation

Run the repository's existing validation first. Do not invent a new validation stack if the repo already has one.

Common local checks:

```bash
OTEL_TRACES_EXPORTER= terraform fmt -check -recursive
terraform init -backend=false
terraform validate
terraform plan -out=tfplan
terraform show tfplan
```

Notes:
- In this environment, run `terraform fmt` with `OTEL_TRACES_EXPORTER=`.
- Use `terraform init -backend=false` only for static validation when backend access is unavailable and providers/modules can still initialize. Use the repo's normal init flow when plan accuracy matters.
- For OpenTofu, use equivalent `tofu` commands.
- For Datadog Terraform repos, prefer the repo's Makefile, CI scripts, or documented validation commands over generic commands.

## Testing

Choose the lightest test that catches the risk:

| Situation | Test approach |
|---|---|
| Formatting or syntax-only change | `fmt`, `validate`, repo lint |
| Module input/output logic | native `terraform test` when available |
| Provider-computed values or real cloud behavior | integration test or reviewed plan |
| Critical module behavior | Terratest or existing repo test harness |
| Security/compliance-sensitive resources | repo policy checks, Checkov/tfsec/Trivy if already used |
| CI configuration changes | run or inspect the exact CI job path |

For native tests, remember that plan-mode tests cannot reliably assert provider-computed values. Use apply-mode tests or an integration path when computed attributes matter.

## Safe Plan/Apply Workflow

- Always review a saved plan artifact before apply in production or shared environments.
- Do not re-run a different plan during apply if the workflow expects the reviewed plan artifact to be applied.
- Do not use `-auto-approve` for production or destructive operations.
- Do not run `terraform destroy` without first producing and reviewing `terraform plan -destroy` and getting explicit confirmation.
- Avoid `-target` except for recovery or tightly scoped operational work; explain what it excludes and why that is safe.
- Include rollback notes for any destructive, state-mutating, or provider-upgrade change.

## Review Checklist

Before finalizing Terraform changes, verify:

- [ ] The change matches existing repository structure and naming.
- [ ] Resource identity is stable; refactors use `moved` blocks when needed.
- [ ] No secrets were introduced into code, state, outputs, logs, examples, or docs.
- [ ] Version constraints and lockfile changes are intentional.
- [ ] State backend, workspace, and environment assumptions are explicit.
- [ ] Blast radius is limited to the requested scope.
- [ ] Validation commands were run or clearly documented if they could not run.
- [ ] The plan/apply path preserves review and approval boundaries.
- [ ] Rollback is described for risky changes.
