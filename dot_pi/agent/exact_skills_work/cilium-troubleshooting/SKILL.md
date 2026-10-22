---
name: cilium-troubleshooting
description: Investigate Datadog Cilium CNI connectivity failures, Hubble drops and policy denials, missing flows, and cross-cluster TCP timeouts. Use when troubleshooting Cilium, Hubble, CiliumNetworkPolicy, or a confirmed Cilium network path. Read-only; distinguish installed policy, flow visibility, connection state, and cloud routing.
---
# Troubleshoot Cilium connectivity
Use this work-profile skill for Datadog Cilium and Hubble investigations. Do not assume a network timeout is a Cilium policy failure.

## Safety and scope
- Keep the investigation read-only. Do not change policies, endpoint audit mode, notification settings, debug settings, routing, or deployments. Do not restart agents, install tools, create debug pods, or send active probes.
- Use explicit Kubernetes contexts. Confirm source and destination clusters, namespaces, pod IPs, ports, protocol, and incident time window before querying. Resolve ambiguous environments before continuing.
- Use existing Hubble CLI and Cilium agent containers only. If exec access is denied or tooling is absent, report the gap; do not install or enable anything.
- Bound each exec with a tool timeout, such as 20 seconds. Bound observations by endpoint filters, time, and result count. Do not use cluster-wide unfiltered observations or follow mode (`-f`). Small flow counts alone do not bound relay work; filter first.
- Filter large endpoint, policy, and conntrack outputs inside the container when supported. Otherwise save output locally and return only matching records. Avoid repeated full-node dumps.

## Read the live runbook
Load `confluence-cli` and read [Using Cilium's Hubble for CNI Observability](https://datadoghq.atlassian.net/wiki/spaces/~136927323/pages/2661876986/Using+Cilium+s+Hubble+for+CNI+Observability), page ID `2661876986`, through the `confluence` tool before choosing Hubble commands. Use `auth_verify`, then `page_get` with `bodyFormat: "markdown"`, and read the returned file. If conversion omits needed content, fetch storage or ADF. If access fails, state the gap and use installed CLI help; do not claim the live runbook was read.

The runbook warns that broad streaming can overload Hubble Relay and cause disconnections, timeouts, or OOM kills. Its deployment instructions are outside this skill's read-only boundary.

Dashboards linked by the runbook:
- [Production CNI flow observability](https://app.datadoghq.com/dashboard/uvs-kny-zz9)
- [Staging CNI flow observability: drops and denials](https://ddstaging.datadoghq.com/dashboard/n75-put-uu5/compute-cilium-cni-flow-observability-drops-denials)

Load `datadog-mcp` before querying telemetry. Verify the selected organization and inspect widget queries: a drop chart is not a count of all pod traffic. Keep query windows and grouping bounded.

## 1. Map the actual connection
Read pod placement and CiliumEndpoint resources for the exact source and destination. Record:
- Pod IP, node, cluster, namespace, and workload/version.
- Cilium endpoint ID and identity, and the agent on the hosting node.
- Service-to-endpoint mapping where a Service or DNS name is involved.

Use the actual pod IP in filters, not a node CIDR inferred from the node name. Recheck mappings after pod recreation. Choose a comparable ready source or successful connection and record differences such as version, region, and subnet.

## 2. Check Hubble coverage, then query narrowly
Datadog provides the CLI in namespace `cluster-cni-hubble-cli`, deployment `hubble-cli`. Use non-interactive exec. Replace `CLUSTER_CONTEXT` with the verified context:

```sh
kubectl --context CLUSTER_CONTEXT -n cluster-cni-hubble-cli exec deploy/hubble-cli -- hubble status
kubectl --context CLUSTER_CONTEXT -n cluster-cni-hubble-cli exec deploy/hubble-cli -- hubble observe --help
```

Check installed flags before use. For a known IPv4 TCP tuple, replace `SOURCE_POD_IP`, `DESTINATION_POD_IP`, and `DESTINATION_PORT` with observed values:

```sh
kubectl --context CLUSTER_CONTEXT -n cluster-cni-hubble-cli exec deploy/hubble-cli -- hubble observe --from-ip SOURCE_POD_IP --to-ip DESTINATION_POD_IP --protocol TCP --port DESTINATION_PORT --since 3m --last 100
```

Query the reverse direction separately when needed. Start with the exact tuple, not a cluster-wide drop search.

Record unavailable nodes and relay errors. If the relay cannot serve the query, inspect CLI help and live documentation for an existing node-local Hubble endpoint; use it only after verifying its address and access configuration. Do not change relay configuration or bypass authentication.

Check source and destination agents' effective drop, policy-verdict, and trace notification settings through read-only status/config output. Record which event types can actually be observed.

## 3. Distinguish policy from transport
Check the installed Cilium CLI help and use read-only inspection on the verified agents. Commands commonly available through `cilium-dbg` include:
- `endpoint get ENDPOINT_ID`: endpoint state and policy enforcement.
- `bpf policy get ENDPOINT_ID`: installed policy-map entries.
- `bpf ct list global`: connection tracking; filter to the exact tuple and port.

Replace `ENDPOINT_ID` with the endpoint mapped in step 1. Confirm syntax on the deployed version. Inspect desired CiliumNetworkPolicy/CiliumClusterwideNetworkPolicy only alongside effective endpoint state and installed policy. An allow rule in YAML alone does not establish what the datapath enforces. Check direction, identity, protocol, port, and relevant deny/authentication entries.

Compare conntrack for the same tuple at both ends and against the control:
- Outgoing SYN state with no received flags supports an unanswered connection attempt.
- Received flags and `SeenNonSyn` support progress beyond SYN-only state; they do not prove an application write succeeded.
- No matching destination entry does not locate a physical packet drop. Account for entry expiry, collection timing, NAT, and changed tuples before interpreting absence.

## 4. Move to the next layer when evidence requires it
If inspected endpoint policy permits the tuple but transport still fails, keep Cilium routing and cloud routing as separate possibilities. Read host routing choices, then authoritative cloud configuration where access permits. A host route does not prove the cloud path works.

For AWS, establish account identity and ENI/subnet mappings before selecting profiles. Inspect the route tables actually associated with the source node and pod subnets, select the most-specific destination route, then follow its peering or TGW attachment and associated table. Check actual source pod ranges on the return path. Do not assume tables elsewhere in the same VPC apply to the source. Load `ddtool-cluster-datacenter-info` when account or cluster metadata is needed.

A same-region working control can be VPC-local while the failing path uses a TGW. Compare actual route selection before using that control to reject a routing explanation. If evidence requires packet capture, tracing changes, or new flow logging, stop and request approval rather than executing them.

## Evidence limits and handoff
- Missing Hubble events are not proof of missing packets: notification settings, rotating buffers, relay coverage, and query scope can hide flows.
- A forwarded policy verdict does not prove end-to-end delivery. Map its source before attributing it to the failing workload.
- Installed policy permits the inspected tuple; it does not rule out every Cilium or network failure.
- Record commands, UTC collection times, contexts, versions, mappings, and collection limits. Separate confirmed observations from supported hypotheses and unknowns.
- Report the smallest observed failure chain, control comparison, rejected explanations, and next authoritative read. Do not call a surviving hypothesis the root cause without the causal link.
