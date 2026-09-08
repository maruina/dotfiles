---
name: k8s-controller-dev
description: Guides Kubernetes controller-runtime development and direct client-go informer (`SharedInformerFactory`) patterns. Use when implementing or reviewing reconcilers, background runnables, or lightweight webhook/watchers that cache Kubernetes resources.
model: sonnet
---

# Kubernetes Controller Development

Patterns for controller-runtime reconcilers and background runnables.

## Before You Write Code

Search the repository for:
1. **Existing controllers** — local conventions for status updates, error handling, logging, constructors
2. **Internal utility packages** — helpers for env parsing, logging, client wrappers
3. **Proto/API definitions** — CRD types and proto definitions for the full type surface

**Not using a controller-runtime manager?** If the binary is a webhook or lightweight watcher that reads from the cluster but does not reconcile resources, read `references/client-go-informers.md` instead of the reconciler skeleton below. The `SharedInformerFactory` pattern, scoped list/watch setup, and fake-clientset testing are covered there.

## Core Reconciliation

Every reconciler follows this skeleton:

```go
func (r *MyReconciler) Reconcile(ctx context.Context, req ctrl.Request) (result ctrl.Result, retErr error) {
    var obj myv1.MyResource
    if err := r.Get(ctx, req.NamespacedName, &obj); err != nil {
        return ctrl.Result{}, client.IgnoreNotFound(err)
    }

    if !obj.DeletionTimestamp.IsZero() {
        return r.reconcileDelete(ctx, &obj)
    }

    if !controllerutil.ContainsFinalizer(&obj, finalizerName) {
        controllerutil.AddFinalizer(&obj, finalizerName)
        if err := r.Update(ctx, &obj); err != nil {
            return ctrl.Result{}, err
        }
    }

    // Deferred SSA status apply — always runs, even on error and even when suspended.
    // Registered before the suspend check so that returning early from the suspend
    // branch still triggers the defer and writes Reconciling=False to status.
    // Named returns let the defer propagate patch failures so the request is retried.
    defer func() {
        // Convention: always update ObservedGeneration even on error; see Status Updates section
        obj.Status.ObservedGeneration = obj.Generation
        statusApply := myv1.MyResource{
            TypeMeta:   metav1.TypeMeta{APIVersion: myv1.GroupVersion.String(), Kind: "MyResource"},
            ObjectMeta: metav1.ObjectMeta{Name: obj.Name, Namespace: obj.Namespace},
            Status:     obj.Status,
        }
        if err := r.Status().Patch(ctx, &statusApply,
            client.Apply, client.FieldOwner("my-controller"), client.ForceOwnership); err != nil {
            log.FromContext(ctx).Error(err, "failed to apply status")
            retErr = errors.Join(retErr, err)
        }
    }()

    // Suspend check — after deletion so finalizer cleanup still runs; after the
    // defer so status is always written (Reconciling=False visible in kubectl get).
    if obj.Spec.Suspend {
        meta.SetStatusCondition(&obj.Status.Conditions, metav1.Condition{
            Type:               "Reconciling",
            Status:             metav1.ConditionFalse,
            Reason:             "Suspended",
            Message:            "Reconciliation is suspended",
            ObservedGeneration: obj.Generation,
        })
        return ctrl.Result{}, nil
    }

    return r.reconcileNormal(ctx, &obj)
}

func (r *MyReconciler) reconcileNormal(ctx context.Context, obj *myv1.MyResource) (ctrl.Result, error) {
    // ensure child resources, call external APIs, update obj.Status fields
    return ctrl.Result{}, nil
}
```

**Every reconciler must implement all steps below. Do not skip deletion handling or SSA status.**

### Mandatory Steps (in order)

1. Fetch resource → `client.IgnoreNotFound`
2. Handle deletion (even if no external cleanup today — add the path)
3. Finalizer management
4. Deferred SSA status patch — register **before** the suspend check so it fires even when suspended, writing `Reconciling=False` to status
5. Suspend/pause check — set `Reconciling=False` condition then return; defer handles the write
6. `reconcileNormal`

### Requeue Strategies

| Scenario | Return Value | Why |
|----------|--------------|-----|
| Fully reconciled | `ctrl.Result{}, nil` | No further action needed |
| Polling external state | `ctrl.Result{RequeueAfter: time.Minute}, nil` | Explicit delay avoids API server churn |
| Transient error | `ctrl.Result{}, err` | controller-runtime applies exponential backoff automatically |
| Permanent error | `ctrl.Result{}, nil` + set condition | Retrying won't fix invalid config; surface in status instead |

`Requeue: true` is **deprecated** (controller-runtime v0.19+). Use `RequeueAfter` or return an error. Skip full reconciliation when `observedGeneration == generation` and status is healthy — see `references/expectations-and-channels.md`. Wrap every error with context: `fmt.Errorf("creating deployment %s/%s: %w", ns, name, err)`

## Reconciliation Control

**Suspend**: add `Spec.Suspend bool`, check early in Reconcile.

**Force reconcile**: track `Status.LastHandledReconcileAt` as audit trail. Watches fire on annotation changes automatically. **Nil safety**: reading a nil annotations map is safe, but writing panics — nil-check first or use `SetAnnotations()`. Full implementation in `references/operational-patterns.md`.

## Cache Semantics

`mgr.GetClient()` is composite. Unless a read is configured to bypass the cache, `Get` and `List` read from the manager's informer cache; writes go directly to the API server. Unstructured reads bypass the cache by default unless caching is explicitly enabled. A cached object miss returns `NotFound` and never falls back to a live API read.

Each cache-backed read resolves the informer for the requested GroupVersionKind (GVK) and representation. Existing informers are reused. By default, once the cache is running, a missing informer is created and the read waits for it to synchronize; `ReaderFailOnMissingInformer` changes this to an `ErrResourceNotCached` error. Controller sources synchronize their informers before `Reconcile` begins.

Cache reads are eventually consistent by default, so do not assume read-after-write. Use `mgr.GetAPIReader()` only for deliberate live reads, not as an automatic cache-miss fallback or a substitute for idempotent reconciliation. See `references/advanced-patterns.md` for informer lifecycle, cache scoping, direct reads, and memory controls.

## Watches & Predicates

| Method | Purpose | Enqueue mechanism |
|--------|---------|-------------------|
| `For()` | Primary resource (one per controller) | Direct |
| `Owns()` | Child resources with owner references | Automatic via owner ref |
| `Watches()` | External resources not owned by this controller | Custom `EnqueueRequestsFromMapFunc` |

**Predicates are per-watch.** Predicates on `For()` do **not** propagate to `Watches()`. Filter in predicates, not inside `Reconcile` — unfiltered events still enter the workqueue.

**Informer object ownership:** objects passed to predicates and event handlers are shared informer-store objects. Treat them as read-only; call `DeepCopy()` before modifying or retaining one. Objects returned by cache-backed `Get` and `List` are deep-copied by default unless unsafe deep-copy disabling is configured.

**Fan-out**: use `Watches` + `EnqueueRequestsFromMapFunc` with `ResourceVersionChangedPredicate{}` to filter resync events. `r.Client.List()` reads from cache; the workqueue deduplicates. **Never use `WatchesRawSource` with `source.Channel` for fan-out** — deadlocks beyond ~2048 in-flight events. See `references/expectations-and-channels.md`.

**Field indexers**: register **before** building the controller. Indexes power efficient lookups in map functions and `client.MatchingFields`. `client.MatchingLabels` is not indexed; hot, high-cardinality lookups need a namespace restriction or field index to avoid full candidate-set scans. See `references/advanced-patterns.md` for patterns.

## Status Updates

Patch the status subresource — never Update — to avoid conflicts with concurrent spec changes. With manual `Patch` calls, skip writes when nothing changed (`equality.Semantic.DeepEqual`); the deferred SSA pattern above relies on SSA idempotency instead. Initialize conditions to `Unknown` on first reconciliation — missing conditions are misread as "not applicable." Use `meta.SetStatusCondition` from `k8s.io/apimachinery`. `ObservedGeneration` update timing (always vs success-only) is a per-project convention — pick one and apply consistently. See `references/advanced-patterns.md` for condition design, the two `ObservedGeneration` conventions, and `references/expectations-and-channels.md` for the generation-gated skip optimization.

**Reset mutable boolean status fields at the start of each reconcile attempt** — don't rely on only setting them on success. A field like `Reconciled bool` that is only set to `true` on success can show `true` after a generation bump fails: the previous run set it, the new run sets conditions to `Ready=False`, but the `Reconciled` field is never cleared, creating a contradictory status (`Ready=False`, `reconciled=true`).

**Set `Reconciling=True` only on error-return paths**, not unconditionally at the start. Setting it at the start and then clearing it in a recovery branch (e.g. `AlreadyStarted`) causes condition flip-flops: each pass writes a new `LastTransitionTime`, triggering a fresh watch event that re-enqueues the resource and defeats any `RequeueAfter` throttle.

## Finalizers

Finalizers block garbage collection until external cleanup completes. Lifecycle: check finalizer → clean up → remove finalizer → update.

```go
func (r *MyReconciler) reconcileDelete(ctx context.Context, obj *myv1.MyResource) (ctrl.Result, error) {
    if controllerutil.ContainsFinalizer(obj, finalizerName) {
        if err := r.cleanupExternalResources(ctx, obj); err != nil {
            return ctrl.Result{}, fmt.Errorf("cleaning up: %w", err)
        }
        controllerutil.RemoveFinalizer(obj, finalizerName)
        if err := r.Update(ctx, obj); err != nil {
            return ctrl.Result{}, err
        }
    }
    return ctrl.Result{}, nil
}
```

Set owner references on child resources via `controllerutil.SetControllerReference` for automatic garbage collection.

## Multi-Resource Reconciliation

Aggregate errors with `errors.Join` — early returns leave the system partially converged. Default to SSA (`client.Apply`) for child resources: no read-modify-write races, field ownership lets controllers coexist. SSA requires `TypeMeta`. See `references/advanced-patterns.md`.

## Design Rules

- **One controller per CRD.** Multiple A referencing one B → reconcile B.
- **Separate status from reconciliation.** Named phases, testable independently.
- **Use `defer` for status finalization.** Guarantees status is always written.
- **Apply predicates to every watch**, not just `For()`.
- **Pre-index fields** for efficient lookups in map functions.
- **Never create static SA token Secrets.** Use TokenRequest API for short-lived credentials. See `references/service-account-tokens.md`.
- **Env var defaults must be safe.** Default values for external endpoints (task queues, API contexts, cluster names) must point to staging/dev, never production. A controller starting without explicit configuration must not accidentally hit production systems. This includes downstream dependencies: if an unknown env value falls through a switch, ensure the default arm maps to a non-production target.
- **External operation idempotency.** If the external API you're calling is not idempotent (e.g. a workflow trigger), implement a pre-trigger state check or generation-gated guard in the controller. See `references/operational-patterns.md` → External Operation Idempotency.

## Runner Patterns

Use a `manager.Runnable` for periodic cluster-wide work such as aggregate computations, metrics, or cache warming; use a controller for reacting to individual resource changes and maintaining per-resource state.

Implement `manager.Runnable` with a ticker loop. Return `nil` on context cancellation — an error shuts down the entire manager. Register before `mgr.Start()`. Implement `NeedLeaderElection() bool` returning `true` when writing to the cluster. Register Prometheus metrics with `metrics.Registry.MustRegister()` (controller-runtime's registry, not the global default). **Reset gauge vectors before recomputing.**

See `references/advanced-runner-patterns.md` for the core ticker pattern, health checks, multiple intervals, jitter, and coordination.

## Testing

| Test Type | Tool | When to Use |
|-----------|------|-------------|
| **Unit** | fakeclient | Pure logic, helpers, input validation |
| **Integration** | envtest | Reconciliation loops, status updates, webhooks, cache |
| **E2E** | kind cluster | Full system validation, image builds, real workloads |

**Default to envtest** — real etcd + kube-apiserver without full cluster overhead. Critical gotchas: no GC in envtest (use `t.Cleanup()`), never assert immediately after Create/Update (use `Eventually`), fakeclient needs `WithStatusSubresource()` or `Status().Update()` silently no-ops.

See `references/testing-patterns.md` for suite setup, canonical test cases, mocking, builders, and matchers.

## Checklist: New Controller

Verify the **Mandatory Steps** above, plus:
- [ ] Requeue strategy per error class (transient vs permanent)
- [ ] Owner references on all child resources
- [ ] Predicates on every watch (not just `For()`)
- [ ] Field indexes registered before controller build
- [ ] Cache scope and informer footprint reviewed for every read/watch type
- [ ] Predicate and event-handler objects never mutated without `DeepCopy()`
- [ ] Status patch (not Update) with `ObservedGeneration`
- [ ] Conditions initialized to `Unknown`
- [ ] envtest tests with `Eventually`/`Consistently`
- [ ] Mutable boolean status fields reset at start of each reconcile (not set-on-success only)
- [ ] `Reconciling=True` only on error-return paths (not unconditionally at start)
- [ ] `LastHandledReconcileAt` written only after external operation succeeds
- [ ] When paused: status condition written + `Paused` printcolumn exposed
- [ ] Env var defaults map to staging/non-production targets
- [ ] External operations guarded against double-trigger (generation gate or state check)

## References

| Document | When to read |
|----------|--------------|
| `references/advanced-patterns.md` | Cache/client semantics, informer lifecycle, cache scoping, field indexes, rate limiting, SSA, multi-resource reconciliation, defer-patch, unstructured resources |
| `references/expectations-and-channels.md` | Cache staleness, channel deadlocks, long-running operations |
| `references/operational-patterns.md` | Suspend/force reconciliation (incl. timing pitfalls), external operation idempotency, local development, lease hijacking, API group migration, CRD-controller version mismatch |
| `references/advanced-runner-patterns.md` | Core ticker pattern, prometheus metrics, built-in metrics, health checks, multiple intervals, coordination |
| `references/testing-patterns.md` | Complete suite setup, canonical tests, fakeclient limitations, mocking, builders, matchers |
| `references/service-account-tokens.md` | TokenRequest API, multi-cluster auth, token renewal patterns |
| `references/client-go-informers.md` | Direct `client-go` informers without controller-runtime: `SharedInformerFactory`, scoped list/watch setup, fake-clientset testing, `DeletedFinalStateUnknown` |

### Pattern Sources

| Repository | Best For |
|------------|----------|
| [cloudnative-pg](https://github.com/cloudnative-pg/cloudnative-pg) | Custom predicates, phased reconciliation, field indexers |
| [cluster-api](https://github.com/kubernetes-sigs/cluster-api) | Status aggregation, condition utilities, scope pattern, PatchHelper |
| [elastic/cloud-on-k8s](https://github.com/elastic/cloud-on-k8s) | Expectations pattern for cache staleness |
| [flux-operator](https://github.com/controlplaneio-fluxcd/flux-operator) | Serial patcher, kstatus conditions, `reconcile.TerminalError` |
| [kamaji](https://github.com/clastix/kamaji) | Mutex-based reconciliation, conditional API watches |
