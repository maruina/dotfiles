# Advanced Runner Patterns

Core pattern, metrics, health checks, coordination, multi-interval tasks, and batch processing for `manager.Runnable` implementations.

## Core Ticker Pattern

Implement `manager.Runnable` with a ticker loop. Return `nil` on context cancellation — returning an error shuts down the entire manager. Log failures and continue; never propagate.

```go
func (r *MetricsRunner) Start(ctx context.Context) error {
    ticker := time.NewTicker(r.interval)
    defer ticker.Stop()

    if err := r.computeMetrics(ctx); err != nil {
        r.logger.Error(err, "initial metrics computation failed")
    }

    for {
        select {
        case <-ctx.Done():
            return nil
        case <-ticker.C:
            if err := r.computeMetrics(ctx); err != nil {
                r.logger.Error(err, "metrics computation failed")
            }
        }
    }
}
```

Register runners before `mgr.Start()`. Implement `NeedLeaderElection() bool` returning `true` when the runner writes to the cluster or computes metrics that should not be duplicated.

## Prometheus Metrics

Register with `metrics.Registry.MustRegister()` (controller-runtime's registry, not the global default). **Reset gauge vectors before recomputing** to remove stale label combinations. Use `PartialObjectMetadata` when only labels/annotations are needed.

## Built-in Controller Metrics

controller-runtime auto-exposes metrics for every reconciler — no setup required. Monitor these to detect unhealthy controllers:

| Metric | What it tells you |
|--------|-------------------|
| `controller_runtime_reconcile_total` (by `result`: success/error/requeue) | Error rate, requeue storms |
| `controller_runtime_reconcile_time_seconds` | Reconciliation latency; spikes indicate external dependency issues |
| `workqueue_depth` | Backlog size; sustained growth means reconcilers can't keep up |
| `workqueue_longest_running_processor_seconds` | Stuck reconciliations; alert if this exceeds your SLO |

## Health Check Runner

Expose runner health via the manager's health endpoints:

```go
type HealthCheckRunner struct {
    client.Client
    logger    logr.Logger
    interval  time.Duration
    healthy   atomic.Bool
    lastError atomic.Pointer[error]
}

func (r *HealthCheckRunner) Start(ctx context.Context) error {
    ticker := time.NewTicker(r.interval)
    defer ticker.Stop()

    for {
        select {
        case <-ctx.Done():
            return nil
        case <-ticker.C:
            if err := r.checkHealth(ctx); err != nil {
                r.healthy.Store(false)
                r.lastError.Store(&err)
                r.logger.Error(err, "health check failed")
            } else {
                r.healthy.Store(true)
                r.lastError.Store(nil)
            }
        }
    }
}

// Implement healthz.Checker for manager health endpoint
func (r *HealthCheckRunner) Check(_ *http.Request) error {
    if !r.healthy.Load() {
        if ep := r.lastError.Load(); ep != nil {
            return *ep
        }
        return fmt.Errorf("health check not yet completed")
    }
    return nil
}
```

Register with manager's health endpoint:

```go
mgr.AddHealthzCheck("external-service", runner.Check)
mgr.AddReadyzCheck("external-service", runner.Check)
```

## Multiple Intervals

Run different tasks at different frequencies:

```go
type MultiIntervalRunner struct {
    client.Client
    logger logr.Logger
}

func (r *MultiIntervalRunner) Start(ctx context.Context) error {
    // Fast metrics: every 15 seconds
    fastTicker := time.NewTicker(15 * time.Second)
    defer fastTicker.Stop()

    // Slow cleanup: every 5 minutes
    slowTicker := time.NewTicker(5 * time.Minute)
    defer slowTicker.Stop()

    for {
        select {
        case <-ctx.Done():
            return nil
        case <-fastTicker.C:
            if err := r.computeFastMetrics(ctx); err != nil {
                r.logger.Error(err, "fast metrics failed")
            }
        case <-slowTicker.C:
            if err := r.performCleanup(ctx); err != nil {
                r.logger.Error(err, "cleanup failed")
            }
        }
    }
}
```

## Jittered Startup

Avoid thundering herd when multiple replicas start:

```go
func (r *MetricsRunner) Start(ctx context.Context) error {
    // Random delay 0-interval to spread load
    jitter := time.Duration(rand.Int63n(int64(r.interval)))
    select {
    case <-ctx.Done():
        return nil
    case <-time.After(jitter):
    }

    ticker := time.NewTicker(r.interval)
    defer ticker.Stop()

    // ... rest of loop
}
```

## Coordination Between Runners

When multiple runners share data (e.g., one warms a cache, another reads it), coordinate with a mutex to avoid reading stale or partial state:

```go
type RunnerCoordinator struct {
    mu           sync.RWMutex
    lastFullSync time.Time
    cache        map[string]CachedData
}

type CacheWarmerRunner struct {
    coordinator *RunnerCoordinator
    client.Client
}

type MetricsRunner struct {
    coordinator *RunnerCoordinator
    client.Client
}

func (r *CacheWarmerRunner) Start(ctx context.Context) error {
    ticker := time.NewTicker(time.Minute)
    defer ticker.Stop()

    for {
        select {
        case <-ctx.Done():
            return nil
        case <-ticker.C:
            data, err := r.fetchData(ctx)
            if err != nil {
                continue
            }
            r.coordinator.mu.Lock()
            r.coordinator.cache = data
            r.coordinator.lastFullSync = time.Now()
            r.coordinator.mu.Unlock()
        }
    }
}

func (r *MetricsRunner) Start(ctx context.Context) error {
    ticker := time.NewTicker(15 * time.Second)
    defer ticker.Stop()

    for {
        select {
        case <-ctx.Done():
            return nil
        case <-ticker.C:
            r.coordinator.mu.RLock()
            cache := r.coordinator.cache
            r.coordinator.mu.RUnlock()

            // Use cached data for metrics computation
            r.computeMetricsFromCache(cache)
        }
    }
}
```

## Work Queue Runner

Decouples event processing from the ticker loop. Controllers enqueue items via `Enqueue()`; the runner processes them at its own pace with rate limiting. Use cases: bulk audit writes, batched webhook notifications, deferred orphan cleanup.

```go
type BatchRunner struct {
    client.Client
    logger   logr.Logger
    queue    workqueue.RateLimitingInterface
    interval time.Duration
}

func (r *BatchRunner) Start(ctx context.Context) error {
    ticker := time.NewTicker(r.interval)
    defer ticker.Stop()

    for {
        select {
        case <-ctx.Done():
            r.queue.ShutDown()
            return nil
        case <-ticker.C:
            r.processQueue(ctx)
        }
    }
}

func (r *BatchRunner) processQueue(ctx context.Context) {
    for r.queue.Len() > 0 {
        select {
        case <-ctx.Done():
            return
        default:
        }

        item, shutdown := r.queue.Get()
        if shutdown {
            return
        }

        if err := r.processItem(ctx, item); err != nil {
            r.logger.Error(err, "failed to process item", "item", item)
            r.queue.AddRateLimited(item)
        } else {
            r.queue.Forget(item)
        }
        r.queue.Done(item)
    }
}

// Enqueue can be called from controllers
func (r *BatchRunner) Enqueue(item interface{}) {
    r.queue.Add(item)
}
```

## Conditional Execution

Skip execution based on cluster state:

```go
func (r *MetricsRunner) Start(ctx context.Context) error {
    ticker := time.NewTicker(r.interval)
    defer ticker.Stop()

    for {
        select {
        case <-ctx.Done():
            return nil
        case <-ticker.C:
            if r.shouldSkip(ctx) {
                r.logger.V(1).Info("skipping metrics computation")
                continue
            }
            if err := r.computeMetrics(ctx); err != nil {
                r.logger.Error(err, "metrics computation failed")
            }
        }
    }
}

func (r *MetricsRunner) shouldSkip(ctx context.Context) bool {
    // Skip if cluster is in maintenance mode
    var cm corev1.ConfigMap
    if err := r.Get(ctx, client.ObjectKey{
        Namespace: "kube-system",
        Name:      "maintenance-mode",
    }, &cm); err == nil {
        if cm.Data["enabled"] == "true" {
            return true
        }
    }
    return false
}
```

## Graceful Degradation

Continue with partial results when some operations fail:

```go
func (r *MetricsRunner) computeMetrics(ctx context.Context) error {
    var errs []error

    // Compute namespace metrics
    if err := r.computeNamespaceMetrics(ctx); err != nil {
        errs = append(errs, fmt.Errorf("namespace metrics: %w", err))
    }

    // Compute pod metrics (independent)
    if err := r.computePodMetrics(ctx); err != nil {
        errs = append(errs, fmt.Errorf("pod metrics: %w", err))
    }

    // Compute quota metrics (independent)
    if err := r.computeQuotaMetrics(ctx); err != nil {
        errs = append(errs, fmt.Errorf("quota metrics: %w", err))
    }

    // Update last run even if some failed
    metricLastRunTimestamp.SetToCurrentTime()

    return errors.Join(errs...)
}
```

## Runner with Backoff

Implement backoff for repeated failures:

```go
func (r *MetricsRunner) Start(ctx context.Context) error {
    backoff := wait.Backoff{
        Duration: r.interval,
        Factor:   2.0,
        Jitter:   0.1,
        Steps:    5,
        Cap:      5 * time.Minute,
    }

    consecutiveFailures := 0

    for {
        var waitDuration time.Duration
        if consecutiveFailures > 0 {
            waitDuration = backoff.Step()
        } else {
            waitDuration = r.interval
            backoff = wait.Backoff{Duration: r.interval, Factor: 2.0, Jitter: 0.1, Steps: 5, Cap: 5 * time.Minute}
        }

        select {
        case <-ctx.Done():
            return nil
        case <-time.After(waitDuration):
            if err := r.computeMetrics(ctx); err != nil {
                consecutiveFailures++
                r.logger.Error(err, "metrics computation failed",
                    "consecutiveFailures", consecutiveFailures,
                    "nextRetryIn", waitDuration)
            } else {
                consecutiveFailures = 0
            }
        }
    }
}
```
