# Workflow Authoring
Workflow code replays from history. Use `workflow.Context` and workflow-safe APIs inside a workflow; ordinary activity code uses ordinary context. Do not call nondeterministic APIs directly from workflow code.

## Deterministic workflow code
- Use workflow-safe time, timers, selectors, futures, channels, and concurrency constructs.
- Never read wall-clock time, randomness, environment state, or external services directly in a workflow.
- Sort keys before iterating a map or otherwise make iteration order stable.
- Serialize errors through supported workflow or activity boundaries; do not depend on process-local error state.
- Put external side effects, remote calls, and nondeterministic work in activities.

## Workload fit and fan-out
Do not use Atlas as a retry wrapper around a simple CRUD or HTTP API; use Rapid or established service retry patterns when durable orchestration is not needed. Do not use a workflow as a high-throughput message queue.

Atlas scales with workflow executions, not activity count or concurrent updates to one history. Partition high-volume signals by workflow ID. For large fan-out, batch work or use a tree of child workflows rather than starting thousands of concurrent activities or children from one execution.

## Activity reliability
Activities can execute at least once. Make every activity idempotent and safe to retry. Classify errors deliberately: return non-retryable failures only for permanent input or business failures; leave transient failures retryable.

Set explicit activity timeout fields for the operation:
- `schedule_to_close_timeout` bounds the entire attempt lifecycle.
- `start_to_close_timeout` bounds one execution attempt.
- `heartbeat_timeout` detects a stalled long-running activity.

Heartbeat long-running activities with useful progress. Ensure retries and timeout budgets match the external system and its idempotency mechanism.

Use regular activities by default. Use local activities only for work that is short even after retries and does not need normal activity queuing, routing, rate limiting, or flow control; local activity execution consumes workflow-task time.

## Workflow controls
Do not configure a workflow retry policy by default. A workflow-level retry can replay orchestration and multiply side effects unless the design explicitly requires it. Define workflow execution and run timeouts according to the worker's existing pattern.

Bound history before it approaches the platform limit. Use Continue-As-New and carry forward the serializable state required to resume work. Confirm the current history warning and termination thresholds from platform documentation or the worker's configuration; do not assume old thresholds remain current.

Use signals for durable asynchronous input. Preserve deterministic ordering when signals affect workflow decisions. Before completing or Continuing-As-New, drain received signals and let their handlers finish so signals already delivered to the worker are not lost.

Model expected validation, user-input, and configuration outcomes in the workflow response or status instead of returning a workflow error. Return an error for genuine infrastructure or unrecoverable system failures so workflow error rates remain operationally meaningful.

Use generated clients for child workflows, wait for the correct lifecycle result, and treat child start and command-order changes as history-sensitive.

## External interactions
Use queries only for infrequent, read-only inspection or debugging. A query can replay workflow history, so do not place it on a hot path or use it as a backing datastore.

HTTP handlers should asynchronously start long-running workflows and return promptly. Persist workflow results in an appropriate store and expose a separate result endpoint instead of holding an HTTP request open until completion.
