# client-go Informers Without controller-runtime
Use this reference when you need to watch Kubernetes resources directly with `k8s.io/client-go`
and are **not** using a controller-runtime manager. The canonical case is a webhook or
lightweight background watcher that reads one or a few resources but writes nothing to the cluster.

## When to use client-go directly instead of controller-runtime
Use a `SharedInformerFactory` directly when:

- The binary is a **stateless webhook** or lightweight watcher that reads cluster state but never writes back.
- Adding controller-runtime would be the only reason to depend on it. The manager adds scheme registration, cache configuration, lifecycle wiring, and health endpoints that are unnecessary for a small read-only watcher.

Do **not** use client-go directly if you already depend on controller-runtime. Use
`mgr.GetClient()` or a controller-runtime cache instead.

## Idiomatic informer pattern for generated clientsets
Use the generated shared informer factory for built-in resources and generated clientsets. The
factory shares watches, scopes list/watch options once, and owns informer lifecycle.

```go
factory := informers.NewSharedInformerFactoryWithOptions(
    kubeClient,
    0, // no periodic resync; event-driven updates only
    informers.WithNamespace(namespace),
    informers.WithTweakListOptions(func(opts *metav1.ListOptions) {
        // Optional: narrow the API-server list/watch stream before it reaches the handler.
        if objectName != "" {
            opts.FieldSelector = fields.OneTermEqualSelector("metadata.name", objectName).String()
        }
        if labelSelector != "" {
            opts.LabelSelector = labelSelector
        }
    }),
)

// Pick the generated informer for the resource you watch, for example:
resourceInformer := factory.Core().V1().Pods().Informer()
// Or, for built-in resources selected at runtime:
// genericInformer, err := factory.ForResource(gvr)
// resourceInformer := genericInformer.Informer()

// This scope must own the service lifetime. Do not defer this cleanup in a
// startup method that returns after cache sync.
informerCtx, stopInformers := context.WithCancel(ctx)
defer func() {
    stopInformers()
    factory.Shutdown()
}()

registration, err := resourceInformer.AddEventHandler(cache.ResourceEventHandlerFuncs{
    AddFunc:    onAdd,
    UpdateFunc: onUpdate,
    DeleteFunc: onDelete,
})
if err != nil {
    return fmt.Errorf("register event handler: %w", err)
}

// StartWithContext starts informers in the background. Do not wrap it in another goroutine.
factory.StartWithContext(informerCtx)

syncCtx, cancelSync := context.WithTimeout(informerCtx, startupTimeout)
defer cancelSync()

if err := factory.WaitForCacheSyncWithContext(syncCtx).AsError(); err != nil {
    log.Warn("informer cache did not sync; serving in fallback mode", "error", err)
    enterFallbackMode()
} else if !cache.WaitFor(syncCtx, "resource event handler sync", registration.HasSyncedChecker()) {
    log.Warn("informer handler did not process the initial list; serving in fallback mode")
    enterFallbackMode()
}
```

### Key API choices
- Build generated informers with `informers.NewSharedInformerFactoryWithOptions`.
- Start generated factories with `factory.StartWithContext(ctx)`.
- Stop generated factories by canceling the context, then calling `factory.Shutdown()`.
- Wait for all factory informers with `factory.WaitForCacheSyncWithContext(ctx).AsError()`. For one informer, `cache.WaitForNamedCacheSyncWithContext(ctx, informer.HasSynced)` is simpler and provides contextual logs.
- If handler state affects serving, also wait for the `ResourceEventHandlerRegistration` handle with `cache.WaitFor(ctx, "handler sync", registration.HasSyncedChecker())`.
- Scope list/watch traffic with `WithNamespace`, `WithTweakListOptions`, field selectors, and label selectors when the API server can filter the resource.

If a timeout only changes the component into a fail-open mode while the informer keeps running, update its readiness or sync metric when `HasSynced()` later becomes true. Do not leave health reporting at the startup-timeout result after live configuration is in use.

Avoid legacy standalone informers (`cache.NewInformer`, `cache.NewIndexerInformer`) in new code.
They are deprecated in client-go v0.36. Use a generated shared informer factory, a dynamic
informer factory, or `cache.NewInformerWithOptions` only when you truly need a custom
`ListerWatcher`.

## Resource handlers
Handlers run on cached objects from the informer. Keep them fast and never mutate the received
object. If you need to retain or modify an object, call `DeepCopy()` after asserting the concrete
Kubernetes type.

`UpdateFunc` is not an every-version changelog. Several changes can collapse into one update, and
resyncs can call `UpdateFunc` even when the object did not change. Make handlers idempotent.

## DeletedFinalStateUnknown — always unwrap in DeleteFunc
When a watch reconnects after a disconnect, the DeltaFIFO can deliver a tombstone wrapper instead
of the actual object. If you do not unwrap it, a concrete type assertion can fail and deletion
handling can silently skip the resource.

```go
func onDelete(obj any) {
    if tombstone, ok := obj.(cache.DeletedFinalStateUnknown); ok {
        obj = tombstone.Obj
    }

    object, ok := obj.(metav1.Object)
    if !ok {
        log.Warn("delete event for unexpected object type; applying fallback")
        applyFallback()
        return
    }

    handleDelete(object)
}
```

If delete handling needs the full resource spec, replace `metav1.Object` with the concrete type
your informer watches.

## Dynamic resources and CRDs
For CRDs or runtime-selected resources without a generated clientset, use `dynamicinformer` instead
of hand-building a reflector:

```go
dynamicFactory := dynamicinformer.NewFilteredDynamicSharedInformerFactory(
    dynamicClient,
    0,
    namespace,
    tweakListOptions,
)
resourceInformer := dynamicFactory.ForResource(gvr).Informer()
```

The dynamic factory still exposes the older stop-channel lifecycle in client-go v0.36. Keep the
same invariants: start once, wait for cache sync before relying on state, unwrap tombstones, close
the stop channel before `Shutdown()`, and shut the factory down in tests.

## Testing with a fake clientset
`fake.NewSimpleClientset` works directly with `NewSharedInformerFactoryWithOptions`. The generated
factory wraps its `ListWatch` with `ToListWatcherWithWatchListSemantics`, checks whether the client
implements `IsWatchListSemanticsUnSupported() bool`, and the fake clientset returns `true`. The
reflector therefore uses the classic list-then-watch path automatically. **No wrapper type needed.**

```go
func newTestWatcher(t *testing.T, resource string, objects ...runtime.Object) (*MyWatcher, *watch.FakeWatcher) {
    t.Helper()

    client := fake.NewSimpleClientset(objects...)

    fw := watch.NewFake()
    t.Cleanup(fw.Stop)

    client.PrependWatchReactor(resource, func(_ k8stesting.Action) (bool, watch.Interface, error) {
        return true, fw, nil
    })

    factory := informers.NewSharedInformerFactoryWithOptions(
        client,
        0,
        informers.WithNamespace(namespace),
    )

    watcher := NewMyWatcher(factory)

    ctx, cancel := context.WithCancel(t.Context())
    t.Cleanup(cancel)
    watcher.Start(ctx)

    return watcher, fw
}
```

### Push events after sync
Always wait for the watcher to sync before pushing events via `fw.Add`, `fw.Modify`, or `fw.Delete`.
The default `FakeWatcher` channel is unbuffered; pushing before the informer has consumed the
initial list can deadlock.

```go
watcher.WaitForSync(t.Context(), 2*time.Second)

fw.Modify(updatedObject)

assert.Eventually(t, func() bool {
    return watcher.Mode() == ModeAudit
}, 2*time.Second, 10*time.Millisecond)
```

Use `assert.Eventually` after every event push. The informer delivers events on a background
goroutine; state changes are not synchronous with `fw.Modify`.

### Blocking list for sync-timeout tests
To test the fail-open path when sync never completes, block the list reactor for the watched
resource and return that resource's list type when the test unblocks it.

```go
block := make(chan struct{})
t.Cleanup(func() { close(block) })

listCalled := make(chan struct{}, 1)
client.PrependReactor("list", resource, func(_ k8stesting.Action) (bool, runtime.Object, error) {
    select {
    case listCalled <- struct{}{}:
    default:
    }
    <-block
    return true, emptyList, nil
})

select {
case <-listCalled:
case <-time.After(time.Second):
    t.Fatal("informer did not issue its initial list")
}
watcher.WaitForSync(t.Context(), 50*time.Millisecond)

assert.Equal(t, ModeAudit, watcher.Mode())
```
