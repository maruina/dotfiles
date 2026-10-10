---
name: k8s-pod-evictions
description: Investigate Kubernetes Pod evictions, unexpected Pod termination or deletion, PDB bypass, node-pressure eviction, NoExecute taints, kubelet admission failures after restart, priority preemption, and Node deletion. Use to identify the terminating actor, build a causal timeline, and distinguish Pod eviction from OOMKilled or container restarts. Portable across personal and work clusters; read-only unless remediation is explicitly authorized.
---
# Investigate Kubernetes Pod Evictions
Identify which actor stopped or deleted the Pod, why it acted, and what the evidence proves. Do not infer the mechanism from the word “eviction” alone.

Read [references/mechanisms.md](references/mechanisms.md) before classifying the incident. It contains the mechanism matrix, branch-specific checks, and sources. Resolve this path relative to this skill directory.

## Safety and scope
- Keep the investigation read-only. Do not drain, delete, force-delete, restart kubelet, change taints or labels, modify disruption budgets, disable controllers, or change eviction thresholds without explicit authorization.
- Confirm the cluster/context before reads. Use an explicit context on each command; do not change the global kubeconfig context.
- Scope queries to the Pod UID, namespace, node, workload, and UTC time window. Start with a 15-minute window around the reported event; expand only when evidence requires it. Use request timeouts, result limits, and bounded log reads. Do not start watches or fleet-wide scans by default.
- Treat unavailable audit logs, expired events, deleted objects, permissions, and expired credentials as evidence gaps. Do not refresh credentials or request broader access without approval.
- Pod JSON and logs can contain sensitive values. Keep raw evidence local and report only relevant, redacted fields. Do not read Secrets for this investigation or submit private evidence to public web search.
- Use existing read-only cluster and observability tools. This skill does not require Datadog, cloud access, or the Obsidian vault at runtime.
- For Datadog investigations, load `compute-support`, `k8s-audit-logs`, and `datadog-mcp` when available and relevant. Follow their context, organization, and query rules. Missing work-only skills must not block personal-cluster investigations.

## 1. Establish the incident identity
Obtain discoverable facts first. Ask only for information that available evidence cannot resolve:
- Cluster/context, namespace, Pod name **and UID**, owning workload, node name and node UID/provider ID if available.
- Incident time range and timezone; normalize the timeline to UTC.
- What changed: a container restarted, the Pod became Failed, deletion began, the API object disappeared, or a replacement Pod appeared.
- API server and affected kubelet versions, plus relevant controller, admission, scheduler, and kubelet configuration when the candidate mechanism depends on them.

Names can be reused. Do not treat a replacement Pod or recreated Node as the original object. If the Pod is gone, recover its UID, node, and status from retained events, audit records, controller logs, or observability history. State when identity remains uncertain.

## 2. Preserve the first evidence
For a surviving Pod, collect these fields before they disappear:
- `metadata.uid`, owner references, labels, creation/deletion timestamps, deletion grace, and finalizers.
- `spec.nodeName`, priority/priority class, preemption policy, tolerations, affinity/selector, requests/limits, and termination grace.
- `status.phase`, `reason`, `message`, conditions including `DisruptionTarget` when available, QoS class, and container states, last states, exit reasons, restart counts, and termination times.
- Pod events, node conditions/taints/labels/allocatable, node events, Lease heartbeat, matching PodDisruptionBudgets (PDBs), and owner rollout state.

The following Fish commands are a starting point. Replace `CLUSTER_CONTEXT`, `NAMESPACE`, and `POD_NAME` before execution:

```fish
set context CLUSTER_CONTEXT
set namespace NAMESPACE
set pod POD_NAME
kubectl --context "$context" --request-timeout=20s version -o json
kubectl --context "$context" --request-timeout=20s get pod "$pod" -n "$namespace" -o json
```

Copy the original Pod UID and node name from the evidence. Replace `POD_UID` and `NODE_NAME` in the following commands. Do not use the replacement Pod's UID:

```fish
set pod_uid POD_UID
set node NODE_NAME
kubectl --context "$context" --request-timeout=20s get events -n "$namespace" --field-selector "involvedObject.uid=$pod_uid" -o json
kubectl --context "$context" --request-timeout=20s get node "$node" -o json
kubectl --context "$context" --request-timeout=20s get lease "$node" -n kube-node-lease -o json
kubectl --context "$context" --request-timeout=20s get pdb -n "$namespace" -o json
```

Check command failures before continuing. A `NotFound` result does not establish when or why an object was deleted. Filter namespace PDB results by selectors matching the **original** Pod's labels. If event volume is large, use the available log store with the same UID and a time/result limit. Event aggregation and retention can hide intermediate transitions.

## 3. Separate container failure from Pod disruption
- `OOMKilled`, exit code 137, a `Killing` event, or a rising restart count alone does not prove Pod eviction. Check container limits, kernel OOM logs, kubelet/runtime logs, Pod UID, and Pod phase. A kernel OOM kill can occur before kubelet reacts to pressure.
- `CrashLoopBackOff` with the same UID is a restart symptom, not evidence of Pod deletion. Determine why the container exits.
- `Evicted` is a Pod status reason, not proof of an Eviction API request. Use the status message to distinguish node pressure from local storage-limit enforcement or another kubelet path.
- `Terminating` is a display status, not a Pod phase. Inspect `deletionTimestamp`, finalizers, node reachability, and actual container shutdown evidence.
- A different Pod UID proves replacement, not its cause. Read the old Pod's evidence and the owner's actions.
- Scheduler `FailedScheduling` on an unbound Pod is not kubelet admission rejection. A rejected bound Pod can be terminal even without a deletion timestamp.

## 4. Identify the actor and initiating path
Build a timeline before choosing a diagnosis. Use status/conditions and events to select a candidate, then corroborate it with the relevant audit records and component logs.

For audit evidence, distinguish:
- Eviction API: `verb=create`, `objectRef.resource=pods`, `objectRef.subresource=eviction` or a request URI ending in `/pods/<name>/eviction`.
- Direct Pod deletion: `verb=delete`, resource `pods`, no eviction subresource. Include `deletecollection` when the actor deletes Pods in bulk; those records might not identify a single Pod UID.
- Node deletion: `verb=delete`, resource `nodes`; follow subsequent PodGC cleanup separately.
- Local kubelet action: Pod status updates can appear in audit logs **without** an initiating Pod delete or eviction request. Use kubelet and runtime logs to establish the action.

Record audit ID, stage, request/response times, user/service account, impersonation if present, user agent, object identity, response code, and delete options when available. Deduplicate stages by audit ID. User agent is supporting evidence, not authenticated identity. Audit policies might omit request bodies, UIDs, or status updates; state the limit.

An eviction request is not proof of accepted eviction. A PDB rejection such as HTTP 429 does not prove that the Pod was deleted by that request. Dry-run requests do not mutate the Pod. Correlate successful non-dry-run requests with deletion/status evidence and look for later requests from other actors.

Keep the initiating actor distinct from the cleanup actor. For example, a cloud controller deletes the Node, then PodGC deletes orphaned Pods. A later PodGC deletion of an already Failed Pod is not the original cause of failure.

## 5. Test the candidate against the mechanism reference
Follow the matching branch in `references/mechanisms.md`. For each candidate, answer:
1. Which actor acted, through which API or local path?
2. Which trigger preceded the action, and which evidence connects them?
3. Did this path enforce a PDB, consider it only as best effort, or bypass it?
4. What grace period was requested or selected, and what shutdown actually occurred?
5. Which credible alternative does the evidence rule out? Which remains unresolved?

Use historical configuration and status where possible. A healthy Node, renewed Lease, changed PDB, or restored label observed after the incident does not disprove a previous trigger. Defaults from the source article are hypotheses until checked against the cluster's version and configuration.

If the evidence does not fit the listed mechanisms, leave the diagnosis open. Check graceful node shutdown, kubelet-local critical-Pod preemption, external operators, deschedulers, cloud interruption, and runtime failure as relevant. Attribute their API or local path instead of forcing a match.

## 6. Report the result
Use this structure:
- **Finding:** mechanism and confidence: confirmed, likely, or undetermined. Confirmed requires correlated evidence of the action and trigger; name any missing link.
- **Identity and impact:** cluster, namespace, original Pod UID, node identity, owner, time window, affected replicas, and observed availability impact.
- **Timeline:** UTC time, actor/action, evidence source, and interpretation. Separate observations from inference and note clock uncertainty.
- **PDB and shutdown:** whether the identified path enforced the matching PDB; requested/effective grace when known; evidence of process exit versus API object removal.
- **Alternatives and gaps:** candidates ruled out, credible unresolved candidates, and missing or expired evidence.
- **Next step:** the smallest read-only check that can resolve the remaining uncertainty. If remediation is requested, describe its risk and require authorization before any mutation.

Do not recommend disabling kubelet evictions or taint eviction as a default fix. Those mechanisms protect node health or enable workload recovery. Explain the availability and resource-exhaustion tradeoff before proposing a change.
