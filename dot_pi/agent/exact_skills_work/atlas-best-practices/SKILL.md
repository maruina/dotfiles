---
name: atlas-best-practices
description: Design, implement, review, and test Go Atlas workflows, activities, workers, generated clients, compatibility changes, and worker deployment configuration. Use for Atlas Temporal determinism, retries, timeouts, version gates, replay tests, schedules, checkpoints, and Rapid or native Go workers.
---
# Atlas Best Practices
Use this skill for Go Atlas authoring and review. For a running execution's status, history, input, or failure, use `atlas-workflows` instead.

## Start with current code
Before editing, inspect in this order:
1. Proto definitions and generated interfaces or clients.
2. Workflow and activity implementations.
3. Worker bootstrap and deployment configuration.
4. Existing tests and nearby production workers.

Current generated APIs take precedence over all written guidance. Current repository patterns come next; use these curated references only when code does not answer the question. Prefer Atlas-generated clients and test helpers over direct Temporal equivalents whenever Atlas provides an equivalent.

## Route by task
- Read [platform and SDK guidance](references/platform-and-sdk.md) for proto-first discovery, generated contracts, and cross-worker clients.
- Read [workflow authoring](references/workflow-authoring.md) for deterministic workflow code, activities, retries, timeouts, signals, queries, child workflows, and Continue-As-New.
- Read [compatibility and testing](references/compatibility-and-testing.md) before changing history-sensitive behavior or adding tests.
- Read [worker and deployment guidance](references/worker-and-deployment.md) to detect Rapid or native workers and Domains or Classic deployment modes.

## Non-negotiables
- Keep workflow code deterministic; move external side effects into activities.
- Make activities idempotent, give them explicit timeouts, and heartbeat long-running work.
- Bound and partition workflow histories: fan out high-volume work and drain signals before completion or Continue-As-New.
- Protect history-sensitive changes with monotonic version gates and evidence from Breaking Change Detection.
- Run the repository-native tests and validation for the detected worker and deployment mode.
