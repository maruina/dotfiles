# Operational Patterns

Reconciliation control, local development, migrations, and edge cases for production controllers.

## Reconciliation Control

Pause and force-reconcile mechanisms for production controllers. Both patterns originate from the Flux ecosystem.

### Suspend Reconciliation

Add a `suspend` field to the spec to pause all reconciliation:

```go
// MyResourceSpec defines the desired state
type MyResourceSpec struct {
    // Suspend pauses reconciliation for this resource.
    // +optional
    Suspend bool `json:"suspend,omitempty"`
}
```

Check suspension after the deletion path — a suspended object with a finalizer must still be deletable.

**Always update status when suspended.** Returning early without writing status leaves operators with no indication that the pause is taking effect. At minimum: set `Reconciling=False` and expose a `Paused` printcolumn so `kubectl get` shows the state clearly.

```go
// +kubebuilder:printcolumn:name="Paused",type=boolean,JSONPath=`.spec.suspend`
// +kubebuilder:printcolumn:name="Reconciling",type=string,JSONPath=`.status.conditions[?(@.type=="Reconciling")].status`
type MyResource struct { ... }

func (r *MyReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    log := log.FromContext(ctx)

    var obj myv1.MyResource
    if err := r.Get(ctx, req.NamespacedName, &obj); err != nil {
        return ctrl.Result{}, client.IgnoreNotFound(err)
    }

    // Deletion always runs, even when suspended
    if !obj.DeletionTimestamp.IsZero() {
        return r.reconcileDelete(ctx, &obj)
    }

    if obj.Spec.Suspend {
        log.Info("reconciliation is suspended")
        // Write status so operators can observe the pause is in effect.
        meta.SetStatusCondition(&obj.Status.Conditions, metav1.Condition{
            Type:               "Reconciling",
            Status:             metav1.ConditionFalse,
            Reason:             "Suspended",
            Message:            "Reconciliation is suspended",
            ObservedGeneration: obj.Generation,
        })
        // Use the deferred SSA patch or a direct patch here — the important
        // thing is that the condition is written, not just logged.
        return ctrl.Result{}, r.patchStatus(ctx, &obj)
    }

    // Proceed with normal reconciliation...
    return r.reconcileNormal(ctx, &obj)
}
```

**Important:** Register the defer *before* the suspend check — not after — so the defer fires even when suspended and writes `Reconciling=False` to status. Guarding `updateStatus` with `!obj.Spec.Suspend` inside the defer recreates the exact observability gap this pattern is trying to prevent:

```go
func (r *MyReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    var obj myv1.MyResource
    if err := r.Get(ctx, req.NamespacedName, &obj); err != nil {
        return ctrl.Result{}, client.IgnoreNotFound(err)
    }

    if !obj.DeletionTimestamp.IsZero() {
        return r.reconcileDelete(ctx, &obj)
    }

    // Register the defer before the suspend check so status is always written.
    // Do NOT guard updateStatus with !obj.Spec.Suspend — that silences the
    // Reconciling=False write and leaves operators blind to the suspended state.
    defer func() {
        r.updateStatus(ctx, &obj)
        r.recordMetrics(&obj)
    }()

    if obj.Spec.Suspend {
        meta.SetStatusCondition(&obj.Status.Conditions, metav1.Condition{
            Type:    "Reconciling",
            Status:  metav1.ConditionFalse,
            Reason:  "Suspended",
            Message: "Reconciliation is suspended",
        })
        return ctrl.Result{}, nil // defer fires, writes Reconciling=False
    }

    // ... reconciliation logic
}
```

Operators can suspend via kubectl:

```bash
# Suspend reconciliation
kubectl patch myresource my-app --type=merge -p '{"spec": {"suspend": true}}'

# Resume reconciliation
kubectl patch myresource my-app --type=merge -p '{"spec": {"suspend": false}}'
```

### Force Reconciliation via Annotation

Trigger immediate reconciliation by annotating the resource, bypassing the scheduled interval. Pattern established by Flux.

Add a status field to track handled requests:

```go
// MyResourceStatus defines the observed state
type MyResourceStatus struct {
    // LastHandledReconcileAt holds the most recent reconcile request value.
    // +optional
    LastHandledReconcileAt string `json:"lastHandledReconcileAt,omitempty"`
}
```

Define the annotation constant:

```go
const (
    // ReconcileRequestAnnotation triggers reconciliation; any value change fires a watch event.
    ReconcileRequestAnnotation = "mygroup.io/requestedAt"
)
```

Track the annotation value in status — **only after the external operation succeeds**:

```go
func (r *MyReconciler) reconcileNormal(ctx context.Context, obj *myv1.MyResource) (ctrl.Result, error) {
    // Determine whether this is a forced reconcile *before* doing any work.
    // GetAnnotations() returns nil if unset; map read on nil returns "" (safe).
    requestedAt := obj.GetAnnotations()[ReconcileRequestAnnotation]
    isForced := requestedAt != "" && requestedAt != obj.Status.LastHandledReconcileAt

    // ... do the external operation ...
    if err := r.triggerExternalWork(ctx, obj); err != nil {
        // Do NOT write LastHandledReconcileAt here.
        // If written before success and the operation fails, the annotation value
        // is consumed and the force-reconcile request is silently dropped on the
        // next retry (isForced becomes false because the values now match).
        return ctrl.Result{}, err
    }

    // Record the annotation value only after the work succeeds.
    if isForced {
        obj.Status.LastHandledReconcileAt = requestedAt
    }

    return ctrl.Result{RequeueAfter: obj.Spec.Interval.Duration}, nil
}
```

Controller watches trigger reconciliation on annotation changes automatically. The status field serves as an audit trail.

**Critical timing rule**: Write `LastHandledReconcileAt` only after the external operation succeeds. If you write it at the start of `reconcileNormal` and then a downstream call fails, the annotation value is consumed. On the next retry the guard sees `requestedAt == lastHandledReconcileAt` and skips the forced path, permanently dropping the operator's request until they re-annotate.

Operators trigger reconciliation with:

```bash
# Trigger immediate reconciliation
kubectl annotate myresource my-app mygroup.io/requestedAt="$(date +%s)" --overwrite
```

### Combined Pattern: Force with Token Validation

For additional safety, require the force annotation to match a specific token (useful when multiple annotations are in play):

```go
const (
    ReconcileRequestAnnotation = "mygroup.io/requestedAt"
    ForceRequestAnnotation     = "mygroup.io/forceAt"
)

type MyResourceStatus struct {
    LastHandledReconcileAt string `json:"lastHandledReconcileAt,omitempty"`
    LastHandledForceAt     string `json:"lastHandledForceAt,omitempty"`
}

func (r *MyReconciler) shouldForceReconcile(obj *myv1.MyResource) bool {
    requestedAt := obj.GetAnnotations()[ReconcileRequestAnnotation]
    forceAt := obj.GetAnnotations()[ForceRequestAnnotation]

    // Force only when both annotations match and we haven't handled this force yet
    return forceAt != "" &&
           forceAt == requestedAt &&
           forceAt != obj.Status.LastHandledForceAt
}

func (r *MyReconciler) reconcileNormal(ctx context.Context, obj *myv1.MyResource) (ctrl.Result, error) {
    forceReconcile := r.shouldForceReconcile(obj)

    if forceReconcile {
        log.FromContext(ctx).Info("force reconciliation requested")
        obj.Status.LastHandledForceAt = obj.GetAnnotations()[ForceRequestAnnotation]
        // Bypass caches, re-fetch external state, etc.
    }

    // Track the reconcile request
    if v, ok := obj.GetAnnotations()[ReconcileRequestAnnotation]; ok {
        obj.Status.LastHandledReconcileAt = v
    }

    // ... reconciliation logic
}
```

### Reference Implementation

Reference implementations from Flux:
- [kustomize-controller](https://github.com/fluxcd/kustomize-controller/blob/main/internal/controller/kustomization_controller.go) - Suspend and reconcile patterns
- [fluxcd/pkg/apis/meta](https://github.com/fluxcd/pkg/blob/main/apis/meta/annotations.go) - Annotation constants and helpers
- [Flux documentation](https://fluxcd.io/flux/components/kustomize/kustomizations/#triggering-a-reconcile) - Operator usage patterns

## External Operation Idempotency

Controllers frequently trigger external operations (Temporal workflows, async jobs, cloud APIs) that are not themselves idempotent. The controller is responsible for making the trigger idempotent.

### Generation-gated trigger

Track whether the current generation has been handled in status. Skip the external call if the generation is already recorded:

```go
func (r *MyReconciler) reconcileNormal(ctx context.Context, obj *myv1.MyResource) (ctrl.Result, error) {
    // Gate the trigger: if WorkflowRef already records this generation, skip.
    if obj.Status.WorkflowRef != nil && obj.Status.WorkflowRef.Generation == obj.Generation {
        return ctrl.Result{}, nil
    }

    handle, err := r.triggerWorkflow(ctx, obj)
    if err != nil {
        // Check for AlreadyStarted — external system already has an in-flight run.
        if isAlreadyStarted(err) {
            // DO NOT update WorkflowRef.Generation here.
            // The in-flight run was not started by *this* reconcile; advancing
            // the generation marker suppresses future retries for this generation.
            // Requeue and wait for the existing run to finish.
            return ctrl.Result{RequeueAfter: time.Minute}, nil
        }
        return ctrl.Result{}, err
    }

    // Only advance the idempotency marker after a *new* run is actually started.
    obj.Status.WorkflowRef = &WorkflowRef{
        ID:         handle.GetID(),
        RunID:      handle.GetRunID(),
        Generation: obj.Generation,
        StartedAt:  metav1.Now(),
    }
    return ctrl.Result{}, nil
}
```

**Key rules:**
- Advance the idempotency marker (generation, run ID, etc.) only after a new operation is confirmed started.
- On `AlreadyStarted`: leave the marker unchanged and requeue. Do not record `LastHandledReconcileAt` either — the force-reconcile annotation should remain active so the controller retries once the existing run finishes.
- After a crash between trigger and status patch: the next reconcile will see the missing marker and call the external API again. If the external API is truly non-idempotent, add a pre-trigger state check (e.g. query RMS / check current resource phase) to confirm the operation is safe to re-run.

### Condition flip-flop with RequeueAfter

Avoid setting and immediately clearing `Reconciling=True` in the same reconcile pass. If you set it unconditionally at the start and then clear it in an `AlreadyStarted` recovery branch, every pass writes a fresh condition timestamp, triggers a new watch event, and defeats the `RequeueAfter` throttle:

```go
// Bad: sets Reconciling=True unconditionally, then clears it → tight loop
meta.SetStatusCondition(&obj.Status.Conditions, reconcilingTrue)
handle, err := r.triggerWorkflow(ctx, obj)
if isAlreadyStarted(err) {
    meta.SetStatusCondition(&obj.Status.Conditions, reconcilingFalse) // flip-flop
    return ctrl.Result{RequeueAfter: time.Minute}, nil
}

// Good: set Reconciling=True only on error-return paths (or leave it as-is if stable)
handle, err := r.triggerWorkflow(ctx, obj)
if isAlreadyStarted(err) {
    // Don't touch Reconciling — leave the existing condition intact.
    return ctrl.Result{RequeueAfter: time.Minute}, nil
}
if err != nil {
    meta.SetStatusCondition(&obj.Status.Conditions, reconcilingTrue) // only on error
    return ctrl.Result{}, err
}
```

## Local Development with Leader Election

When developing locally against a cluster that already has the controller running as leader, handle the lease with one of these approaches.

### Option 1: Scale Down (Simplest)

```bash
# Scale down the controller in the cluster
kubectl scale deployment controller-manager -n system --replicas=0

# Run locally
go run ./cmd/main.go

# Remember to scale back up when done!
kubectl scale deployment controller-manager -n system --replicas=1
```

**Drawback:** Easy to forget scaling back up.

### Option 2: Lease Hijacking

Force-acquire the leader lease for local development. Reference implementation from [operatorpkg](https://github.com/awslabs/operatorpkg/blob/main/leaderelection/leasehijacker.go):

```go
import (
    "context"
    "time"

    coordinationv1 "k8s.io/api/coordination/v1"
    metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
    "k8s.io/client-go/kubernetes"
    "k8s.io/utils/ptr"
)

// HijackLease forcibly acquires the leader lease for local development
func HijackLease(ctx context.Context, clientset kubernetes.Interface, namespace, leaseName, identity string) error {
    lease, err := clientset.CoordinationV1().Leases(namespace).Get(ctx, leaseName, metav1.GetOptions{})
    if err != nil {
        return err
    }

    // Force acquire the lease
    lease.Spec.HolderIdentity = ptr.To(identity)
    lease.Spec.AcquireTime = ptr.To(metav1.NewMicroTime(time.Now()))
    lease.Spec.RenewTime = ptr.To(metav1.NewMicroTime(time.Now()))
    var transitions int32
    if lease.Spec.LeaseTransitions != nil {
        transitions = *lease.Spec.LeaseTransitions
    }
    lease.Spec.LeaseTransitions = ptr.To(transitions + 1)

    _, err = clientset.CoordinationV1().Leases(namespace).Update(ctx, lease, metav1.UpdateOptions{})
    return err
}

// Usage in main.go for local development
func main() {
    if os.Getenv("DEV_HIJACK_LEASE") == "true" {
        clientset, _ := kubernetes.NewForConfig(cfg)
        if err := HijackLease(ctx, clientset, "system", "my-controller-leader", hostname); err != nil {
            setupLog.Error(err, "failed to hijack lease")
            os.Exit(1)
        }
        setupLog.Info("hijacked leader lease for local development")
    }

    // Continue with normal manager setup...
}
```

**Warning:** Only use in development. The cluster controller will lose leadership and stop reconciling.

### Option 3: Coordinated Leader Election (Beta)

CoordinatedLeaderElection graduated to **beta in Kubernetes 1.33** (KEP-4355), using `LeaseCandidate` objects for deterministic election during upgrades. Primarily benefits control plane components, not custom controllers — use scale-down or lease hijacking for local dev.

## Server-Side Apply (SSA) Status

SSA is **fully supported** for both spec and status in controller-runtime ([Issue #347](https://github.com/kubernetes-sigs/controller-runtime/issues/347) closed).

### SSA for Spec

```go
func (r *MyReconciler) reconcileDeployment(ctx context.Context, obj *myv1.MyResource) error {
    dep := r.buildDeployment(obj)

    return r.Patch(ctx, dep,
        client.Apply,
        client.FieldOwner("mycontroller"),
        client.ForceOwnership,
    )
}
```

### SSA for Status

Use `SubResource("status").Apply()` for SSA status updates:

```go
func (r *MyReconciler) updateStatus(ctx context.Context, obj *myv1.MyResource) error {
    return r.Status().Patch(ctx, obj,
        client.Apply,
        client.FieldOwner("mycontroller-status"),
        client.ForceOwnership,
    )
}
```

MergeFrom patch remains a simpler alternative when only one controller owns status:

```go
func (r *MyReconciler) updateStatus(ctx context.Context, obj *myv1.MyResource) error {
    patch := client.MergeFrom(obj.DeepCopy())
    // Modify obj.Status...
    return r.Status().Patch(ctx, obj, patch)
}
```

## API Group Migration

Kubernetes **does not support** conversion webhooks between different API groups. API group + resource name is the unique identifier.

### The Problem

```yaml
# OLD
apiVersion: operator.small-tech.io/v1
kind: MyResource

# NEW (different group - NOT a version upgrade!)
apiVersion: operator.big-tech.io/v1
kind: MyResource
```

The API server treats these as two separate APIs, not versions of the same API.

### Migration Strategies

#### Strategy 1: Dual-Stack Controller

Run the controller to handle both old and new APIs during transition:

```go
func main() {
    mgr, err := ctrl.NewManager(cfg, ctrl.Options{...})

    // Register reconciler for OLD API
    if err := (&OldMyResourceReconciler{
        Client: mgr.GetClient(),
    }).SetupWithManager(mgr); err != nil {
        setupLog.Error(err, "unable to create controller for old API")
        os.Exit(1)
    }

    // Register reconciler for NEW API
    if err := (&NewMyResourceReconciler{
        Client: mgr.GetClient(),
    }).SetupWithManager(mgr); err != nil {
        setupLog.Error(err, "unable to create controller for new API")
        os.Exit(1)
    }
}
```

The old reconciler can:
- Continue managing existing resources
- Set a deprecation condition
- Optionally auto-migrate to the new API

#### Strategy 2: Off-Cluster Migration Tool

```bash
# Export all old resources
kubectl get myresources.operator.small-tech.io -A -o yaml > old-resources.yaml

# Transform to new API group
./migrate-tool transform old-resources.yaml > new-resources.yaml

# Apply new resources
kubectl apply -f new-resources.yaml

# After verification, delete old resources
kubectl delete -f old-resources.yaml
```

#### Strategy 3: In-Place Annotation Migration

Add an annotation to old resources signaling the controller to create the new resource:

```yaml
apiVersion: operator.small-tech.io/v1
kind: MyResource
metadata:
  annotations:
    operator.big-tech.io/migrate: "true"
```

The old controller creates the new resource, transfers ownership, then removes the finalizer.

### Reference

[LinkedIn Engineering: How LinkedIn Moved Its Kubernetes APIs to a Different API Group](https://www.linkedin.com/blog/engineering/infrastructure/how-linkedin-moved-its-kubernetes-apis-to-a-different-api-group)

## Controller-CRD Version Mismatch Prevention

Updating the controller binary without updating the CRD causes subtle mismatches.

### The Failure Mode

1. Controller v2 adds `status.bootState` field
2. Cluster still has CRD v1 (no `bootState` in schema)
3. Controller writes `bootState`, API server silently drops it
4. Controller re-reads, sees `bootState` missing, writes again
5. Infinite reconciliation loop

### Solution 1: Strict Field Validation

```go
mgr, err := ctrl.NewManager(cfg, ctrl.Options{
    NewClient: func(config *rest.Config, options client.Options) (client.Client, error) {
        cli, err := client.New(config, options)
        if err != nil {
            return nil, err
        }
        // Errors on unknown fields instead of silently dropping
        return client.WithFieldValidation(cli, metav1.FieldValidationStrict), nil
    },
})
```

With strict validation, the API server returns an error when the controller tries to write an unknown field, failing fast rather than silently.

### Solution 2: CRD Version Check at Startup

```go
func verifyCRDVersion(ctx context.Context, cl client.Client) error {
    var crd apiextensionsv1.CustomResourceDefinition
    if err := cl.Get(ctx, types.NamespacedName{Name: "myresources.mygroup.io"}, &crd); err != nil {
        return fmt.Errorf("fetching CRD: %w", err)
    }

    // Check for required fields in schema
    schema := crd.Spec.Versions[0].Schema.OpenAPIV3Schema
    if _, ok := schema.Properties["status"].Properties["bootState"]; !ok {
        return fmt.Errorf("CRD missing status.bootState field - please update CRD before deploying controller v2")
    }

    return nil
}

func main() {
    // Create a direct client for startup checks
    cl, err := client.New(cfg, client.Options{Scheme: scheme})
    if err != nil {
        setupLog.Error(err, "unable to create client")
        os.Exit(1)
    }

    if err := verifyCRDVersion(context.Background(), cl); err != nil {
        setupLog.Error(err, "CRD version mismatch")
        os.Exit(1)
    }

    // Continue with manager setup...
}
```

### Solution 3: Init Container for CRD Installation

```yaml
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      initContainers:
      - name: install-crds
        image: controller:v2
        command: ["kubectl", "apply", "-f", "/crds/"]
        volumeMounts:
        - name: crds
          mountPath: /crds
      containers:
      - name: controller
        image: controller:v2
```

### Best Practices

1. **Always apply CRDs before deploying controller** - CRD apply is quick and idempotent
2. **Use Patch over Update** - Patch only sends changed fields, reducing risk
3. **Enable strict validation** when you control both CRD and controller
4. **Version CRDs alongside controller** - Same release includes both

## Kubebuilder Helm Plugin

Kubebuilder v4+ includes an alpha plugin for generating Helm charts:

```bash
# Initialize with Helm plugin
kubebuilder init --plugins=helm/v2-alpha

# Or add to existing project
kubebuilder edit --plugins=helm/v2-alpha
```

This generates:
- `charts/` directory with Helm chart structure
- Values for common customizations (replicas, resources, etc.)
- Templates derived from `config/` manifests

Reference: [Kubebuilder Helm Plugin Documentation](https://book.kubebuilder.io/plugins/available/helm-v2-alpha)

## Admission Webhook Filtering

Limit which resources trigger admission webhooks with namespace or label selectors:

```yaml
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingWebhookConfiguration
metadata:
  name: myresource-validator
webhooks:
- name: validate.myresource.mygroup.io
  namespaceSelector:
    matchExpressions:
    - key: environment
      operator: In
      values: ["production", "staging"]
  objectSelector:
    matchLabels:
      validate: "true"
  rules:
  - apiGroups: ["mygroup.io"]
    apiVersions: ["v1"]
    operations: ["CREATE", "UPDATE"]
    resources: ["myresources"]
```

Selectors avoid webhook overhead for resources that don't need validation.

## EnqueueRequestsFromMapFunc Error Handling

`EnqueueRequestsFromMapFunc` cannot return errors ([#1996](https://github.com/kubernetes-sigs/controller-runtime/issues/1996), open/frozen). The `MapFunc` signature accepts `context.Context` but still lacks error returns. Handle failures within the function:

```go
func (r *MyReconciler) findObjectsForSecret(ctx context.Context, secret client.Object) []reconcile.Request {
    log := log.FromContext(ctx)

    var list myv1.MyResourceList
    if err := r.List(ctx, &list, client.MatchingFields{"spec.secretRef": secret.GetName()}); err != nil {
        // Cannot return error - log and return empty
        log.Error(err, "failed to list MyResources for Secret",
            "secret", secret.GetName(),
            "namespace", secret.GetNamespace())
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

Workarounds:
- Log the error and return empty (resources will reconcile on their own schedule)
- Use a metric to track mapping failures
- Consider if the mapping is truly necessary or if Watch with predicates suffices
