# Rex Pi recovery
Save exact Pi conversation references and restore them into Rex tabs. Both chezmoi profiles load this extension. No model request is made by checkpointing or restoration.

## Enable
Apply the extension directory and `pi-restore.fish` through chezmoi. Run `/reload` in each open Pi session. A checkpoint is saved at session startup, agent startup, and agent settlement. Headless sessions do not write checkpoints. Checkpoint failures produce a Pi warning.

Existing conversations are not discovered from history automatically. Each open Pi session must load the extension before it can be restored.

## Restore
Run `pi-restore` to preview. Run `pi-restore --apply` to restore. Add `--json` for machine-readable output; piped output is JSON by default. Use `pi-restore --help` for the command contract.

The command uses the exact saved file, not the most recent conversation in a directory. Existing Fish panes can be reused when their foreground process is still the same shell. Missing resources are recreated as tabs with saved session grouping and labels. Split geometry is not restored. Other running programs are left unchanged. An untracked running Pi blocks apply: run `/reload` in that Pi before retrying.

**Do not type in or otherwise use target panes while restore runs.** Rex has no atomic run-if-idle operation. The command rechecks the foreground process before sending, but cannot prevent a program from starting between that check and input delivery. Shell input already typed in a pane is not detected; leave target prompts empty before applying.

## Stored state and failures
Records are private JSON files under `${XDG_STATE_HOME:-~/.local/state}/pi/rex-recovery/`. They contain the conversation path, launch directory, Rex host/endpoint and resource IDs, labels, process ID, and checkpoint time. They do not contain prompts, responses, or credentials. Each pane has one record; a restored Pi retains its record identity when Rex gives it a new pane ID.

The last record remains after Pi exits, because Pi cannot reliably distinguish deliberate exit from logout. Remove an unwanted record to stop offering it for recovery. The command refuses more than 1,000 records or any corrupt record rather than silently omitting it. Retention is manual; there is no background service or polling.

Before launching, restore writes an `<id>.pending` marker. Pi removes this marker when it saves its next checkpoint. If a launch fails or times out, restore does not retry it automatically. Inspect the target pane first. If Pi is open, run `/reload`. If no instance of that conversation exists, remove only its `.pending` marker, then preview and apply again. The JSON record supplies the conversation path and labels for this check.

Concurrent apply attempts are refused by `.restore-lock`. A crashed restore can leave that lock behind. Check that no restore process is running before removing it. Do not remove pending markers or locks merely to force a retry after an uncertain result.

Records for another host or endpoint are not restored. Corrupt records block apply and identify the file to inspect. A stopped Rex server must be started separately; the command does not autostart one. Partial failures retain checkpoints and launch reservations. JSON errors include completed results.

Restoration opens saved conversations. It does not resume tools, tests, or other processes that ended with the server. Restored tabs are not automatically focused in an app.

## Validation
Run `npm run test:rex-recovery` from the agent directory. Run `node --test exact_extensions/rex-recovery/smoke.test.mjs` from the source agent directory for a private-server integration test. The smoke uses an isolated Rex socket/state directory and a temporary Pi agent directory; it opens Pi without submitting a prompt. It does not stop the user's Rex server.

Full macOS logout, reboot, and forced power loss are manual validation cases. Remove the managed extension and Fish function to disable the feature; checkpoints can be retained for later recovery.
