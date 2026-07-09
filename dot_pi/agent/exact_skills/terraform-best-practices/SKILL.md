---
name: terraform-best-practices
description: Applies Terraform and OpenTofu best practices when writing, reviewing, planning, or debugging infrastructure-as-code. Use for .tf, .tfvars, .hcl, Terraform modules, providers, backends, state operations, Terragrunt, CI validation, policy checks, imports, moved blocks, and plan/apply workflows.
---
# Terraform Best Practices
Use for Terraform/OpenTofu code and state or plan workflows. Match the repository's conventions and keep infrastructure changes small. Never recommend a direct production apply without a reviewed plan artifact and explicit human approval.

## Start with context
Before changing behavior, identify:
- runtime and version (`terraform` or `tofu`),
- provider names and major versions,
- backend, workspace, and state isolation,
- execution path (local, CI, Atlantis, Terraform Cloud, etc.),
- environment criticality,
- whether the task can mutate state, destroy resources, rotate secrets, or affect many workspaces.

Proceed with stated assumptions for low-risk code edits. Stop and ask when a state-mutating, destructive, production-facing, or broad-blast-radius action is unclear.

## Guardrails
- Keep provider/runtime upgrades separate from behavior changes unless required.
- Use `for_each` with stable keys for collections. Use `count` only for optional singletons.
- Add `moved` blocks for resource/module address changes and verify the plan avoids destroy/recreate.
- Prefer declarative `import`, `moved`, and `removed` blocks over manual state surgery when supported.
- Never hardcode secrets in code, tfvars, examples, tests, docs, outputs, logs, or plan summaries.
- Mark secret-like variables and outputs `sensitive = true`, but remember state still stores values.
- Use least privilege IAM; explain unavoidable wildcards.
- Keep encryption, logging, deletion protection, and tagging defaults safe for production.

## Module design
- Separate root configurations from reusable modules.
- Keep modules small and single-purpose.
- Use conventional files unless the repo differs: `main.tf`, `variables.tf`, `outputs.tf`, `versions.tf`, `README.md`.
- Give every variable a `description` and explicit `type`.
- Use `validation` for important constraints: names, regions, CIDRs, enums, safety toggles.
- Use `nullable = false` when `null` must not override defaults.
- Prefer typed objects with `optional()` defaults over `map(any)`.
- Expose stable outputs consumers need. Avoid outputting whole resource objects unless established.

## State and plan safety
- Never use local state for team-owned or production infrastructure.
- Keep state scoped to one lifecycle, team, permission boundary, or update cadence.
- Before backend migrations, imports, removals, or manual state moves, confirm the backend/workspace, capture a backup or recovery path, and document rollback.
- Review a saved plan before production or shared-environment apply.
- Do not apply a different plan than the one reviewed.
- Do not use `-auto-approve` for production or destructive operations.
- Avoid `-target` except for recovery or tightly scoped operations; explain what it excludes.

## Validation
Run the repo's existing validation first. Common checks:

```bash
OTEL_TRACES_EXPORTER= terraform fmt -check -recursive
terraform init -backend=false
terraform validate
terraform plan -out=tfplan
terraform show tfplan
```

Use equivalent `tofu` commands for OpenTofu. Use `terraform init -backend=false` only for static validation when backend access is unavailable and providers/modules can still initialize.

## Review checklist
- [ ] Structure and names match the repo.
- [ ] Resource identity is stable; refactors use `moved` blocks when needed.
- [ ] No secrets were introduced into code, state, outputs, logs, examples, or docs.
- [ ] Version constraints and lockfile changes are intentional.
- [ ] Backend, workspace, and environment assumptions are explicit.
- [ ] Blast radius is limited to the requested scope.
- [ ] Validation or plan output is recorded, or the reason it could not run is clear.
- [ ] Rollback is described for risky changes.
