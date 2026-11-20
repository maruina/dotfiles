# Cache Expectations, Channel Deadlocks, and Long-Running Operations

Cache staleness, channel deadlocks, and long-running operations — patterns for coordinating state across boundaries.

## Expectations Pattern

### The Problem: Cache Staleness

Controller-runtime's client caches resources locally and relies on API server watches to stay updated. Nothing invalidates the cache manually. The resulting timing window looks like:

1. Delete a Pod
2. List all Pods: the deleted Pod is still in the cache (not marked for termination)
3. List all Pods later: the Pod is correctly gone

These steps often span multiple reconciliation attempts. Step 2 is dangerous when coordinating with external systems or controlling parallel operations.

**Concrete failures without expectations:**
- Delete more than one master node at a time
- Exceed changeBudget during scale operations
- Clear shard allocation excludes before node removal completes
- Update zen2 initial_master_nodes based on stale Pod counts
- Clear voting_config_exclusions while a Pod restart is in progress

### When You Need Expectations

Most situations are fine with Kubernetes optimistic locking:
- Creating an existing resource → operation fails
- Updating an out-of-date resource → operation fails
- Deleting a non-existent resource → operation fails

**Use expectations only when:**
1. **Coordinating with external systems** that have their own orchestration (databases, service meshes)
2. **Controlling parallel operations** (limiting concurrent creates/deletes/upgrades)

### Two Types of Expectations

#### 1. Generation Expectations

Track resource updates via the `Generation` field. Use when you update a StatefulSet spec and need to ensure the cache reflects the change before proceeding.

```go
// ExpectedGenerations tracks resource generations we expect in cache.
// Safe for concurrent reconcilers (MaxConcurrentReconciles > 1).
type ExpectedGenerations struct {
    mu          sync.Mutex
    client      k8s.Client
    generations map[types.NamespacedName]ResourceGeneration
}

type ResourceGeneration struct {
    UID        types.UID
    Generation int64
}

// Record expectation after updating a resource
func (e *ExpectedGenerations) ExpectGeneration(object metav1.Object) {
    key := types.NamespacedName{Namespace: object.GetNamespace(), Name: object.GetName()}
    e.mu.Lock()
    e.generations[key] = ResourceGeneration{
        UID:        object.GetUID(),
        Generation: object.GetGeneration(),
    }
    e.mu.Unlock()
}

// Check if expectations are satisfied
func (e *ExpectedGenerations) generationSatisfied(name types.NamespacedName, expected ResourceGeneration) (bool, error) {
    var cached MyResource
    if err := e.client.Get(ctx, name, &cached); err != nil {
        if apierrors.IsNotFound(err) {
            return true, nil  // Resource deleted
        }
        return false, err
    }
    if cached.GetUID() != expected.UID {
        return true, nil  // Replaced by new resource
    }
    return cached.GetGeneration() >= expected.Generation, nil
}
```

#### 2. Deletion Expectations

Track Pod deletions by UID. Use when you delete a Pod during rolling upgrades and need to ensure it's gone before proceeding.

```go
// ExpectedPodDeletions tracks Pods we deleted but may still be in cache.
// Safe for concurrent reconcilers (MaxConcurrentReconciles > 1).
type ExpectedPodDeletions struct {
    mu           sync.Mutex
    client       k8s.Client
    podDeletions map[types.NamespacedName]types.UID
}

// Record expectation when deleting a Pod
func (e *ExpectedPodDeletions) ExpectDeletion(pod corev1.Pod) {
    e.mu.Lock()
    e.podDeletions[k8s.ExtractNamespacedName(&pod)] = pod.UID
    e.mu.Unlock()
}

// Clear expectation on failed deletion
func (e *ExpectedPodDeletions) ClearDeletion(pod corev1.Pod) {
    e.mu.Lock()
    delete(e.podDeletions, k8s.ExtractNamespacedName(&pod))
    e.mu.Unlock()
}

// Check if deletion is visible in cache
func podDeleted(client k8s.Client, pod types.NamespacedName, uid types.UID) (bool, error) {
    var cached corev1.Pod
    if err := client.Get(ctx, pod, &cached); err != nil {
        if apierrors.IsNotFound(err) {
            return true, nil  // Pod removed
        }
        return false, err
    }
    // Pod may have been recreated with different UID
    return cached.UID != uid, nil
}
```

### Usage Pattern

```go
type MyReconciler struct {
    client.Client
    Expectations *Expectations  // Combines generation + deletion expectations
}

func (r *MyReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    // Check expectations BEFORE making decisions based on cache
    satisfied, reason, err := r.Expectations.Satisfied()
    if err != nil {
        return ctrl.Result{}, err
    }
    if !satisfied {
        log.Info("waiting for cache to catch up", "reason", reason)
        return ctrl.Result{RequeueAfter: 5 * time.Second}, nil
    }

    // Safe to proceed - cache reflects our previous writes
    // ...
}

func (r *MyReconciler) deletePod(ctx context.Context, pod *corev1.Pod) error {
    // Record expectation BEFORE deleting
    r.Expectations.ExpectDeletion(*pod)

    if err := r.Delete(ctx, pod); err != nil {
        r.Expectations.ClearDeletion(*pod)
        return err
    }
    return nil
}

func (r *MyReconciler) updateStatefulSet(ctx context.Context, sts *appsv1.StatefulSet) error {
    if err := r.Update(ctx, sts); err != nil {
        return err
    }
    // Record expectation AFTER successful update (Generation is set by API server)
    r.Expectations.ExpectGeneration(sts)
    return nil
}
```

### Operator Restart Behavior

All in-memory expectations are lost if the operator restarts. This is acceptable because the operator re-populates its cache from the API server, which reflects any create/update/delete operations performed before the restart.

### Self-Clearing Expectations

Expectations automatically clear themselves when satisfied:

```go
func (e *ExpectedGenerations) PendingGenerations() ([]string, error) {
    e.mu.Lock()
    snapshot := make(map[types.NamespacedName]ResourceGeneration, len(e.generations))
    for k, v := range e.generations {
        snapshot[k] = v
    }
    e.mu.Unlock()

    var pending []string
    var satisfied []types.NamespacedName
    for name, expected := range snapshot {
        ok, err := e.generationSatisfied(name, expected)
        if err != nil {
            return nil, err
        }
        if ok {
            satisfied = append(satisfied, name)
        } else {
            pending = append(pending, name.Name)
        }
    }

    if len(satisfied) > 0 {
        e.mu.Lock()
        for _, name := range satisfied {
            delete(e.generations, name)
        }
        e.mu.Unlock()
    }
    return pending, nil
}
```

### Reference Implementations

- [Kubernetes ReplicaSet controller](https://github.com/kubernetes/kubernetes/blob/main/pkg/controller/controller_utils.go#L115) - Original expectations implementation
- [ECK operator](https://github.com/elastic/cloud-on-k8s/tree/main/pkg/controller/common/expectations) - Generation + deletion tracking for Elasticsearch coordination
- [Cluster API](https://github.com/kubernetes-sigs/cluster-api) - Machine creation/deletion expectations

**Key difference**: Kubernetes' Deployment controller uses watch events to track creations/deletions. ECK inspects cache on demand, which is simpler but less efficient.

## WatchesRawSource / source.Channel Deadlock

### The Problem

`WatchesRawSource` with `source.Channel` triggers reconciliation of arbitrary objects by sending `GenericEvent` values into a buffered channel. The pattern has a hard deadlock when events exceed the combined buffer capacity.

The pipeline has two bounded channels:

1. **User-created channel** (typically `make(chan event.GenericEvent, 1024)`)
2. **controller-runtime internal `dst` channel** (also buffered at 1024, created inside `source.Channel`)

The internal [`distribute()`](https://github.com/kubernetes-sigs/controller-runtime/blob/main/pkg/source/source.go#L235-L247) function does a **bare channel send** to `dst` with no `select` guard. The deadlock sequence:

1. Reconcile goroutine sends events into the user channel (fills at 1024)
2. `syncLoop` goroutine reads from user channel, calls `distribute()` into `dst`
3. `dst` fills at 1024 — `distribute()` blocks
4. `syncLoop` can no longer drain the user channel
5. Reconcile goroutine blocks on the next send into the full user channel
6. The reconciler worker is now stuck — it cannot process workqueue items that would drain `dst`

Total buffering: **2048 events**. Any O(N) fan-out with N > 2048 deadlocks.

### Why Common Mitigations Don't Work

| Mitigation | Issue |
|------------|-------|
| `select` with `ctx.Done()` | Converts hang to cancellation failure — data loss |
| `select` with `default` (drop) | Silently drops events — reconciliation never happens |
| Larger buffer | Postpones the problem — N grows with the cluster |

All three mitigations treat the symptom (blocking send) rather than the cause (bounded channel for unbounded fan-out).

### The Fix: Watches + EnqueueRequestsFromMapFunc

Replace the channel-based fan-out with a watch predicate that returns requests directly to the workqueue:

```go
// BEFORE (deadlocks at scale):
type MyReconciler struct {
    client.Client
    queueRequest chan event.GenericEvent  // ← bounded channel
}

func (r *MyReconciler) SetupWithManager(mgr ctrl.Manager) error {
    r.queueRequest = make(chan event.GenericEvent, 1024)
    return ctrl.NewControllerManagedBy(mgr).
        For(&corev1.Namespace{}).
        WatchesRawSource(
            source.Channel(r.queueRequest, &handler.EnqueueRequestForObject{}),
        ).
        Complete(r)
}

func (r *MyReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    // ... on trigger condition, fan out:
    var nsList corev1.NamespaceList
    r.Client.List(ctx, &nsList)
    for _, ns := range nsList.Items {
        r.queueRequest <- event.GenericEvent{Object: &ns}  // ← blocks when full
    }
    return ctrl.Result{}, nil
}
```

```go
// AFTER (no deadlock):
func (r *MyReconciler) SetupWithManager(mgr ctrl.Manager) error {
    return ctrl.NewControllerManagedBy(mgr).
        For(&corev1.Namespace{}).
        Watches(
            &corev1.Namespace{},
            handler.EnqueueRequestsFromMapFunc(r.enqueueAllNamespaces),
            builder.WithPredicates(triggerConditionChanged()),
        ).
        Complete(r)
}

func (r *MyReconciler) enqueueAllNamespaces(ctx context.Context, _ client.Object) []reconcile.Request {
    var nsList corev1.NamespaceList
    if err := r.Client.List(ctx, &nsList); err != nil {
        ctrl.LoggerFrom(ctx).Error(err, "listing namespaces for fan-out")
        return nil
    }
    requests := make([]reconcile.Request, 0, len(nsList.Items))
    for _, ns := range nsList.Items {
        requests = append(requests, reconcile.Request{
            NamespacedName: client.ObjectKeyFromObject(&ns),
        })
    }
    return requests
}
```

Why this works:
- **No intermediate channel**: `[]reconcile.Request` goes directly into the workqueue
- **Native deduplication**: The workqueue deduplicates by key — duplicate requests are no-ops
- **Cache-backed List**: `r.Client.List()` reads from the informer cache — O(N) in memory, no API server call
- **Narrow trigger**: The predicate constrains when the fan-out fires (e.g., only when a specific annotation changes on a specific object)

### When source.Channel Is Still Appropriate

`source.Channel` remains valid for external event sources where no Kubernetes watch exists:
- Webhooks from external systems
- Message queue consumers
- Timer-based triggers with non-trivial scheduling

In these cases, ensure the channel is sized for the expected burst and the producer handles backpressure (e.g., non-blocking send with `default` case and a metric for dropped events).

### Reference

- [controller-runtime source.Channel implementation](https://github.com/kubernetes-sigs/controller-runtime/blob/main/pkg/source/source.go)
- [DataDog/resource-quotas-manager PR #179](https://github.com/DataDog/resource-quotas-manager/pull/179) — production deadlock and fix

## Handling Long-Running Operations

Reconcilers should return quickly. Three strategies for long-running operations:

### Option 1: High Concurrency with Timeouts (Recommended)

The simplest model: the reconciler blocks on the external call but doesn't starve other resources. With `MaxConcurrentReconciles: 50`, up to 50 resources make blocking external calls simultaneously. The timeout prevents any single reconciliation from holding a worker indefinitely, avoiding the operation ID tracking and status bookkeeping that the polling pattern requires.

```go
func (r *MyReconciler) SetupWithManager(mgr ctrl.Manager) error {
    return ctrl.NewControllerManagedBy(mgr).
        For(&myv1.MyResource{}).
        WithOptions(controller.Options{
            MaxConcurrentReconciles: 50,
        }).
        Complete(r)
}

func (r *MyReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    ctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
    defer cancel()
    // Block on external operation (acceptable with high concurrency)
    return r.externalClient.Apply(ctx, obj.Spec)
}
```

### Option 2: Background Polling

```go
func (r *MyReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    if obj.Status.OperationID != "" && obj.Status.Phase == "InProgress" {
        status, err := r.externalClient.GetStatus(ctx, obj.Status.OperationID)
        if err != nil {
            return ctrl.Result{RequeueAfter: 30 * time.Second}, nil
        }
        if status == "Complete" {
            patch := client.MergeFrom(obj.DeepCopy())
            obj.Status.Phase = "Ready"
            return ctrl.Result{}, r.Status().Patch(ctx, obj, patch)
        }
        return ctrl.Result{RequeueAfter: 30 * time.Second}, nil
    }

    opID, err := r.externalClient.StartAsync(ctx, obj.Spec)
    if err != nil {
        return ctrl.Result{}, err
    }
    patch := client.MergeFrom(obj.DeepCopy())
    obj.Status.OperationID = opID
    obj.Status.Phase = "InProgress"
    return ctrl.Result{RequeueAfter: 30 * time.Second}, r.Status().Patch(ctx, obj, patch)
}
```

### Option 3: Kubernetes Jobs

For compute-intensive operations, create a Job and watch for completion.

## Fast/Offline Reconciliation & External APIs

Controllers managing external resources (cloud APIs, etc.) face a tension: a full reconcile on every startup means thousands of external API calls when managing hundreds of thousands of objects. This is slow and risky (rate limits, blast radius of bugs in new versions).

### Generation-Gated Skip

Skip external API calls when spec hasn't changed:

```go
func (r *MyReconciler) reconcileExternal(ctx context.Context, obj *myv1.MyResource) (ctrl.Result, error) {
    if obj.Status.ObservedGeneration == obj.Generation &&
       obj.Status.ExternalSyncStatus == "Synced" {
        return ctrl.Result{}, nil  // Already synced
    }

    if err := r.externalClient.Sync(ctx, obj.Spec); err != nil {
        obj.Status.ExternalSyncStatus = "Failed"
        return ctrl.Result{}, err
    }

    obj.Status.ObservedGeneration = obj.Generation
    obj.Status.ExternalSyncStatus = "Synced"
    return ctrl.Result{}, nil
}
```

Set `Ready=True` after a successful full reconcile. On startup, `Ready == True && observedGeneration == generation` means nothing changed — skip. Only resources that actually need work get a full reconcile.

Trade-offs:
- **Pro**: fast startup, avoids hammering external APIs
- **Con**: won't detect out-of-band drift on external resources, won't auto-migrate existing resources when controller logic changes

### Drift Detection with Background Watchers

Instead of calling external APIs inside `Reconcile()`, separate drift detection into a `Runnable`:

1. A background `Runnable` polls external APIs on an interval and detects drift
2. On drift, trigger reconciliation via `WatchesRawSource` with `source.Channel`
3. `Reconcile()` stays "offline" — no external RPCs when there's no drift
4. Use a write-through cache to reduce API calls

This keeps the reconcile loop fast and predictable. The bounded channel limitation (see Channel Deadlocks above) still applies — size the channel for your object count or use `EnqueueRequestsFromMapFunc` from a runner instead.

Reference implementation: [kube-external-watcher](https://github.com/alperencelik/kube-external-watcher)

### Handling Logic Changes Requiring Full Re-Reconciliation

When controller logic changes and all resources need a fresh reconcile:

- **Logic version in status**: store an internal version string in `.status`; if it doesn't match the running controller's version, trigger full reconcile
- **Manual reset**: set `Ready=False` on all resources to force re-reconciliation
- **Thundering herd risk**: all resources re-reconcile on first startup after a change. Rate limiting (see Advanced Patterns) helps but risks starving new resources in the queue

### Startup Reconcile Deprioritization

controller-runtime's `priorityQueue` (v0.20+) deprioritizes startup reconciles from the initial list, so real changes get processed first. For finer control, a custom event handler can distinguish initial-list events from real mutations and spread startup load.
