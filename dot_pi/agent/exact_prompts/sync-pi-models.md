---
description: Sync refreshed Pi models into the chezmoi models template
---
Reconcile refreshed Pi models from `~/.pi/agent/models.json` into the chezmoi source template at `~/.local/share/chezmoi/dot_pi/agent/models.json.tmpl`.

Context:
- `/refresh-models` updates the rendered target file, not the chezmoi source template.
- `models.json` is a templated chezmoi target. Do not use `chezmoi re-add ~/.pi/agent/models.json`.
- The template has separate `.profile == "work"` and `.profile == "personal"` branches.

Classify each refreshed provider before editing:
- Treat a provider as **work** if its `baseUrl` points at Datadog infrastructure, especially `https://ai-gateway.us1.ddbuild.io` or `https://ai-gateway.us1.prod.dog`.
- Also treat a provider as **work** if its headers include `"x-dd-tag-dd.user_email": "matteo.ruina@datadoghq.com"`.
- Treat all other providers as **personal**.
- If the URL and headers disagree, stop and ask before editing.

Workflow:
1. Inspect the drift: `chezmoi diff ~/.pi/agent/models.json`. From this initial diff, record provider/model ID additions and removals for the final summary.
2. Edit only the source template: `~/.local/share/chezmoi/dot_pi/agent/models.json.tmpl`.
3. Sync work providers only into the `.profile == "work"` branch.
4. Sync personal providers only into the `.profile == "personal"` branch.
5. Preserve credentials, shell commands, 1Password references, comments, and template logic already present in the template unless the refreshed model metadata requires a change.
6. Verify the rendered template against the refreshed target: `chezmoi execute-template < ~/.local/share/chezmoi/dot_pi/agent/models.json.tmpl | diff -u - ~/.pi/agent/models.json`.
7. Run `node --experimental-strip-types --test exact_extensions/lifecycle-model-recommender/_policy.test.ts` from `~/.local/share/chezmoi/dot_pi/agent`.
   - The policy source is `exact_extensions/lifecycle-model-recommender/_policy.ts`; use it only as a reference.
   - Do not edit `_policy.ts`. New catalog entries are review candidates, not automatic lifecycle replacements. Lifecycle-role changes belong to a future out-of-band policy-update prompt.
   - If the test reports a missing provider/model identity or unsupported thinking level, stop before applying or declaring synchronization complete. Report the incompatible policy choice and direct the user to the out-of-band policy-update prompt. Do not infer a replacement from model names, recency, provider, context size, or reasoning metadata.
8. Verify chezmoi drift: `chezmoi diff ~/.pi/agent/models.json`.
9. Apply the reconciled template: `chezmoi apply ~/.pi/agent/models.json`.

When summarizing the work, state which profile branch changed, why each changed provider was classified as work or personal, and the provider/model ID additions and removals from the initial diff.
