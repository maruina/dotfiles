# Kubernetes Pod Eviction Investigation Skill Implementation Plan
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a portable, read-only Pod eviction investigation skill from the requested Obsidian note and add it to `skill-loader`.
**Smallest user-feedback slice:** One shared skill available to both profiles, with evidence-based classification and loader routing.
**Out of Scope:** Cluster changes, remediation automation, changes to work-only skills, and edits to the Obsidian note.
**Architecture:** Use the existing shared `exact_skills` directory. Keep the investigation procedure in `SKILL.md` and mechanism details in a relative reference file. Do not duplicate the skill in profile-specific directories.
**Tech Stack:** Markdown, Pi skills, chezmoi, existing Node validators.

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | prompt-required | Plan skill routing | Selected documentation and chezmoi guidance |
| `codebase-research` | skill-loader | Unfamiliar skill loading | Checked profile settings, ignore rules, validator, and Pi discovery |
| `chezmoi` | skill-loader | Managed files | Shared source directory and explicit worktree source |
| `feature-worktree` | prompt-required | Source writes | Created feature worktree from updated main |
| `obsidian-cli` | agent-selected | User named a vault page | Read the exact note through the CLI |
| `obsidian-markdown` | skill-loader | Obsidian source | Preserved the source note; did not rewrite it |
| `write` | skill-loader | Prose | Direct, evidence-based instructions |
| `diataxis` | skill-loader | Investigation documentation | Separate procedure from mechanism reference |
| `script-best-practices` | agent-selected | Shell examples | Fish syntax, explicit context, quoted arguments, bounded requests |
| `learning-lookup` | prompt-required | Advisory planning guidance | Used initialized chezmoi config for profile rendering |

### Execution
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | prompt-required | Affected-file routing | Selected chezmoi and prose skills |
| `chezmoi` | skill-loader | Managed source | Rendered explicit targets with both profiles |
| `write` | skill-loader | Skill prose | Removed unsupported guarantees and required evidence |
| `diataxis` | skill-loader | Investigation guide | Kept procedure separate from mechanism reference |
| `script-best-practices` | agent-selected | Fish examples | Explicit contexts/timeouts; parsed examples without execution |
| `codebase-research` | skill-loader | Discovery integration | Checked Pi's public loader and existing validators |
| `feature-worktree` | prompt-required | Implementation writes | Kept edits in the feature worktree |

## Scope
Small/direct: one bounded skill addition and one loader entry. Started directly from `/plan` because the requested design is clear. No design document is required.

Sources: `k8s controllers/Every pod eviction in Kubernetes, explained.md` in the main Obsidian vault; Ahmet Alp Balkan's linked article; official Kubernetes docs; Kubernetes v1.32.0 source for kubelet rejection, Pod workers, taint eviction, and PodGC.

Current patterns: `dot_pi/agent/exact_skills` maps to `~/.pi/agent/skills` in both profiles. Profile settings add profile-specific directories; they do not replace shared discovery. `.chezmoiignore` excludes only the opposite profile's directory. Skill names and descriptions are validated by the existing validator.

- [x] Create `dot_pi/agent/exact_skills/k8s-pod-evictions/SKILL.md` and `references/mechanisms.md`.
  - Cover Eviction API, direct deletion, hard/soft pressure, NoExecute taints, kubelet admission after restart, scheduler preemption, and Node deletion/PodGC.
  - Require cluster, namespace, Pod UID, node identity, UTC time range, version, causal timeline, actor evidence, and confidence.
  - Separate API object deletion from process termination and OOM/container restarts from Pod eviction.
  - Keep reads scoped and bounded; prohibit remediation without explicit authorization. Work-only tools must be optional.
  - Cite sources and correct the note's conflicting grace-period statements without assuming every release behaves like v1.32.
- [x] Add an investigation trigger under Domain skills in `dot_pi/agent/exact_skills/skill-loader/SKILL.md`.
- [x] Inspect repository and agent `AGENTS.md`; no guidance update is needed because source paths and validation commands are already documented.
- [x] Run the checks below and review the complete diff. Use `feat(pi): add Kubernetes pod eviction investigation skill` for the implementation commit after verification permits completion.
- [x] Independent verification completed in a fresh session; applied the three explicit target files, committed the implementation, and pushed directly to `main` per user instruction.

## Validation
- GIVEN either profile, WHEN chezmoi renders the explicit shared skill paths, THEN the same complete skill and reference SHALL be present. Check with `chezmoi --source "$PWD" --override-data '{"profile":"work"}' cat <target>` and the personal equivalent; compare output bytes.
- GIVEN an eviction investigation, WHEN the loader is read, THEN it SHALL route to `k8s-pod-evictions`. Inspect the loader entry and skill frontmatter; run `npm run test:skills:profiles`.
- GIVEN only OOMKilled, a failed eviction request, or missing audit history, WHEN the skill is followed, THEN it SHALL NOT claim a confirmed Pod eviction or responsible actor without supporting evidence. Review these cases against the written procedure.
- Review all eight mechanism rows against the source note and official sources; require correct PDB and grace-period distinctions and explicit uncertainty for version-sensitive behavior.
- No new automated content-matching tests: existing validators check discovery metadata; fixed keyword assertions would not establish investigation correctness. Semantic review covers causal reasoning and false attribution.
- Run `npm ci --ignore-scripts` under `dot_pi/agent`, then `npm test`, `npm run test:all`, and `npm run test:skills:profiles`. Keep dependencies until both full commands complete, then remove the worktree dependency directory.
- Run `git diff --check` and explicit-file `chezmoi --source "$PWD" diff` for the skill, reference, and loader. Do not apply broad directory targets.
- Final independent `/verify` requires a fresh session and a model different from the implementation model. Do not claim that execution checks replace that gate.

## Execution evidence
- `npm test` and `npm run test:all` passed: 296 automated tests per run, skill/dependency validators, and offline extension smoke check. The offline smoke check emitted model-availability warnings; it made no model request.
- `npm run test:skills:profiles` passed for both profiles: 45 skills validated per profile.
- `chezmoi cat` for each of the three explicit targets produced byte-identical work/personal output, also identical to the source files.
- Pi's public `loadSkillsFromDir` discovered exactly one auto-selectable `k8s-pod-evictions` skill. Its relative reference resolved; both Fish command blocks passed `fish --no-execute` without cluster access.
- Reviewed the targeted chezmoi diff and all eight mechanisms, including negative cases for OOMKilled, rejected/dry-run requests, missing history, and disconnected-node API cleanup. `git diff --check` passed.
- `npm ci --ignore-scripts` reported seven dependency vulnerabilities (three low, two moderate, two high). No dependency was changed; this existing package issue is outside the skill request.
- The first advisory lookup used the source helper before dependencies were installed and failed. The rendered helper succeeded and supplied the initialized-config guidance recorded above.
- No cluster was queried. The user confirmed that independent verification completed in a fresh session. This execution reran both-profile skill validation and rendering, applied the three explicit target files, and confirmed byte-for-byte source/target matches. The first apply attempt found the new target directory missing; created that directory and reran apply successfully. Per the user's explicit instruction, push directly to `main` instead of opening a draft PR.
- Dependency cleanup was blocked by compute guardrails, which require manual recursive deletion. The worktree's ignored `dot_pi/agent/node_modules` remains available for independent tests; remove it manually after verification. Do not bypass the guardrail.

## Safety and completion
No executable integration, new dependency, or production access is needed. Shell examples require an explicit context and request timeout. Missing permissions, expired credentials, deleted objects, or expired events are evidence gaps, not reasons to mutate infrastructure.

Rollout: after independent verification, apply only the three changed target files, commit the source changes, and push the feature branch under the repository completion policy. Rollback: revert the implementation commit and reapply the same explicit paths. The skill and loader are the documentation deliverables; other docs need no update.

## Planning review
No blocking findings. A single skill file would reduce file count, but separating the longer classification reference keeps the main procedure focused. Do not add provider-specific integrations or duplicate profile copies.
