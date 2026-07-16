# Sources
This package is curated and hand-maintained. It is not a vendored copy and has no synchronization workflow.

## Curation baseline
- Marketplace repository: `DataDog/claude-marketplace`
- Pinned commit: `6677680bfcb29ec9f79dbd021035f704d6844a8c`
- Selected Go guidance:
  - `atlas/skills/go-check-version-gate/SKILL.md`
  - `atlas/skills/go-replay-test/SKILL.md`
  - `atlas/skills/go-schedules/SKILL.md`
  - `atlas/skills/go-test/SKILL.md`
  - `atlas/docs/worker-detection.md`

## Targeted cross-checks
- Atlas concepts: <https://datadoghq.atlassian.net/wiki/spaces/ATLAS/pages/2650278317>
- Workflow determinism and version gates: <https://datadoghq.atlassian.net/wiki/spaces/ATLAS/pages/2715222385>
- Activity retries and timeouts: <https://datadoghq.atlassian.net/wiki/spaces/ATLAS/pages/5849318375>
- Atlas Domains and partitions: <https://datadoghq.atlassian.net/wiki/spaces/ATLAS/pages/5849973811>

## Precedence and boundaries
For implementation details, current `dd-source` code, generated interfaces, and nearby production workers take precedence over these sources. Keep this package Go-only, conceptual, and task-focused. Do not copy large templates, fixed repository commands, interaction mechanics from another agent, or runtime investigation instructions. `atlas-workflows` owns running-execution investigation.
