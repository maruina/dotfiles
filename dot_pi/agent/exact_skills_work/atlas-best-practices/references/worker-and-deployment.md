# Worker and Deployment Guidance
Detect the worker from current files before choosing tests, deployment validation, or connection configuration. Reuse the repository's existing Bazel, Rapid, deployment, and validation targets; do not prescribe one universal command.

## Detection sequence
1. At the worker root, inspect `rapid.json`. Confirm that it identifies an Atlas Go worker rather than another service type. Rapid Go workers use the Rapid path and are domain-based.
2. If there is no Rapid configuration, inspect `worker.go` and its worker bootstrap to identify a native Atlas Go worker.
3. Inspect the current deployment configuration for `atlas_domain` or `atlas_context`. The former identifies Atlas Domains; the latter identifies Atlas Classic.
4. Read nearby tests and build targets, then run the matching repository-native validation path.

Treat a domain partition identifier as opaque. Read it from the current configuration and pass it through without deriving, normalizing, or assuming its value. The deployment mode determines the connection and configuration path; do not mix Domains settings with Classic settings.

## Compatibility-sensitive operations
Schedules, checkpoints, and their identifiers can become observable workflow behavior. Before changing them, inspect generated contracts, existing workflow histories, deployment configuration, and tests. Keep identifiers and command ordering compatible or protect the change with the same version-gate and validation process used for workflow logic.
