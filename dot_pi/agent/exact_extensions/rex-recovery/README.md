# Rex Pi recovery
Save exact Pi conversation references before a Rex update and restore them into Rex tabs afterward. The recovery commands use macOS process inspection. Both chezmoi profiles load the extension. Checkpointing, saving, and restoration do not make a model request.

## Enable
Apply the extension directory, `pi-save.fish`, and `pi-restore.fish` through chezmoi. After installing the updated recovery files, run `/reload` once in each Pi session that was already open. New Pi sessions load the extension at startup.

The extension saves a checkpoint at session startup, agent startup, and agent settlement. Headless sessions do not write checkpoints. Checkpoint failures produce a Pi warning. Existing conversations are not discovered from history automatically.

## Save before the update
Run `pi-save` before you update Rex. The command saves the matched open Pi conversations across the local Rex server, with their current session and tab labels. The snapshot replaces the previous snapshot, including when no Pi sessions are open.

If `pi-save` reports an unmatched or ambiguous pane, inspect that pane. Run `/reload` in an uncheckpointed Pi, then retry `pi-save`. If process inspection or saving fails, the previous snapshot is retained. A checkpoint directory without a snapshot is not a recovery set.

## Restore
After the Rex update, run `pi-restore` to preview the snapshot. Run `pi-restore --apply` to restore it. Add `--json` to either recovery command for machine-readable output; piped output is JSON by default. Use `pi-save --help` and `pi-restore --help` for the command contracts.

Restore uses only the saved snapshot, not historical checkpoints or the most recent conversation in a directory. It skips an already-open conversation and launches each saved file at most once. It reports missing conversation files as `missing-file` and missing working directories as `missing-cwd`. A missing or invalid snapshot stops restore; an empty snapshot has no conversations to restore.

Restore can reuse an idle Fish pane after checking its foreground process group. It leaves occupied panes unchanged. Missing resources are recreated as Fish-backed tabs with the saved session grouping and labels. When Pi exits, the Fish shell remains open. Split geometry is not restored. An untracked Pi or ambiguous foreground group blocks apply; inspect the pane and run `/reload` in an uncheckpointed Pi before retrying.

**Do not type in or otherwise use target panes while restore runs.** Rex has no atomic run-if-idle operation. The command rechecks the foreground process before sending, but cannot prevent a program from starting between that check and input delivery. Shell input already typed in a pane is not detected; leave target prompts empty before applying.

## Stored state and failures
Private checkpoint files and the separate `snapshot` file are under `${XDG_STATE_HOME:-~/.local/state}/pi/rex-recovery/`. They contain conversation paths, launch directories, Rex host and resource IDs, labels, and process identities. They do not contain prompts, responses, or credentials. Each pane has one checkpoint; a restored Pi retains its checkpoint identity when Rex gives it a new pane ID.

The last checkpoint remains after Pi exits, but `pi-save` selects only matched live Pi processes. Historical checkpoints are not restore candidates. The commands refuse more than 1,000 checkpoints or a corrupt checkpoint instead of silently omitting it. Checkpoint retention is manual; there is no background service or polling.

Before launching, restore writes an `<id>.pending` marker. Pi removes this marker when it saves its next checkpoint. If a launch fails or times out, restore does not retry it automatically. Inspect the target pane first. If Pi is open, run `/reload`. If no instance of that conversation exists, remove only its `.pending` marker, then preview and apply again. The JSON record supplies the conversation path and labels for this check.

`pi-save` and `pi-restore --apply` share `.restore-lock`. A crashed command can leave that lock behind. Check that no save or restore process is running before removing it. Do not remove pending markers or locks merely to force a retry after an uncertain result.

A snapshot for another host or endpoint is rejected. When a command reads corrupt checkpoints, it stops and identifies the file to inspect. A stopped Rex server must be started separately; the commands do not autostart one. Partial failures retain checkpoints and launch reservations. JSON errors include completed results.

Restoration opens saved conversations. It does not resume tools, tests, or other processes that ended with the server. Restored tabs are not automatically focused in an app.

## Validation
Run `npm run test:rex-recovery` from the agent directory. Run `node --test exact_extensions/rex-recovery/smoke.test.mjs` from the source agent directory for a private-server integration test. The smoke uses an isolated Rex socket/state directory and a temporary Pi agent directory; it opens Pi without submitting a prompt. It does not stop the user's Rex server.

Full macOS logout, reboot, and forced power loss are manual validation cases. Remove the managed extension and Fish functions to disable the feature; checkpoints can be retained for later recovery.
