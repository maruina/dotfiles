# kstatus Status Conventions

Status reporting conventions from the kstatus library (`sigs.k8s.io/cli-utils/pkg/kstatus`).

## Status Categories

| Status | Description | User Action |
|--------|-------------|-------------|
| **Current** | Resource has reached desired state | None needed |
| **InProgress** | Resource is working toward desired state | Wait |
| **Failed** | Resource has failed to reach desired state | Investigate |
| **Terminating** | Resource is being deleted | Wait |
| **NotFound** | Resource does not exist | May need to create |
| **Unknown** | Status cannot be determined | Investigate |

## How kstatus Computes Status from Conditions

**Current**: `Reconciling=False` and `Stalled=False` (or absent). Falls back to `Ready=True` if neither condition exists.

**InProgress**: `Reconciling=True`, or `Ready=False` with non-failure reason.

**Failed/Stalled**: `Stalled=True`, or `Ready=False` with failure reason, or InProgress too long.

## Condition Transition Patterns

### Successful Provisioning

```
1. Initial:  Ready=Unknown, Reconciling=True (just created)
2. Progress: Ready=False/Provisioning, Reconciling=True
3. Ready:    Ready=True/Ready, Reconciling=False
```

### Failure and Recovery

```
1. Initial:  Ready=Unknown, Reconciling=True
2. Progress: Ready=False/Provisioning, Reconciling=True
3. Failed:   Ready=False/InvalidConfig, Stalled=True, Reconciling=False
4. Fixed:    Ready=False/Provisioning, Stalled=False, Reconciling=True
5. Ready:    Ready=True/Ready, Reconciling=False
```

## Component Conditions

For complex resources, use component-specific conditions alongside the aggregate:

```yaml
status:
  conditions:
    - type: Ready
      status: "False"
      reason: ComponentsNotReady
      message: "1 of 2 components ready"
    - type: DatabaseReady
      status: "True"
      reason: Connected
    - type: CacheReady
      status: "False"
      reason: Connecting
```

## ObservedGeneration

Set `ObservedGeneration` at the top level of status and in every condition. Without it, callers cannot tell whether the controller has processed the latest spec.

Callers detect staleness: `if status.observedGeneration < metadata.generation`.

## Status Summary Fields

```go
type MyResourceStatus struct {
    // +listType=map
    // +listMapKey=type
    Conditions         []metav1.Condition `json:"conditions,omitempty"`
    ObservedGeneration int64              `json:"observedGeneration,omitempty"`

    // +kubebuilder:default:=0
    ReadyReplicas int32  `json:"readyReplicas"`
    Message       string `json:"message,omitempty"`
}
```

Do not add a top-level `phase` field — see the Phases (deprecated in status) section in the main skill.

## Printer Columns

```go
// +kubebuilder:printcolumn:name="Ready",type="string",JSONPath=".status.conditions[?(@.type=='Ready')].status"
// +kubebuilder:printcolumn:name="Status",type="string",JSONPath=".status.conditions[?(@.type=='Ready')].reason"
// +kubebuilder:printcolumn:name="Age",type="date",JSONPath=".metadata.creationTimestamp"
type MyResource struct { ... }
```

```
NAME       READY   STATUS    AGE
myres-1    True    Ready     5m
myres-2    False   Scaling   2m
myres-3    False   Stalled   10m
```

## Force-Reconcile Annotation Pattern

Spec changes bump `metadata.generation`, but sometimes the controller must re-reconcile without a spec change (e.g., retrying after a transient external failure). Pair an annotation with a status field:

```go
type MyResourceStatus struct {
    // LastHandledReconcileAt records the reconcile-requested-at annotation
    // value last processed by the controller.
    LastHandledReconcileAt string `json:"lastHandledReconcileAt,omitempty"`
    // ...
}
```

The controller compares the annotation against the status field:

```go
if ann := obj.GetAnnotations()["reconcile-requested-at"]; ann != "" && ann != obj.Status.LastHandledReconcileAt {
    // Reconcile, then update status:
    obj.Status.LastHandledReconcileAt = ann
}
```

Users or CI trigger re-reconciliation by patching the annotation:

```bash
kubectl annotate mycluster foo reconcile-requested-at=$(date +%s) --overwrite
```

Flux uses this same pattern (`fluxcd.io/reconcileRequestedAt`). It avoids spec mutations that create noise in GitOps diffs.

## Best Practices

1. Set `ObservedGeneration` in every reconcile
2. Use kstatus standard conditions (`Reconciling`, `Stalled`) plus `Ready` as a readiness signal
3. Use specific CamelCase reasons for each condition state
4. Include actionable messages for failure states
5. Remove conditions that no longer apply
6. Add hysteresis to prevent flip-flopping conditions
7. Use timeout-based stalling for long-running operations
