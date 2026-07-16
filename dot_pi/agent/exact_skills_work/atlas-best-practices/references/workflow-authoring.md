# Workflow Authoring
Workflow code replays from history. Use `workflow.Context` and workflow-safe APIs inside a workflow; ordinary activity code uses ordinary context. Do not call nondeterministic APIs directly from workflow code.

## Deterministic workflow code
- Use workflow-safe time, timers, selectors, futures, channels, and concurrency constructs.
- Never read wall-clock time, randomness, environment state, or external services directly in a workflow.
- Sort keys before iterating a map or otherwise make iteration order stable.
- Serialize errors through supported workflow or activity boundaries; do not depend on process-local error state.
- Put external side effects, remote calls, and nondeterministic work in activities.

## Activity reliability
Activities can execute at least once. Make every activity idempotent and safe to retry. Classify errors deliberately: return non-retryable failures only for permanent input or business failures; leave transient failures retryable.

Set explicit activity timeout fields for the operation:
- `schedule_to_close_timeout` bounds the entire attempt lifecycle.
- `start_to_close_timeout` bounds one execution attempt.
- `heartbeat_timeout` detects a stalled long-running activity.

Heartbeat long-running activities with useful progress. Ensure retries and timeout budgets match the external system and its idempotency mechanism.

## Workflow controls
Do not configure a workflow retry policy by default. A workflow-level retry can replay orchestration and multiply side effects unless the design explicitly requires it. Define workflow execution and run timeouts according to the worker's existing pattern.

Use signals for durable asynchronous input and queries only for read-only workflow state. Preserve deterministic ordering when signals affect workflow decisions. Use generated clients for child workflows, wait for the correct lifecycle result, and treat child start and command-order changes as history-sensitive. Use Continue-As-New before history or in-memory state grows without bound; carry forward only the state needed by the next run.
