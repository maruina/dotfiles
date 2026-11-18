# Rex fork
`/rex-fork` opens an independent copy of the active Pi conversation branch in Rex. It does not send a model prompt or transfer approvals.

## Commands
Run one command in the source Pi TUI:

```text
/rex-fork tab
```

```text
/rex-fork right
```

```text
/rex-fork below
```

`tab` opens a new tab. `right` and `below` split the invoking pane horizontally or vertically. Rex focuses the destination. Creating a split ends an existing zoom in that window.

The source must be a local Rex TUI with a persisted conversation and an active persisted branch. Pi must be idle, with no pending messages, active UI prompt, or other fork operation. The extension checks the local socket, Rex server, session, pane, foreground process, and user before it creates a snapshot. It retains the source working directory and agent directory.

The command supports a directly foreground Pi process started with the installed Pi CLI, with no extra launch arguments other than `--session`. Custom wrappers and other flags are not replayed. The source conversation remains open and unchanged.

## Failure recovery
A refusal occurs before a Rex creation request. Correct the reported prerequisite before retrying. A snapshot preparation failure can leave a snapshot; the notification gives its path.

A `created/unverified` notification means the creation request might have succeeded, but the extension could not verify the destination. Do not immediately retry. Inspect the reported Rex block IDs, attempt directory, and snapshot path first. Rex might have opened a pane even if its response was lost. The extension does not retry, close a pane, or delete the snapshot.

Attempt metadata is stored in private directories under the effective Pi agent directory at `rex-fork-attempts/<attempt-id>/`. After inspecting a failed attempt, you can remove that specific attempt directory. Do not remove the snapshot as part of metadata cleanup: it is a separate Pi session file and might be in use. Successful attempts remove their transient metadata.

## Tests
From `dot_pi/agent`, run the deterministic suite:

```sh
node --experimental-strip-types --test exact_extensions/rex-fork/rex-fork.test.mjs
```

Run the opt-in integration suite to start a temporary Rex server and isolated Pi sessions:

```sh
PI_REX_FORK_SMOKE=1 node --experimental-strip-types --test exact_extensions/rex-fork/rex-fork.test.mjs
```

The smoke tests use a private socket, state, agent directory, session store, and working directory. They stop only the temporary server and remove only its test files. They do not send model prompts.

## Rollout and rollback
Coordinate deployment with any session publishing Pi configuration. After review and verification, preview and apply only the explicit extension target files from the feature worktree with `chezmoi --source "$PWD"`. Do not apply the full extension directory or global settings. Run `/reload` in an existing Pi session to register the command.

To roll back, remove only the deployed extension files through a corresponding source change, then run `/reload`. Existing fork tabs and session files remain; do not close or delete them automatically.
