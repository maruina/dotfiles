# Advanced Controller Patterns

Advanced patterns for production controllers. For core reconciliation, see the main skill.

## Cache Behavior and API Server Load

### Cached Client Behavior

`mgr.GetClient()` is a composite client. Unless a read is configured to bypass the cache, `Get` and `List` read from the manager's informer cache. `Create`, `Update`, `Patch`, `Apply`, and `Delete` go directly to the API server. A cached object miss returns `NotFound`; it never falls back to a live lookup.

Every cache-backed read resolves the informer for the requested GroupVersionKind (GVK) and representation. Existing informers are reused. If none exists, controller-runtime creates one by default and, when the cache is running, waits for it to synchronize. Each informer adds list/watch traffic and memory proportional to its cache scope. Unstructured reads bypass the cache by default unless `client.CacheOptions.Unstructured` is enabled.

Do not read through `mgr.GetClient()` before `mgr.Start()`: the cache-backed read returns `ErrCacheNotStarted`. Controller sources register their informers and wait for both cache and initial event-handler synchronization before reconciliation begins.

### Prevent Accidental Informer Creation

Enable `ReaderFailOnMissingInformer` so an unexpected read fails instead of starting a potentially cluster-wide informer and blocking while it synchronizes:

```go
mgr, err := ctrl.NewManager(ctrl.GetConfigOrDie(), ctrl.Options{
    Cache: cache.Options{
        ReaderFailOnMissingInformer: true,
    },
})
```

A cache-backed `Get` or `List` for an unregistered GVK then returns `ErrResourceNotCached`, which is distinct from an object-level `NotFound`. Explicit watches and field indexes register the informers they require.

### Direct API Reads

Use `mgr.GetAPIReader()` for deliberate live reads when a persistent informer is not appropriate:

```go
apiReader := mgr.GetAPIReader()

var node corev1.Node
err := apiReader.Get(ctx, client.ObjectKey{Name: "node-1"}, &node)
```

Appropriate uses include:
- One-off reads of types the manager does not otherwise cache
- Initialization reads before `mgr.Start()`
- Paginated traversal with `Limit` and `Continue`

The cache rejects a non-empty `Continue` token. A cached `Limit` only truncates the in-memory result; it does not provide stable pagination. Use `client.New` directly only in standalone utilities that do not have a manager.

Do not implement "read from cache, then fall back to the API reader on `NotFound`". A live read is also not a substitute for idempotency or coordination around stale cache observations.

### Cache Configuration Options

```go
mgr, err := ctrl.NewManager(ctrl.GetConfigOrDie(), ctrl.Options{
    Cache: cache.Options{
        ReaderFailOnMissingInformer: true,
        ByObject: map[client.Object]cache.ByObject{
            // Cache only Secrets managed by this controller.
            &corev1.Secret{}: {
                Label: labels.SelectorFromSet(labels.Set{
                    "app.kubernetes.io/managed-by": "my-controller",
                }),
            },
            // Drop managedFields before Pods enter the cache.
            &corev1.Pod{}: {
                Transform: cache.TransformStripManagedFields(),
            },
        },
        // Restrict every namespaced type cached by this manager.
        DefaultNamespaces: map[string]cache.Config{
            "my-namespace": {},
        },
    },
})
```

Cache configuration is manager-wide. Before narrowing a type, audit every controller, webhook, and runnable that reads it through the same manager. An object outside the configured namespace, label, or field selector is absent from the cache: `Get` returns `NotFound`, and `List` omits it. Configuration defines how an informer is populated; it does not register the informer. With `ReaderFailOnMissingInformer` enabled, register each required type through a watch, field index, or explicit `GetInformer`.

`cache.ByObject.Label` and `cache.ByObject.Field` restrict the API server list/watch that populates the cache. A `Field` selector must use fields supported by that Kubernetes API. This differs from `IndexField`, which creates a local computed index for cache-backed `MatchingFields` queries.

### Bypassing the Cache for Client Reads

For a large type that is read infrequently, route manager-client reads directly to the API server:

```go
mgr, err := ctrl.NewManager(cfg, ctrl.Options{
    Client: client.Options{
        Cache: &client.CacheOptions{
            DisableFor: []client.Object{
                &corev1.Secret{},
            },
        },
    },
})
```

`DisableFor` applies by GVK. It makes `mgr.GetClient().Get` and `List` perform live reads for that GVK. With the default client consistency settings, those reads do not create an informer. `DisableFor` does **not** disable the manager cache globally: `For`, `Owns`, `Watches`, `IndexField`, or an explicit `GetInformer` can still create an informer for the same type. `DisableFor` does not save informer memory when another consumer registers a full watch.

Do not use an empty cache selector such as `labels.Nothing()` to emulate live reads. It creates a cache in which every object is invisible; cache misses still do not fall back to the API server.

### Metadata-Only Caching

Use `metav1.PartialObjectMetadata` when only names, labels, annotations, finalizers, or owner references are needed. Register the metadata informer during setup when `ReaderFailOnMissingInformer` is enabled:

```go
secretMetadata := &metav1.PartialObjectMetadata{}
secretMetadata.SetGroupVersionKind(corev1.SchemeGroupVersion.WithKind("Secret"))
if _, err := mgr.GetCache().GetInformer(ctx, secretMetadata); err != nil {
    return fmt.Errorf("registering Secret metadata informer: %w", err)
}
```

After the manager starts, read metadata without caching Secret data:

```go
var secrets metav1.PartialObjectMetadataList
secrets.SetGroupVersionKind(corev1.SchemeGroupVersion.WithKind("SecretList"))
if err := mgr.GetClient().List(ctx, &secrets, client.InNamespace("my-namespace")); err != nil {
    return fmt.Errorf("listing Secret metadata: %w", err)
}
```

Metadata, structured, and unstructured representations use separate informer stores. Metadata-only access reduces memory only when the process does not also create a full structured informer for the same GVK. Because `DisableFor` is keyed by GVK, it also bypasses metadata reads for that GVK through `mgr.GetClient()`.

## Multi-Resource Reconciliation

When a controller manages multiple child resources, aggregate errors instead of returning on first failure:

```go
func (r *MyReconciler) reconcileNormal(ctx context.Context, obj *myv1.MyResource) (ctrl.Result, error) {
    var errs []error

    // Reconcile each child resource
    if err := r.reconcileDeployment(ctx, obj); err != nil {
        errs = append(errs, fmt.Errorf("deployment: %w", err))
    }
    if err := r.reconcileService(ctx, obj); err != nil {
        errs = append(errs, fmt.Errorf("service: %w", err))
    }
    if err := r.reconcileConfigMap(ctx, obj); err != nil {
        errs = append(errs, fmt.Errorf("configmap: %w", err))
    }

    if len(errs) > 0 {
        return ctrl.Result{}, errors.Join(errs...)
    }
    return ctrl.Result{}, nil
}
```

### Server-Side Apply for Multi-Resource

SSA declares desired state and lets the API server compute the diff, eliminating read-modify-write races. Field ownership lets multiple controllers manage different fields of the same resource. Fully supported for both spec and status in controller-runtime.

```go
func (r *MyReconciler) reconcileDeployment(ctx context.Context, obj *myv1.MyResource) error {
    dep := r.buildDeployment(obj)

    // Server-Side Apply with field manager
    return r.Patch(ctx, dep, client.Apply, client.FieldOwner("mycontroller"), client.ForceOwnership)
}
```

## External Resource Integration

Three patterns for managing resources backed by cloud APIs or external systems, in order of complexity:

1. **Synchronous with timeout** — blocks the reconciler worker, but `MaxConcurrentReconciles` and context timeouts prevent starvation
2. **Async with operation ID polling** — non-blocking; requires status bookkeeping for the operation ID and periodic requeue
3. **Webhook callback** — external system notifies on completion; lowest latency but requires ingress and a receiver endpoint

The examples below show pattern 1 (synchronous with backoff) and idempotent operations. For pattern 2, see `references/expectations-and-channels.md` (Option 2: Background Polling).

### Synchronous with Retry and Backoff

```go
func (r *MyReconciler) reconcileExternalResource(ctx context.Context, obj *myv1.MyResource) (ctrl.Result, error) {
    log := log.FromContext(ctx)

    // Check if external resource exists
    exists, err := r.externalClient.Exists(ctx, obj.Spec.ExternalID)
    if err != nil {
        // Network error - requeue with backoff
        return ctrl.Result{RequeueAfter: 30 * time.Second}, fmt.Errorf("checking external resource: %w", err)
    }

    if !exists {
        // Create external resource
        id, err := r.externalClient.Create(ctx, &ExternalResourceSpec{
            Name: obj.Name,
            // ...
        })
        if err != nil {
            return ctrl.Result{RequeueAfter: time.Minute}, fmt.Errorf("creating external resource: %w", err)
        }
        obj.Status.ExternalID = id
        log.Info("created external resource", "externalID", id)
    }

    // Sync state from external resource
    state, err := r.externalClient.Get(ctx, obj.Status.ExternalID)
    if err != nil {
        return ctrl.Result{RequeueAfter: 30 * time.Second}, fmt.Errorf("getting external state: %w", err)
    }

    obj.Status.ExternalState = state.Status

    // Poll for completion if still provisioning
    if state.Status == "provisioning" {
        return ctrl.Result{RequeueAfter: 30 * time.Second}, nil
    }

    return ctrl.Result{}, nil
}
```

### Idempotent External Operations

```go
func (r *MyReconciler) ensureExternalResource(ctx context.Context, obj *myv1.MyResource) error {
    // Use spec hash as idempotency key
    specHash := computeSpecHash(obj.Spec)

    // Check if we already created this version
    if obj.Status.LastAppliedSpecHash == specHash && obj.Status.ExternalID != "" {
        return nil // Already created
    }

    // Create or update external resource
    id, err := r.externalClient.Upsert(ctx, &ExternalResourceSpec{
        IdempotencyKey: fmt.Sprintf("%s/%s/%s", obj.Namespace, obj.Name, specHash),
        // ...
    })
    if err != nil {
        return err
    }

    obj.Status.ExternalID = id
    obj.Status.LastAppliedSpecHash = specHash
    return nil
}
```

## Leader Election and High Availability

### Controller Configuration

```go
func main() {
    mgr, err := ctrl.NewManager(ctrl.GetConfigOrDie(), ctrl.Options{
        Scheme:                 scheme,
        LeaderElection:         true,
        LeaderElectionID:       "my-controller-leader",
        LeaderElectionNamespace: "my-system",
        LeaseDuration:          15 * time.Second,
        RenewDeadline:          10 * time.Second,
        RetryPeriod:            2 * time.Second,
    })
    // ...
}
```

## Rate Limiting

Rate limiting protects the API server and external systems during bursts. Per-item rate limiting (workqueue) handles retry backoff for individual resources. Global rate limiting (token bucket) caps aggregate request rate across concurrent reconciliations.

### Per-Item Rate Limiting

```go
func (r *MyReconciler) SetupWithManager(mgr ctrl.Manager) error {
    return ctrl.NewControllerManagedBy(mgr).
        For(&myv1.MyResource{}).
        WithOptions(controller.Options{
            RateLimiter: workqueue.NewTypedItemExponentialFailureRateLimiter[reconcile.Request](
                time.Second,      // Base delay
                5*time.Minute,    // Max delay
            ),
            MaxConcurrentReconciles: 5,
        }).
        Complete(r)
}
```

### Global Rate Limiting for External APIs

```go
type MyReconciler struct {
    client.Client
    Scheme    *runtime.Scheme
    RateLimit *rate.Limiter // Token bucket rate limiter
}

func (r *MyReconciler) callExternalAPI(ctx context.Context) error {
    // Wait for rate limit token
    if err := r.RateLimit.Wait(ctx); err != nil {
        return fmt.Errorf("rate limit: %w", err)
    }
    return r.externalClient.Call(ctx)
}
```

## Caching and Indexing

### Field Indexers

Indexes enable efficient cache lookups by field value. Without an index, finding "all MyResources referencing ConfigMap X" requires listing and filtering every MyResource.

`client.MatchingFields` supports exact matches against registered field indexes. A missing index or a non-exact field selector returns an error rather than degrading to a scan. The index name is an arbitrary identifier, not a parsed field path, and the extractor may return computed values. Use the exact same identifier and computed value in `MatchingFields`.

`client.MatchingLabels` is not indexed. It scans the candidate set selected by a field index or namespace, then applies the label selector before deep-copying matching objects. Prefer `MatchingLabels` over filtering a complete result in application code, but add a namespace restriction or field index when a hot path must avoid a high-cardinality scan.

Every index adds memory and update work. Register indexes required by known query paths; do not add speculative indexes.

#### When to Use Indexes

| Use Case | Example |
|----------|---------|
| `EnqueueRequestsFromMapFunc` | Find parent resources when child changes |
| Owner reference lookups | Find all Jobs owned by a CronJob |
| Reference resolution | Find resources pointing to a Secret/ConfigMap |
| Array field management | Track resources created from array spec fields |

#### Adding an Index

Register during controller setup (`SetupWithManager` or `main.go`):

```go
// The index name is arbitrary; using the field path is a readability convention.
const configMapRefIndex = "spec.configMapRef"

func SetupIndexes(ctx context.Context, mgr ctrl.Manager) error {
    // Index MyResources by spec.configMapRef
    if err := mgr.GetFieldIndexer().IndexField(
        ctx,
        &myv1.MyResource{},
        configMapRefIndex,
        func(rawObj client.Object) []string {
            myResource := rawObj.(*myv1.MyResource)
            if myResource.Spec.ConfigMapRef == "" {
                return nil  // Don't index objects without this field
            }
            return []string{myResource.Spec.ConfigMapRef}
        },
    ); err != nil {
        return fmt.Errorf("indexing configMapRef: %w", err)
    }
    return nil
}
```

#### Using an Index

Query using `client.MatchingFields` with the same key:

```go
func (r *MyReconciler) findResourcesForConfigMap(ctx context.Context, cm client.Object) []reconcile.Request {
    var list myv1.MyResourceList
    if err := r.List(ctx, &list,
        client.InNamespace(cm.GetNamespace()),
        client.MatchingFields{configMapRefIndex: cm.GetName()},
    ); err != nil {
        return nil
    }

    requests := make([]reconcile.Request, len(list.Items))
    for i, item := range list.Items {
        requests[i] = reconcile.Request{
            NamespacedName: types.NamespacedName{
                Name:      item.Name,
                Namespace: item.Namespace,
            },
        }
    }
    return requests
}
```

### Owner Reference Index Pattern

The most common index pattern - finding child resources by their controller owner:

```go
const jobOwnerKey = ".metadata.controller"

func SetupJobOwnerIndex(ctx context.Context, mgr ctrl.Manager) error {
    return mgr.GetFieldIndexer().IndexField(
        ctx,
        &batchv1.Job{},
        jobOwnerKey,
        func(rawObj client.Object) []string {
            job := rawObj.(*batchv1.Job)
            owner := metav1.GetControllerOf(job)
            if owner == nil {
                return nil
            }
            // Verify it's the expected kind
            if owner.APIVersion != myv1.GroupVersion.String() || owner.Kind != "CronJob" {
                return nil
            }
            return []string{owner.Name}
        },
    )
}

// Usage: Find all Jobs owned by a CronJob
func (r *CronJobReconciler) listOwnedJobs(ctx context.Context, cronJob *myv1.CronJob) ([]batchv1.Job, error) {
    var jobList batchv1.JobList
    if err := r.List(ctx, &jobList,
        client.InNamespace(cronJob.Namespace),
        client.MatchingFields{jobOwnerKey: cronJob.Name},
    ); err != nil {
        return nil, fmt.Errorf("listing owned jobs: %w", err)
    }
    return jobList.Items, nil
}
```

### Index for Array Fields

When your CRD has array fields that create multiple child resources (e.g., one VirtualService per ingress), use indexes to track ownership and detect deletions:

```go
// Index child resources by parent CRD name
const virtualServiceOwnerIndex = "metadata.ownerReferences.name"

func SetupVirtualServiceIndex(ctx context.Context, mgr ctrl.Manager) error {
    return mgr.GetFieldIndexer().IndexField(
        ctx,
        &istionetv1.VirtualService{},
        virtualServiceOwnerIndex,
        func(rawObj client.Object) []string {
            vs := rawObj.(*istionetv1.VirtualService)
            owner := metav1.GetControllerOf(vs)
            if owner == nil || owner.Kind != "MyApp" {
                return nil
            }
            return []string{owner.Name}
        },
    )
}

// Reconcile: compare desired vs actual to detect deletions
func (r *MyAppReconciler) reconcileVirtualServices(ctx context.Context, app *myv1.MyApp) error {
    // 1. List all VirtualServices owned by this MyApp
    var existingVSList istionetv1.VirtualServiceList
    if err := r.List(ctx, &existingVSList,
        client.InNamespace(app.Namespace),
        client.MatchingFields{virtualServiceOwnerIndex: app.Name},
    ); err != nil {
        return fmt.Errorf("listing virtual services: %w", err)
    }

    // 2. Build set of existing VS names
    existing := make(map[string]bool)
    for _, vs := range existingVSList.Items {
        existing[vs.Name] = true
    }

    // 3. Create/update desired VirtualServices from spec.ingresses array
    desired := make(map[string]bool)
    for _, ingress := range app.Spec.Ingresses {
        vsName := fmt.Sprintf("%s-%s", app.Name, ingress.Name)
        desired[vsName] = true

        vs := r.buildVirtualService(app, ingress)
        if err := r.createOrUpdate(ctx, vs); err != nil {
            return err
        }
    }

    // 4. Delete VirtualServices that are no longer in spec
    for _, vs := range existingVSList.Items {
        if !desired[vs.Name] {
            if err := r.Delete(ctx, &vs); err != nil {
                return fmt.Errorf("deleting stale VirtualService %s: %w", vs.Name, err)
            }
        }
    }

    return nil
}
```

Reference implementations:
- [Indexer setup](https://github.com/statnett/image-scanner-operator/blob/b6da9974f9e320a8797928cc73195be6f6838aee/internal/controller/stas/indexer.go#L25-L41)
- [Usage in reconciler](https://github.com/statnett/image-scanner-operator/blob/b6da9974f9e320a8797928cc73195be6f6838aee/internal/controller/stas/workload_controller.go#L210-L218)

## Graceful Shutdown

```go
func main() {
    ctx := ctrl.SetupSignalHandler()

    mgr, err := ctrl.NewManager(ctrl.GetConfigOrDie(), ctrl.Options{
        // ...
        GracefulShutdownTimeout: 30 * time.Second,
    })

    // Add health checks
    if err := mgr.AddHealthzCheck("healthz", healthz.Ping); err != nil {
        setupLog.Error(err, "unable to set up health check")
        os.Exit(1)
    }
    if err := mgr.AddReadyzCheck("readyz", healthz.Ping); err != nil {
        setupLog.Error(err, "unable to set up ready check")
        os.Exit(1)
    }

    if err := mgr.Start(ctx); err != nil {
        setupLog.Error(err, "problem running manager")
        os.Exit(1)
    }
}
```

## Event Recording

```go
type MyReconciler struct {
    client.Client
    Scheme   *runtime.Scheme
    Recorder record.EventRecorder
}

func (r *MyReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    // ...

    // Record events for significant state changes
    r.Recorder.Event(obj, corev1.EventTypeNormal, "Reconciled", "Successfully reconciled resource")

    // Warning for issues
    r.Recorder.Eventf(obj, corev1.EventTypeWarning, "ReconcileError",
        "Failed to create deployment: %v", err)

    // ...
}

// Setup
func (r *MyReconciler) SetupWithManager(mgr ctrl.Manager) error {
    r.Recorder = mgr.GetEventRecorderFor("my-controller")
    // ...
}
```

## Metrics

### Custom Metrics

```go
import (
    "github.com/prometheus/client_golang/prometheus"
    "sigs.k8s.io/controller-runtime/pkg/metrics"
)

var (
    reconcileTotal = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "mycontroller_reconcile_total",
            Help: "Total number of reconciliations",
        },
        []string{"namespace", "result"},
    )

    reconcileDuration = prometheus.NewHistogramVec(
        prometheus.HistogramOpts{
            Name:    "mycontroller_reconcile_duration_seconds",
            Help:    "Duration of reconciliations",
            Buckets: prometheus.DefBuckets,
        },
        []string{"namespace"},
    )
)

func init() {
    metrics.Registry.MustRegister(reconcileTotal, reconcileDuration)
}

func (r *MyReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    start := time.Now()
    defer func() {
        reconcileDuration.WithLabelValues(req.Namespace).Observe(time.Since(start).Seconds())
    }()

    // ... reconciliation logic ...

    reconcileTotal.WithLabelValues(req.Namespace, "success").Inc()
    return ctrl.Result{}, nil
}
```

## Protobuf Serialization

By default, Kubernetes returns objects in JSON (`application/json`). Protobuf is more efficient at scale.

### Controller-Runtime Default

Controller-runtime uses protobuf by default for built-in resources:

```go
// controller-runtime already configures this internally
config.AcceptContentTypes = "application/vnd.kubernetes.protobuf,application/json"
config.ContentType = "application/vnd.kubernetes.protobuf"
```

### CRDs Don't Support Protobuf

**Critical:** CRDs only support JSON serialization. Protobuf requires compiled definitions in the API server, which CRDs lack.

```go
// For client-go when working with CRDs, stick to JSON
config.ContentType = "application/json"
```

This is handled automatically by controller-runtime's cached client for CRDs.

## Unstructured Resources for Heavy Dependencies

Interact with external CRDs (cert-manager, Cluster API, etc.) without importing their heavy transitive dependencies:

```go
import (
    "k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
    "k8s.io/apimachinery/pkg/runtime/schema"
)

func (r *MyReconciler) getCertificate(ctx context.Context, name, namespace string) (*unstructured.Unstructured, error) {
    cert := &unstructured.Unstructured{}
    cert.SetGroupVersionKind(schema.GroupVersionKind{
        Group:   "cert-manager.io",
        Version: "v1",
        Kind:    "Certificate",
    })

    if err := r.Get(ctx, types.NamespacedName{Name: name, Namespace: namespace}, cert); err != nil {
        return nil, err
    }

    return cert, nil
}

func (r *MyReconciler) isCertificateReady(cert *unstructured.Unstructured) bool {
    conditions, found, err := unstructured.NestedSlice(cert.Object, "status", "conditions")
    if err != nil || !found {
        return false
    }

    for _, c := range conditions {
        cond := c.(map[string]interface{})
        if cond["type"] == "Ready" && cond["status"] == "True" {
            return true
        }
    }
    return false
}
```

Benefits:
- No import of `github.com/cert-manager/cert-manager/pkg/apis`
- Avoids transitive dependency management
- Works with any CRD without compile-time knowledge

Drawbacks:
- No compile-time type safety
- More verbose code
- Must handle field access errors

## Defer-Patch-on-Exit Pattern

Defer a status write that runs on every exit path — including early error returns. Cluster API's `PatchHelper` popularized this. Prefer SSA to avoid snapshotting and read-modify-write races:

```go
func (r *MyReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    var obj myv1.MyResource
    if err := r.Get(ctx, req.NamespacedName, &obj); err != nil {
        return ctrl.Result{}, client.IgnoreNotFound(err)
    }

    // Defer SSA status apply — always runs, even on error
    defer func() {
        obj.Status.ObservedGeneration = obj.Generation
        statusApply := myv1.MyResource{
            TypeMeta: metav1.TypeMeta{APIVersion: myv1.GroupVersion.String(), Kind: "MyResource"},
            ObjectMeta: metav1.ObjectMeta{Name: obj.Name, Namespace: obj.Namespace},
            Status: obj.Status,
        }
        if err := r.Status().Patch(ctx, &statusApply,
            client.Apply, client.FieldOwner("my-controller"), client.ForceOwnership); err != nil {
            log.FromContext(ctx).Error(err, "failed to apply status")
        }
    }()

    // Modify obj.Status freely throughout reconciliation
    meta.SetStatusCondition(&obj.Status.Conditions, metav1.Condition{...})

    return ctrl.Result{}, nil
}
```

For projects that cannot use SSA (e.g., older API server versions), `client.MergeFrom(obj.DeepCopy())` with a deferred `r.Status().Patch()` achieves a similar outcome.

### Conditions Utilities

Prefer `apimachinery/pkg/api/meta.SetStatusCondition` from stdlib — it covers set, get, find, and remove without external dependencies:

```go
import "k8s.io/apimachinery/pkg/api/meta"

meta.SetStatusCondition(&obj.Status.Conditions, metav1.Condition{
    Type:               "Ready",
    Status:             metav1.ConditionTrue,
    ObservedGeneration: obj.Generation,
    Reason:             "Reconciled",
    Message:            "All components ready",
})

cond := meta.FindStatusCondition(obj.Status.Conditions, "Ready")
```

The Cluster API conditions package (`sigs.k8s.io/cluster-api/util/conditions/v1beta2`) adds aggregation, mirroring, and helper predicates (`IsTrue`, `IsFalse`), but pulls in the full cluster-api module (~200+ transitive deps). Only worth importing if the project already depends on CAPI or needs aggregation.

### Condition Design Conventions

**Polarity**: conditions are positive-polarity (`Ready`, `Available`, `Provisioned`) — `True` means healthy. Negative-polarity conditions (`Degraded`, `Failing`) invert reader expectations and complicate aggregation; avoid them.

**Status values**: `True` (condition met), `False` (condition not met, actionable), `Unknown` (cannot determine — initialize all conditions to this on first reconciliation).

**Reason vocabulary**: `Reason` is PascalCase, machine-readable, and stable across releases. Use it for programmatic decisions (`Reason: "QuotaExceeded"`). `Message` is human-readable and may change freely. Common patterns:
- `Reason: "Reconciled"` / `"Provisioning"` / `"WaitingForDependency"` — progress
- `Reason: "ConfigInvalid"` / `"QuotaExceeded"` — permanent failures (pair with `Status: False`)
- `Reason: "Initializing"` — first reconciliation (pair with `Status: Unknown`)

**ObservedGeneration**: always set `ObservedGeneration: obj.Generation` on every condition update. This lets consumers distinguish stale conditions (generation mismatch) from current ones. For the generation-gated skip optimization (skip reconciliation when `observedGeneration == generation` and status is healthy), see `references/expectations-and-channels.md`.

**When to advance `ObservedGeneration`** — the upstream API conventions ([api-conventions.md](https://github.com/kubernetes/community/blob/master/contributors/devel/sig-architecture/api-conventions.md)) define it as "the `.metadata.generation` that the condition was set based upon" but are deliberately silent on whether to advance it on failure. Two valid conventions exist:

- **Advance always** (spec-literal): the controller *observed and acted on* this generation, even if it failed. Consumers check conditions for success/failure and `observedGeneration` for freshness. This is the reading used by kpt, Gateway API, and controllers where "the controller has seen this spec" is the primary signal.
- **Advance on success only** (cluster-api convention, [#3256](https://github.com/kubernetes-sigs/cluster-api/issues/3256)): `observedGeneration < generation` itself signals incomplete reconciliation. Simpler for consumers who only check one field, but conditions must still be set on failure for diagnostics.

Pick one convention per project and apply it consistently. Document the choice in the controller's package doc or CRD design doc. If the project already follows an existing framework (CAPI, Flux, Gateway API), match its convention.

## Strict Schema Validation

Prevent controller-CRD version mismatch by enabling strict field validation:

```go
func main() {
    mgr, err := ctrl.NewManager(cfg, ctrl.Options{
        NewClient: func(config *rest.Config, options client.Options) (client.Client, error) {
            cli, err := client.New(config, options)
            if err != nil {
                return nil, err
            }
            // Enable strict validation - unknown fields cause errors
            return client.WithFieldValidation(cli, metav1.FieldValidationStrict), nil
        },
    })
}
```

This catches:
- Controller updated with new status fields, but CRD not updated
- Typos in field names during development
- Schema drift between controller and CRD versions

Without strict validation, unknown fields are silently dropped, potentially causing infinite reconciliation loops.

## Multiple Controllers for Related CRDs

When multiple controllers manage interrelated CRDs:

### Advantages

```go
// Separate controllers allow independent scaling and failure isolation
type DatabaseReconciler struct { ... }  // Manages Database CRD
type BackupReconciler struct { ... }    // Manages Backup CRD
type RestoreReconciler struct { ... }   // Manages Restore CRD
```

- **Decoupling**: Failure in Database reconciliation doesn't block Backup operations
- **Independent scaling**: Can tune `MaxConcurrentReconciles` per controller
- **Clear ownership**: Each controller owns specific status fields

### Pitfalls

```go
// DANGER: Controllers stepping on each other
func (r *DatabaseReconciler) Reconcile(...) {
    // Sets status.phase = "Ready"
}

func (r *BackupReconciler) Reconcile(...) {
    // Also sets status.phase = "BackupInProgress"
    // Race condition!
}
```

- **Field ownership conflicts**: Multiple controllers updating the same status fields
- **Ordering dependencies**: BackupReconciler might run before DatabaseReconciler finished
- **ObservedGeneration confusion**: Which controller's `observedGeneration` is authoritative?

### Best Practice

Each controller should own distinct status fields:

```go
type DatabaseStatus struct {
    // Owned by DatabaseReconciler
    ObservedGeneration int64              `json:"observedGeneration"`
    Conditions         []metav1.Condition `json:"conditions"`

    // Owned by BackupReconciler
    LastBackup *BackupStatus `json:"lastBackup,omitempty"`

    // Owned by RestoreReconciler
    LastRestore *RestoreStatus `json:"lastRestore,omitempty"`
}
```

Reference: The `kube-scheduler` owns exactly one field (`spec.nodeName`) on Pods.

## Resync Period and Secondary Watches

### Filtering Resync Events

A resync re-emits every object already in the local informer store as a synthetic update with the same old and new object. It is not a relist and does not read from the API server. `ResourceVersionChangedPredicate` filters these events from secondary watches, keeping the workqueue focused on real mutations:

```go
func (r *MyReconciler) SetupWithManager(mgr ctrl.Manager) error {
    return ctrl.NewControllerManagedBy(mgr).
        For(&myv1.MyResource{}).
        Watches(
            &corev1.ConfigMap{},
            handler.EnqueueRequestsFromMapFunc(r.findObjectsForConfigMap),
            // Synthetic resync updates keep the same resourceVersion.
            builder.WithPredicates(predicate.ResourceVersionChangedPredicate{}),
        ).
        Complete(r)
}
```

Both `ResourceVersionChangedPredicate` and `GenerationChangedPredicate` filter synthetic resync updates because the relevant old and new values are equal. Do not rely on resync for a watch whose predicates discard these events.

### Understanding Resync Mechanics

- Each informer jitters its configured resync period.
- A local resync can enqueue every cached object and overwhelm a controller with unnecessary work.
- A real relist occurs when the informer must rebuild its snapshot, such as after its watch resource version expires; it is independent of periodic resync.
- Built-in event handlers lower the priority of unchanged-resource-version updates, including resyncs, when the controller uses controller-runtime's priority queue. Predicates should still prevent work the controller does not need.

Do not tune the manager-wide `SyncPeriod` to poll individual objects or external systems. Return `ctrl.Result{RequeueAfter: interval}` for per-object periodic work so real events can trigger reconciliation immediately.

For cache staleness expectations, channel deadlocks, long-running operations, and ObservedGeneration patterns, see `references/expectations-and-channels.md`.
