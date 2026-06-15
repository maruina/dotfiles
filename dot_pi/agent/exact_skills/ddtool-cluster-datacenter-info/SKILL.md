---
name: ddtool-cluster-datacenter-info
description: Use ddtool to answer Datadog cluster and datacenter metadata questions, including cloud provider, parent/child clusters, datacenter membership, zones, regions, status, families, workloads, and CEL selectors for ddtool clusters list/get and ddtool datacenters list/get.
argument-hint: "[cluster-or-datacenter-or-zone]"
model: sonnet
---
# ddtool Cluster and Datacenter Metadata
Use this skill when the user asks about Datadog Kubernetes clusters or datacenters, for example:
- In which cloud provider is cluster X?
- What datacenter/region/zone is cluster X in?
- What is cluster X's parent?
- What clusters are running in zone X?
- What children does parent cluster X have?
- Which clusters are in datacenter X?
- Which datacenters are in AWS/GCP/Azure or region X?

## Safety
These commands are read-only and are safe to run:
```bash
ddtool clusters get <cluster>
ddtool clusters list --selector '<cel>'
ddtool datacenters get <datacenter>
ddtool datacenters list --selector '<cel>'
```
Do not run modifying ddtool commands unless the user explicitly asks and confirms.

## Start with exact object lookups
If the user gives a full cluster FQDN, prefer `get` first because it avoids selector mistakes and shows the object shape:
```bash
ddtool clusters get <cluster> --format json
```

If the user gives a datacenter FQDN:
```bash
ddtool datacenters get <datacenter> --format json
```

Use `jq` to answer narrowly:
```bash
# Cluster cloud provider
ddtool clusters get <cluster> --format json | jq -r '.[0].cloud_provider'

# Cluster datacenter
ddtool clusters get <cluster> --format json | jq -r '.[0].datacenter'

# Cluster parent, usually stored as a label
ddtool clusters get <cluster> --format json | jq -r '.[0].labels.parent // empty'

# Cluster availability zones
ddtool clusters get <cluster> --format json | jq -r '.[0].availability_zones[]?'

# Datacenter cloud provider and region
ddtool datacenters get <datacenter> --format json | jq -r '.[0] | [.cloud_provider, .region] | @tsv'
```

## Cluster object fields
`ddtool clusters get/list --format json` returns a JSON array of cluster objects. Common fields:
- `name`: full cluster FQDN, for example `lokix-a.us4.prod.dog`
- `datacenter`: datacenter FQDN, for example `us4.prod.dog`
- `cloud_provider`: `aws`, `gcp`, or `azure`
- `availability_zones`: cloud zones, for example `us-central1-a`
- `environment`: `prod`, `staging`, etc.
- `kubernetes_api_url`
- `kubernetes_version`
- `labels`: string map with important metadata:
  - `parent`: parent cluster FQDN, for child clusters
  - `isparent`: string boolean such as `"true"` or `"false"`
  - `lineage`: often `parent` or `child`
  - `region`: cloud region
  - `provider`: cloud provider duplicate
  - `role`: cluster role
  - `status`: lifecycle status
  - `name`: short cluster name
- `workloads`: workload groups/families enabled on the cluster
- `zonal_cluster_set`: sibling clusters in the same zonal set
- `cloud_provider_account.id` and `.name`
- `family`: cluster family, for example `general`
- `status`: lifecycle status, for example `available` or `deleting`

## Datacenter object fields
`ddtool datacenters get/list --format json` returns a JSON array of datacenter objects. Common fields:
- `name`: datacenter FQDN, for example `us1.ddbuild.io`
- `description`
- `cloud_provider`: `aws`, `gcp`, or `azure`
- `region`: cloud region, for example `us-east-1`
- `availability_zones`: cloud zones
- `environment`: `prod`, `staging`, etc.
- `site`: Datadog site, for example `datadoghq.com`
- `vault_url`
- `oci_registry`
- `dd_partition`: for example `commercial`
- `status`: for example `available`
- `flavor`: for example `control-plane`
- `monitoring_orgs`

## CEL selector basics
`ddtool <object> list --selector '<cel>'` supports CEL expressions. Use the CEL object variable shown below:
- Clusters: `cluster`
- Datacenters: `datacenter`

Always quote the selector with single quotes in the shell, and use double quotes inside the CEL string.

Common CEL patterns:
```bash
# Equality
'cluster.datacenter == "us4.prod.dog"'
'datacenter.cloud_provider == "aws"'

# Boolean AND/OR
'cluster.environment == "prod" && cluster.cloud_provider == "gcp"'
'datacenter.environment == "prod" && datacenter.region == "us-east-1"'

# Membership in a list
'"us-central1-a" in cluster.availability_zones'
'"family-general" in cluster.workloads'
'"us-east-1a" in datacenter.availability_zones'

# Map labels
'cluster.labels.parent == "parent33.us4.prod.dog"'
'cluster.labels.isparent == "true"'
'cluster.labels.lineage == "child"'
'cluster.labels.region == "us-central1"'
'cluster.labels.role == "general"'
```

## Common questions and commands

### In which cloud provider is cluster X?
```bash
ddtool clusters get <cluster> --format json | jq -r '.[0].cloud_provider'
```
If you also need account, datacenter, and region:
```bash
ddtool clusters get <cluster> --format json | jq -r '.[0] | {name, cloud_provider, cloud_provider_account, datacenter, zones: .availability_zones, region: .labels.region}'
```

### What is cluster X's parent?
```bash
ddtool clusters get <cluster> --format json | jq -r '.[0].labels.parent // ""'
```
If the result is empty, check whether the cluster itself is a parent:
```bash
ddtool clusters get <cluster> --format json | jq -r '.[0] | {name, isparent: .labels.isparent, lineage: .labels.lineage, family, role: .labels.role}'
```

### What clusters are running in zone X?
```bash
ddtool clusters list --selector '"<zone>" in cluster.availability_zones' --format summary
```
For scriptable output:
```bash
ddtool clusters list --selector '"<zone>" in cluster.availability_zones' --format json | jq -r '.[] | [.name, .datacenter, .cloud_provider, (.availability_zones | join(",")), .status] | @tsv'
```

### What clusters are in datacenter X?
```bash
ddtool clusters list --selector 'cluster.datacenter == "<datacenter>"' --format summary
```

### What children does parent cluster X have?
Use the parent label:
```bash
ddtool clusters list --selector 'cluster.labels.parent == "<parent-cluster>"' --format summary
```
For only child names:
```bash
ddtool clusters list --selector 'cluster.labels.parent == "<parent-cluster>"' --format name-only
```

### Is cluster X a parent cluster?
```bash
ddtool clusters get <cluster> --format json | jq -r '.[0] | {name, isparent: .labels.isparent, lineage: .labels.lineage}'
```

### What sibling/zonal-set clusters does cluster X have?
```bash
ddtool clusters get <cluster> --format json | jq -r '.[0].zonal_cluster_set[]?'
```

### Which datacenters are in provider/region/site X?
```bash
# Provider
ddtool datacenters list --selector 'datacenter.cloud_provider == "<aws|gcp|azure>"' --format summary

# Region
ddtool datacenters list --selector 'datacenter.region == "<region>"' --format summary

# Site
ddtool datacenters list --selector 'datacenter.site == "<site>"' --format summary
```

### Which datacenters include zone X?
```bash
ddtool datacenters list --selector '"<zone>" in datacenter.availability_zones' --format summary
```

## Inspect the data shape before writing a new selector
When unsure about field names or nesting, inspect one or a few objects:
```bash
ddtool clusters get <cluster> --format json | jq '.[0] | keys'
ddtool datacenters get <datacenter> --format json | jq '.[0] | keys'
```

To sample list output without flooding the terminal:
```bash
ddtool clusters list --format json | jq '.[0]'
ddtool datacenters list --format json | jq '.[0]'
```

Use `jq` for complex inspection if CEL support is unclear:
```bash
ddtool clusters list --format json | jq -r '.[] | select(.labels.parent == "<parent-cluster>") | .name'
ddtool clusters list --format json | jq -r '.[] | select(.availability_zones[]? == "<zone>") | .name'
```

Prefer CEL selectors for normal use because they reduce output size and are faster. Fall back to full JSON plus `jq` when experimenting with unknown fields.

## Reporting answers
When answering, include enough context to make the answer verifiable:
- The command used, or a concise mention of the lookup.
- The cluster/datacenter name.
- The relevant fields: provider, datacenter, region/zones, parent/children, status.
- Any caveat, for example missing `labels.parent`, non-available status, or multiple matching objects.
