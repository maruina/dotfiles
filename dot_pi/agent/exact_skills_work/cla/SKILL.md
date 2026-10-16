---
name: cla
description: Investigate Datadog Cluster Lifecycle Automation (CLA) cluster provisioning and failures. Use when the user asks about provisioning status, computecla or Fabric bootstrap workflows, provisioning image overrides, or the current Mosaic deployment for a CLA run.
---
# CLA cluster provisioning
Use this skill to follow a cluster provisioning run from its CLA Temporal workflow to the Fabric bootstrap pipeline and its deployment. The user may provide a Temporal URL, a cluster FQDN, or a provisioning error.
## Safety
- Work read-only by default. Do not start, signal, cancel, terminate, retry, or modify workflows or clusters unless the user explicitly asks.
- Track the exact workflow ID and run ID from the user's URL. Do not substitute the latest run for a cluster or service.
- Do not treat a successful child-workflow start as a successful deployment. Inspect the actual deployment workflow and its status.
- Treat workflow inputs and job traces as internal data. Do not print tokens or dump full histories into chat.
## Inspect the CLA workflow
For a `temporal.ddbuild.io` workflow URL, use the `prod` Atlas context unless the URL or evidence indicates another context. Parse the URL path to get the workflow ID and run ID. URL-decode the workflow ID; it may contain `/`.

Inspect the run once rather than using a streaming watch:

```fish
atlas workflow inspect -c prod -w '<workflow-id>' -r '<run-id>'
```

Record the current status, workflow type, task queue, pending activities, and pending children. Follow the pending children by their returned workflow IDs and run IDs. For a typical cluster provisioning run, follow `Account_ProvisionCluster` to `FabricProvisioner_BootstrapCluster`, then to `gitlab.GitlabService_CreateAndWaitForPipeline`.

Inspect the GitLab workflow history when you need its pipeline ID, ref, or variables. Save history to a temporary file and search only the relevant events:

```fish
atlas workflow history -c prod \
  --workflow-id '<gitlab-workflow-id>' \
  --run-id '<gitlab-run-id>' \
  --output-file '/tmp/cla-gitlab-history.json' \
  --force-human-readable
rg -n -C 2 'CreatePipelineRequest|CreatePipelineResponse|pipeline|CLUSTER_FQDN|IMAGE_TAG' /tmp/cla-gitlab-history.json
```

The request records the cluster FQDN, branch, and image tag. The `CreatePipelineResponse` records the GitLab pipeline ID and URL. Prefer this child history when direct access to a parent workflow's input is denied.
## Find the current bootstrap deployment
The Fabric bootstrap GitLab job can create a separate deployment workflow. Do not use a previous scheduled Conductor rollout for `fabric-k8s-controller` as a substitute for the current cluster bootstrap.

Use the GitLab pipeline ID from the current Temporal child history. Find the `cluster-bootstrap-deploy` job and its job ID:

```fish
set -lx GITLAB_HOST gitlab.ddbuild.io
set -lx GITLAB_TOKEN (ddtool auth gitlab project-token ddoghq service-discovery-platform)
glab --repo ddoghq/service-discovery-platform ci get \
  --pipeline-id '<pipeline-id>' --output json --with-job-details \
  --jq '.jobs[] | select(.name == "cluster-bootstrap-deploy") | {id, status, web_url}'
```

Fetch a snapshot of the job trace. This works while the job is running; `glab ci trace` can keep streaming until the job exits.

```fish
set project_path 'ddoghq%2Fservice-discovery-platform'
glab --repo ddoghq/service-discovery-platform api \
  "projects/$project_path/jobs/<job-id>/trace" > '/tmp/cla-bootstrap-job.log'
rg -n -A 2 -B 1 'Mosaic/Deployments UI|mosaic.us1.ddbuild.io/deployments' /tmp/cla-bootstrap-job.log
```

Use the Mosaic URL emitted by `workflowctl` in that job trace. It contains the current release workflow ID and run ID. Do not rebuild the URL from the parent CLA workflow ID, an older run, or the `triggered_by` filter. The filter may say `root@datadoghq.com` because the GitLab runner launches the deployment; it does not identify which cluster the run targets. Confirm that the current pipeline request and job refer to the requested cluster before sharing the link.

If the current job has not emitted a deployment URL yet, say so. Share the current GitLab pipeline link and Temporal parent link instead of guessing a Mosaic deployment ID.
## Verify the deployment workflow
The Mosaic URL's `id` parameter decodes to `temporal/v1:release-0||<workflow-id>||<run-id>`. Inspect that exact workflow in the `release` context:

```fish
atlas workflow inspect -c release -w '<release-workflow-id>' -r '<release-run-id>'
```

Report its status and any pending child workflows or failing activities. For a terminal failure or unclear child result, use:

```fish
atlas workflow history -c release \
  --workflow-id '<release-workflow-id>' \
  --run-id '<release-run-id>' \
  --output-file '/tmp/cla-release-history.json' \
  --force-human-readable
```

Some CNAB child workflows can complete while their result payload reports a failed task. Read the decoded result or failure payload before calling the deployment successful. Keep the answer tied to the exact current run and include its workflow/run IDs.
## Image-not-found failures
When the artifact processor reports that a service-discovery-platform source image does not exist:
- Check the current GitLab child request's `IMAGE_TAG` and branch. Do not assume the failed tag is the latest available tag.
- For a new cluster bootstrap, the Cluster annotation `cla.datadoghq.com/service-discovery-platform-image` overrides the image tag passed to the service-discovery-platform pipeline. The value is a tag, not a full image reference. The current implementation reads it in `domains/compute/apps/computecla/worker/account/provisioning/downstream_services.go` and defines the key in `domains/compute/shared/libs/go/cla/pkg/apis/cla.datadoghq.com/v1alpha1/const.go`.
- Treat a version observed in logs as evidence of a running image, not proof that every registry or artifact processor can resolve it. State the evidence source and timestamp. Do not apply the annotation or retry provisioning unless the user explicitly asks.
## Report
Give the current status first. Include the target cluster, Atlas context, workflow type, workflow ID and run ID; summarize the parent-to-child chain; distinguish a running retry from a terminal failure; and link the exact current Mosaic deployment when the job emitted one. State any access or evidence gap, such as a denied workflow input or a GitLab job that has not started.
