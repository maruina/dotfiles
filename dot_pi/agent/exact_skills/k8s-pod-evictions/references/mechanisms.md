# Pod Disruption Mechanisms
## Classification matrix
“Eviction” can mean an API operation, local kubelet termination, or controller-driven deletion. A PodDisruptionBudget (PDB) is not a general guard against every termination path.

| Mechanism | Acting component/path | PDB behavior | Termination behavior | Candidate evidence |
|---|---|---|---|---|
| Eviction API | Drainer, operator, user, or other client creates `pods/eviction`; API server checks the request | Enforces applicable PDB policy, including unhealthy-Pod policy | Normal Pod deletion grace unless overridden; requires a reachable kubelet for actual shutdown | Accepted non-dry-run eviction request, deletion timestamp, client logs |
| Direct Pod deletion | Workload controller, operator, or user deletes `pods` | Does not enforce PDB | Normal deletion grace unless shortened or forced | Successful `delete`/`deletecollection`, actor identity, rollout/controller logs |
| Node pressure, soft | Kubelet eviction manager | Does not enforce PDB | Threshold must persist for its configured duration; termination grace is capped by `evictionMaxPodGracePeriod` and the Pod's grace; a zero cap can mean immediate termination | Failed Pod with `Evicted` reason and pressure message, threshold/config evidence, kubelet logs |
| Node pressure, hard | Kubelet eviction manager | Does not enforce PDB | No threshold waiting period; documented termination grace is `0s`, not the Pod's requested grace | Pressure message, effective hard threshold, kubelet/runtime timestamps |
| NoExecute taint | Taint eviction controller; part of node lifecycle in older releases | Does not enforce PDB; uses direct deletion | Matching tolerations control the delay; ordinary deletion grace if kubelet can act | `TaintManagerEviction`, historical NoExecute taint and tolerations, controller delete |
| Kubelet admission rejection | Kubelet rejects a bound Pod, including after restart | Does not enforce PDB | Pod becomes terminal Failed; do not assume a zero grace period without version-specific shutdown evidence | `Pod was rejected`, admission reason/event, kubelet restart and admission logs |
| Scheduler priority preemption | Scheduler deletes lower-priority victims | Considers PDB violations as best effort; can violate PDB | Victims receive normal termination grace | Preemption events/conditions, scheduler delete, higher-priority preemptor |
| Node deletion and orphan cleanup | Node-deleting actor, then PodGC | Does not enforce PDB | PodGC requests zero-grace API deletion after detecting orphaned Pods; process termination on a disconnected host is not established | Node delete audit, missing original Node, `DeletionByPodGC`, PodGC delete/logs |

The grace column describes the control path, not a guarantee of successful application shutdown. Runtime delays, an unreachable kubelet, hooks, and force deletion can change observed outcomes. Disruption conditions and event text depend on version and path; their absence alone does not exclude a mechanism.

## Eviction API or direct deletion
- Match audit records to the original Pod identity and time window. An Eviction API request is a **create** operation on a subresource, not a `delete` with a reason of “eviction.”
- Determine whether the eviction was accepted, rejected, retried, or dry-run. Inspect the PDB selector, generation/observed generation, healthy/desired counts, `disruptionsAllowed`, disrupted-Pod bookkeeping, and `unhealthyPodEvictionPolicy` if relevant. Post-incident PDB values are not historical proof.
- Determine who issued the request: drainer, autoscaler, maintenance operator, descheduler, service account, or human. A drain can use direct deletion when eviction is disabled or unavailable; the tool name alone does not prove PDB enforcement.
- For a workload rollout, correlate owner references, revision changes, controller logs, and rollout availability settings. Deployment/StatefulSet rollout controls are separate from a PDB. A PDB does not stop the workload controller from deleting its own Pods.
- Inspect delete options, deletion grace, finalizers, and kubelet/runtime shutdown logs. Do not claim a graceful application exit from the deletion timestamp alone.

## Kubelet node pressure and local storage limits
- Read the Pod's exact status message to identify memory, disk capacity, inodes, PID pressure, or local storage-limit enforcement. `Evicted` alone does not select the trigger.
- Correlate kubelet eviction-manager logs, historical resource signals, node conditions, and runtime termination times. Node conditions or scheduling taints alone do not prove a local eviction.
- Inspect effective `evictionHard`, `evictionSoft`, `evictionSoftGracePeriod`, `evictionMaxPodGracePeriod`, `evictionMinimumReclaim`, and relevant filesystem layout. Establish which threshold fired; do not infer hard versus soft from how fast the replacement appeared.
- Separate the soft threshold's **waiting duration before eviction** from the **Pod termination grace after selection**. Check the actual Pod grace and configured cap; “soft” does not guarantee the full Pod grace.
- Explain victim selection from the resource under pressure, usage relative to requests, priority, and resource-specific ranking. QoS is not a sufficient ranking rule, especially for disk, inodes, and PID pressure. A Guaranteed Pod is not immune to eviction.
- If the message names a container/Pod ephemeral-storage limit or `emptyDir` size limit, investigate that local limit rather than claiming the Node crossed a pressure threshold. Compare the limit and historical usage.
- A kernel OOM kill is a separate path. Correlate kernel/runtime OOM evidence with kubelet eviction evidence; either can occur without the other.

## NoExecute taint
- Identify the **actual** taint key/effect and time it was applied. `NoSchedule` affects placement, not eviction of existing Pods. Pressure taints do not by themselves prove NoExecute eviction.
- Match every relevant NoExecute taint to the Pod's tolerations. No match allows eviction; a match without `tolerationSeconds` tolerates that taint indefinitely; a finite match delays eviction. Reconstruct controller timing from logs rather than simply adding seconds to a present-day Node snapshot.
- For `node.kubernetes.io/unreachable` or `node.kubernetes.io/not-ready`, correlate Lease renewal, Ready transitions, node lifecycle logs, taint application, toleration expiry, and the taint eviction controller's action.
- Many Pods receive default 300-second not-ready/unreachable tolerations, but admission configuration and explicit tolerations can change them. DaemonSet Pods commonly tolerate these taints indefinitely. Verify the original Pod spec.
- Kubernetes 1.29 separated taint eviction into its own controller. Check the deployed version and enabled controllers; do not assume a NoExecute taint guarantees deletion in a cluster where the controller is disabled.
- A disconnected kubelet might not observe the deletion, so containers can continue running while the Pod appears Terminating. Force deletion removes API state; it does not fence the old process or make stateful replacement safe.

## Kubelet admission after restart
- Look for terminal `status.phase=Failed`, an admission reason such as `NodeAffinity` or `OutOfcpu`, and a message beginning `Pod was rejected`. Reasons vary by handler and release.
- Confirm the Pod was bound and previously running, then correlate a kubelet restart/crash with rejection. Admission rejection can also happen on first admission; restart is not established by the rejection message alone.
- Compare the historical node labels/allocatable/host-port usage and other admission-relevant state against the Pod's selector, affinity, resource requests, and admission handlers. Scheduler placement earlier in time does not prove kubelet admission will pass after a restart.
- A Failed Pod is terminal. Restoring a label or restarting kubelet does not make that same Pod runnable again; investigate the owner's replacement behavior.
- A surviving Failed API object without a deletion timestamp fits local rejection. Later deletion by PodGC might only be cleanup, not the cause.
- The source article conflicts about graceful termination in this path. In v1.32.0, `rejectPod` sets Failed status; Pod workers have terminal-Pod teardown and grace-period calculation that can use the Pod's requested grace. Determine the actual release and runtime path before claiming an immediate kill or full graceful shutdown.

## Scheduler priority preemption
- Correlate a victim's `Preempted` event or `DisruptionTarget` reason `PreemptionByScheduler` when present with scheduler logs and a direct deletion attributed to the scheduler.
- Identify the higher-priority Pod, its scheduling failure, candidate node, requested resources, priority, preemption policy, and nominated node when available. A nomination is supporting evidence, not proof that the preemptor eventually ran there.
- Check victim and preemptor priorities and PDB membership. Scheduler preemption tries to minimize PDB violations but can proceed despite them; there need not be an Eviction API call.
- Confirm the actor. Kubelet-local preemption for critical Pods and external operators are distinct from scheduler preemption; an event containing “preempt” does not alone identify the scheduler.
- Separate victim termination time from replacement or preemptor scheduling time. Normal grace can delay resource release.

## Node deletion and PodGC
- Find the original Node's deletion audit and initiating actor, such as a cloud controller, Cluster API controller, administrator, or cluster management system. Correlate machine/instance lifecycle evidence if available.
- Verify the Node UID/provider ID. A Node with the same name might have been recreated after deletion.
- Correlate subsequent PodGC cleanup with `DeletionByPodGC` and message `PodGC: node no longer exists` when available. The controller detects and checks missing Nodes before zero-grace deletion; do not call this instantaneous when the evidence only shows eventual cleanup.
- PodGC also cleans already terminal Pods. Distinguish an orphaned-Pod deletion after Node loss from cleanup of a Pod that failed earlier through another mechanism.
- API removal does not prove the old host or container stopped. If the host was partitioned rather than powered off, duplicate stateful execution remains a safety risk. Report missing fencing/process-exit evidence explicitly.

## Sources and interpretation limits
Primary input: Matteo Ruina's Obsidian note `k8s controllers/Every pod eviction in Kubernetes, explained`, clipped on 2025-03-02 from [Ahmet Alp Balkan's article](https://ahmet.im/blog/kubernetes-evictions/). The skill is an investigation procedure derived from that note, not a verbatim copy.

Use the incident's deployed versions and effective configuration as the source of truth. Consult release-matched source when documentation or the article cannot settle a behavior. Do not copy article defaults such as heartbeat cadence, node-monitor grace, or PodGC thresholds into a diagnosis without checking them.

Official references:
- [API-initiated eviction](https://kubernetes.io/docs/concepts/scheduling-eviction/api-eviction/)
- [Node-pressure eviction](https://kubernetes.io/docs/concepts/scheduling-eviction/node-pressure-eviction/)
- [Taints and tolerations](https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration/)
- [Separate taint eviction controller in Kubernetes 1.29](https://kubernetes.io/blog/2023/12/19/kubernetes-1-29-taint-eviction-controller/)
- [Pod priority and preemption](https://kubernetes.io/docs/concepts/scheduling-eviction/pod-priority-preemption/)
- [Pod lifecycle and PodGC](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/)
- [Disruptions and PDBs](https://kubernetes.io/docs/concepts/workloads/pods/disruptions/)
- [Kubernetes audit records](https://kubernetes.io/docs/reference/config-api/apiserver-audit.v1/)

Release-pinned implementation references used to resolve the note's ambiguities:
- [v1.32.0 kubelet: `rejectPod`, `HandlePodAdditions`](https://github.com/kubernetes/kubernetes/blob/v1.32.0/pkg/kubelet/kubelet.go)
- [v1.32.0 Pod workers: terminal phases and `calculateEffectiveGracePeriod`](https://github.com/kubernetes/kubernetes/blob/v1.32.0/pkg/kubelet/pod_workers.go)
- [v1.32.0 taint eviction: direct Pod deletion](https://github.com/kubernetes/kubernetes/blob/v1.32.0/pkg/controller/tainteviction/taint_eviction.go)
- [v1.32.0 PodGC: `gcOrphaned`, `markFailedAndDeletePodWithCondition`](https://github.com/kubernetes/kubernetes/blob/v1.32.0/pkg/controller/podgc/gc_controller.go)
