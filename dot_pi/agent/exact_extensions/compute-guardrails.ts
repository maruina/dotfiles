/**
 * Compute Guardrails Extension
 *
 * Blocks destructive kubectl, ddtool, helm, aws, and rm commands.
 * All other commands pass through silently — pi has no permission prompts by default.
 *
 * Disable for one session: `pi --no-extensions`
 * Disable for a project:   add `{ "extensions": ["!**\/compute-guardrails*"] }` to .pi/settings.json
 * Disable in-session:      `/compute-guardrails-off` (blocks until `/reload` or restart)
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Deny records — ported from compute-support sot-command-records.jsonl
// Each entry: [tool, subcommand-prefix, reason]
// Matching: the parsed command tokens must start with [tool, ...subcommand words]
// ---------------------------------------------------------------------------

type DenyRecord = { tool: string; sub: string[]; reason: string };

const DENY_RECORDS: DenyRecord[] = [
  // kubectl
  { tool: "kubectl", sub: ["annotate"],        reason: "adds/removes annotations" },
  { tool: "kubectl", sub: ["apply"],            reason: "applies resource manifests" },
  { tool: "kubectl", sub: ["attach"],           reason: "attaches to a running container" },
  { tool: "kubectl", sub: ["auth", "reconcile"],reason: "writes RBAC rules" },
  { tool: "kubectl", sub: ["autoscale"],        reason: "creates/updates HPA configuration" },
  { tool: "kubectl", sub: ["certificate"],      reason: "approves or denies CSRs" },
  { tool: "kubectl", sub: ["config", "delete"], reason: "removes a kubeconfig entry" },
  { tool: "kubectl", sub: ["config", "rename"], reason: "renames a kubeconfig context" },
  { tool: "kubectl", sub: ["config", "set"],    reason: "mutates kubeconfig fields" },
  { tool: "kubectl", sub: ["config", "unset"],  reason: "unsets kubeconfig fields" },
  { tool: "kubectl", sub: ["config", "use"],    reason: "switches the active kubeconfig context" },
  { tool: "kubectl", sub: ["cordon"],           reason: "marks a node unschedulable" },
  { tool: "kubectl", sub: ["cp"],               reason: "copies files into or out of a container" },
  { tool: "kubectl", sub: ["create"],           reason: "creates resources" },
  { tool: "kubectl", sub: ["debug"],            reason: "spawns a debug container" },
  { tool: "kubectl", sub: ["delete"],           reason: "deletes resources" },
  { tool: "kubectl", sub: ["drain"],            reason: "drains a node; evicts workloads" },
  { tool: "kubectl", sub: ["edit"],             reason: "opens an editor to modify a resource" },
  { tool: "kubectl", sub: ["exec"],             reason: "executes arbitrary commands in a container" },
  { tool: "kubectl", sub: ["expose"],           reason: "creates a Service resource" },
  { tool: "kubectl", sub: ["label"],            reason: "adds/removes labels" },
  { tool: "kubectl", sub: ["patch"],            reason: "mutates resource fields" },
  { tool: "kubectl", sub: ["port-forward"],     reason: "opens a network tunnel to a pod" },
  { tool: "kubectl", sub: ["proxy"],            reason: "opens an API proxy" },
  { tool: "kubectl", sub: ["replace"],          reason: "replaces resources" },
  { tool: "kubectl", sub: ["rollout", "pause"], reason: "pauses a workload rollout" },
  { tool: "kubectl", sub: ["rollout", "restart"],reason: "restarts workload pods" },
  { tool: "kubectl", sub: ["rollout", "resume"],reason: "resumes a workload rollout" },
  { tool: "kubectl", sub: ["rollout", "undo"],  reason: "rolls a workload back to a prior revision" },
  { tool: "kubectl", sub: ["run"],              reason: "creates and runs a pod" },
  { tool: "kubectl", sub: ["scale"],            reason: "changes replica count" },
  { tool: "kubectl", sub: ["set"],              reason: "mutates fields on resources (image, env, etc.)" },
  { tool: "kubectl", sub: ["taint"],            reason: "adds/removes node taints" },
  { tool: "kubectl", sub: ["uncordon"],         reason: "marks a node schedulable" },

  // ddtool
  { tool: "ddtool", sub: ["clusters", "add-workloads"],       reason: "attaches workloads to a cluster" },
  { tool: "ddtool", sub: ["clusters", "remove-workloads"],    reason: "detaches workloads from a cluster" },
  { tool: "ddtool", sub: ["cordons", "create"],               reason: "creates a cordon" },
  { tool: "ddtool", sub: ["cordons", "delete"],               reason: "deletes a cordon" },
  { tool: "ddtool", sub: ["cordons", "update"],               reason: "updates a cordon" },
  { tool: "ddtool", sub: ["namespaces", "create"],            reason: "creates a namespace record" },
  { tool: "ddtool", sub: ["namespaces", "delete"],            reason: "deletes a namespace record" },
  { tool: "ddtool", sub: ["namespaces", "update"],            reason: "updates a namespace record" },
  { tool: "ddtool", sub: ["workload-groups", "add-namespaces"],   reason: "adds namespaces to a workload group" },
  { tool: "ddtool", sub: ["workload-groups", "create"],           reason: "creates a workload group" },
  { tool: "ddtool", sub: ["workload-groups", "delete"],           reason: "deletes a workload group" },
  { tool: "ddtool", sub: ["workload-groups", "remove-namespaces"],reason: "removes namespaces from a workload group" },

  // helm
  { tool: "helm", sub: ["delete"],       reason: "removes a release" },
  { tool: "helm", sub: ["install"],      reason: "installs a release" },
  { tool: "helm", sub: ["repo", "add"],  reason: "adds a chart repo" },
  { tool: "helm", sub: ["repo", "remove"],reason: "removes a chart repo" },
  { tool: "helm", sub: ["repo", "update"],reason: "updates chart repo index" },
  { tool: "helm", sub: ["rollback"],     reason: "rolls a release back to a prior revision" },
  { tool: "helm", sub: ["uninstall"],    reason: "removes a release" },
  { tool: "helm", sub: ["upgrade"],      reason: "upgrades an existing release" },

  // aws ec2 — instance lifecycle
  { tool: "aws", sub: ["ec2", "run-instances"],        reason: "launches EC2 instances" },
  { tool: "aws", sub: ["ec2", "start-instances"],      reason: "starts stopped EC2 instances" },
  { tool: "aws", sub: ["ec2", "stop-instances"],       reason: "stops running EC2 instances" },
  { tool: "aws", sub: ["ec2", "reboot-instances"],     reason: "reboots EC2 instances" },
  { tool: "aws", sub: ["ec2", "terminate-instances"],  reason: "permanently terminates EC2 instances" },
  // aws ec2 — node/network mutation
  { tool: "aws", sub: ["ec2", "modify-instance-attribute"],   reason: "mutates instance attributes" },
  { tool: "aws", sub: ["ec2", "modify-instance-metadata-options"], reason: "mutates instance metadata options" },
  { tool: "aws", sub: ["ec2", "modify-network-interface-attribute"], reason: "mutates network interface attributes" },
  { tool: "aws", sub: ["ec2", "modify-subnet-attribute"],     reason: "mutates subnet attributes" },
  { tool: "aws", sub: ["ec2", "modify-vpc-attribute"],        reason: "mutates VPC attributes" },
  { tool: "aws", sub: ["ec2", "modify-security-group-rules"], reason: "mutates security group rules" },
  { tool: "aws", sub: ["ec2", "authorize-security-group-ingress"], reason: "adds inbound security group rules" },
  { tool: "aws", sub: ["ec2", "authorize-security-group-egress"],  reason: "adds outbound security group rules" },
  { tool: "aws", sub: ["ec2", "revoke-security-group-ingress"],    reason: "removes inbound security group rules" },
  { tool: "aws", sub: ["ec2", "revoke-security-group-egress"],     reason: "removes outbound security group rules" },
  { tool: "aws", sub: ["ec2", "create-security-group"],   reason: "creates a security group" },
  { tool: "aws", sub: ["ec2", "delete-security-group"],   reason: "deletes a security group" },
  // aws ec2 — storage
  { tool: "aws", sub: ["ec2", "attach-volume"],   reason: "attaches an EBS volume to an instance" },
  { tool: "aws", sub: ["ec2", "detach-volume"],   reason: "detaches an EBS volume from an instance" },
  { tool: "aws", sub: ["ec2", "delete-volume"],   reason: "deletes an EBS volume" },
  { tool: "aws", sub: ["ec2", "delete-snapshot"], reason: "deletes an EBS snapshot" },
  // aws ec2 — routing and gateways
  { tool: "aws", sub: ["ec2", "create-route"],           reason: "creates a route table entry" },
  { tool: "aws", sub: ["ec2", "delete-route"],           reason: "deletes a route table entry" },
  { tool: "aws", sub: ["ec2", "replace-route"],          reason: "replaces a route table entry" },
  { tool: "aws", sub: ["ec2", "create-internet-gateway"],reason: "creates an internet gateway" },
  { tool: "aws", sub: ["ec2", "attach-internet-gateway"],reason: "attaches an internet gateway to a VPC" },
  { tool: "aws", sub: ["ec2", "detach-internet-gateway"],reason: "detaches an internet gateway from a VPC" },
  { tool: "aws", sub: ["ec2", "delete-internet-gateway"],reason: "deletes an internet gateway" },
  { tool: "aws", sub: ["ec2", "delete-nat-gateway"],     reason: "deletes a NAT gateway" },
  // aws ec2 — key pairs and images
  { tool: "aws", sub: ["ec2", "delete-key-pair"],   reason: "deletes an EC2 key pair" },
  { tool: "aws", sub: ["ec2", "deregister-image"],  reason: "deregisters an AMI" },

  // aws eks — cluster and nodegroup lifecycle
  { tool: "aws", sub: ["eks", "create-cluster"],          reason: "creates an EKS cluster" },
  { tool: "aws", sub: ["eks", "delete-cluster"],          reason: "deletes an EKS cluster" },
  { tool: "aws", sub: ["eks", "update-cluster-config"],   reason: "mutates EKS cluster configuration" },
  { tool: "aws", sub: ["eks", "update-cluster-version"],  reason: "upgrades the EKS control plane" },
  { tool: "aws", sub: ["eks", "create-nodegroup"],        reason: "creates an EKS managed nodegroup" },
  { tool: "aws", sub: ["eks", "delete-nodegroup"],        reason: "deletes an EKS managed nodegroup" },
  { tool: "aws", sub: ["eks", "update-nodegroup-config"], reason: "mutates nodegroup configuration (desired/min/max)" },
  { tool: "aws", sub: ["eks", "update-nodegroup-version"],reason: "upgrades nodegroup AMI version" },
  { tool: "aws", sub: ["eks", "create-fargate-profile"],  reason: "creates a Fargate profile" },
  { tool: "aws", sub: ["eks", "delete-fargate-profile"],  reason: "deletes a Fargate profile" },
  { tool: "aws", sub: ["eks", "create-addon"],            reason: "installs an EKS addon" },
  { tool: "aws", sub: ["eks", "delete-addon"],            reason: "removes an EKS addon" },
  { tool: "aws", sub: ["eks", "update-addon"],            reason: "updates an EKS addon" },
  { tool: "aws", sub: ["eks", "update-kubeconfig"],       reason: "mutates local kubeconfig with cluster credentials" },

  // aws autoscaling — scaling and lifecycle
  { tool: "aws", sub: ["autoscaling", "create-auto-scaling-group"],  reason: "creates an Auto Scaling Group" },
  { tool: "aws", sub: ["autoscaling", "delete-auto-scaling-group"],  reason: "deletes an Auto Scaling Group" },
  { tool: "aws", sub: ["autoscaling", "update-auto-scaling-group"],  reason: "mutates ASG configuration (min/max/desired)" },
  { tool: "aws", sub: ["autoscaling", "set-desired-capacity"],       reason: "directly sets ASG desired capacity" },
  { tool: "aws", sub: ["autoscaling", "terminate-instance-in-auto-scaling-group"], reason: "terminates a specific instance in an ASG" },
  { tool: "aws", sub: ["autoscaling", "detach-instances"],           reason: "removes instances from an ASG" },
  { tool: "aws", sub: ["autoscaling", "suspend-processes"],          reason: "suspends ASG scaling/health processes" },
  { tool: "aws", sub: ["autoscaling", "resume-processes"],           reason: "resumes ASG scaling/health processes" },
  { tool: "aws", sub: ["autoscaling", "put-scaling-policy"],         reason: "creates or updates an ASG scaling policy" },
  { tool: "aws", sub: ["autoscaling", "delete-policy"],              reason: "deletes an ASG scaling policy" },
  { tool: "aws", sub: ["autoscaling", "set-instance-health"],        reason: "overrides instance health state in an ASG" },
  { tool: "aws", sub: ["autoscaling", "set-instance-protection"],    reason: "enables/disables scale-in protection on instances" },

  // aws iam — identity and access mutation
  { tool: "aws", sub: ["iam", "create-role"],           reason: "creates an IAM role" },
  { tool: "aws", sub: ["iam", "delete-role"],           reason: "deletes an IAM role" },
  { tool: "aws", sub: ["iam", "update-role"],           reason: "mutates an IAM role" },
  { tool: "aws", sub: ["iam", "attach-role-policy"],    reason: "attaches a managed policy to a role" },
  { tool: "aws", sub: ["iam", "detach-role-policy"],    reason: "detaches a managed policy from a role" },
  { tool: "aws", sub: ["iam", "put-role-policy"],       reason: "creates/replaces an inline role policy" },
  { tool: "aws", sub: ["iam", "delete-role-policy"],    reason: "deletes an inline role policy" },
  { tool: "aws", sub: ["iam", "update-assume-role-policy"], reason: "replaces a role's trust policy" },
  { tool: "aws", sub: ["iam", "create-policy"],         reason: "creates an IAM managed policy" },
  { tool: "aws", sub: ["iam", "delete-policy"],         reason: "deletes an IAM managed policy" },
  { tool: "aws", sub: ["iam", "create-policy-version"], reason: "creates a new managed policy version" },
  { tool: "aws", sub: ["iam", "create-user"],           reason: "creates an IAM user" },
  { tool: "aws", sub: ["iam", "delete-user"],           reason: "deletes an IAM user" },
  { tool: "aws", sub: ["iam", "attach-user-policy"],    reason: "attaches a managed policy to a user" },
  { tool: "aws", sub: ["iam", "detach-user-policy"],    reason: "detaches a managed policy from a user" },
  { tool: "aws", sub: ["iam", "put-user-policy"],       reason: "creates/replaces an inline user policy" },
  { tool: "aws", sub: ["iam", "create-access-key"],     reason: "creates an IAM access key" },
  { tool: "aws", sub: ["iam", "delete-access-key"],     reason: "deletes an IAM access key" },
  { tool: "aws", sub: ["iam", "create-service-linked-role"], reason: "creates an IAM service-linked role" },
  { tool: "aws", sub: ["iam", "delete-service-linked-role"], reason: "deletes an IAM service-linked role" },

  // aws s3 / s3api — bucket and object mutation
  { tool: "aws", sub: ["s3", "rm"],    reason: "deletes S3 objects or prefixes" },
  { tool: "aws", sub: ["s3", "mv"],    reason: "moves S3 objects (copy + delete)" },
  { tool: "aws", sub: ["s3", "cp"],    reason: "copies files into or out of S3" },
  { tool: "aws", sub: ["s3", "sync"],  reason: "syncs files into or out of S3 (may delete objects)" },
  { tool: "aws", sub: ["s3", "rb"],    reason: "removes an S3 bucket" },
  { tool: "aws", sub: ["s3", "mb"],    reason: "creates an S3 bucket" },
  { tool: "aws", sub: ["s3api", "create-bucket"],       reason: "creates an S3 bucket" },
  { tool: "aws", sub: ["s3api", "delete-bucket"],       reason: "deletes an S3 bucket" },
  { tool: "aws", sub: ["s3api", "delete-object"],       reason: "deletes an S3 object" },
  { tool: "aws", sub: ["s3api", "delete-objects"],      reason: "bulk-deletes S3 objects" },
  { tool: "aws", sub: ["s3api", "put-bucket-policy"],   reason: "replaces an S3 bucket policy" },
  { tool: "aws", sub: ["s3api", "delete-bucket-policy"],reason: "removes an S3 bucket policy" },
  { tool: "aws", sub: ["s3api", "put-public-access-block"],   reason: "modifies S3 public access block settings" },
  { tool: "aws", sub: ["s3api", "delete-public-access-block"],reason: "removes S3 public access block settings" },
  { tool: "aws", sub: ["s3api", "put-bucket-versioning"],     reason: "enables/suspends S3 bucket versioning" },
  { tool: "aws", sub: ["s3api", "put-bucket-lifecycle-configuration"], reason: "sets S3 lifecycle rules" },
  { tool: "aws", sub: ["s3api", "put-object"],          reason: "uploads an object to S3" },

  // aws ssm — remote execution and parameter mutation
  { tool: "aws", sub: ["ssm", "send-command"],           reason: "runs arbitrary commands on managed instances" },
  { tool: "aws", sub: ["ssm", "start-session"],          reason: "opens an interactive shell session on a managed instance" },
  { tool: "aws", sub: ["ssm", "put-parameter"],          reason: "creates or overwrites an SSM Parameter Store value" },
  { tool: "aws", sub: ["ssm", "delete-parameter"],       reason: "deletes an SSM Parameter Store value" },
  { tool: "aws", sub: ["ssm", "delete-parameters"],      reason: "bulk-deletes SSM Parameter Store values" },
  { tool: "aws", sub: ["ssm", "start-automation-execution"], reason: "starts an SSM Automation runbook" },
  { tool: "aws", sub: ["ssm", "stop-automation-execution"],  reason: "stops a running SSM Automation execution" },

  // aws secretsmanager — secret mutation
  { tool: "aws", sub: ["secretsmanager", "create-secret"],      reason: "creates a Secrets Manager secret" },
  { tool: "aws", sub: ["secretsmanager", "delete-secret"],      reason: "deletes a Secrets Manager secret" },
  { tool: "aws", sub: ["secretsmanager", "put-secret-value"],   reason: "overwrites a secret value" },
  { tool: "aws", sub: ["secretsmanager", "update-secret"],      reason: "mutates a Secrets Manager secret" },
  { tool: "aws", sub: ["secretsmanager", "rotate-secret"],      reason: "triggers immediate secret rotation" },
  { tool: "aws", sub: ["secretsmanager", "put-resource-policy"],reason: "replaces a secret's resource-based policy" },
  { tool: "aws", sub: ["secretsmanager", "delete-resource-policy"], reason: "removes a secret's resource-based policy" },
];

// rm -r and rm -rf only (not plain rm)
const RM_RECURSIVE = /(?:^|\s)rm\s+(?:\S+\s+)*-[a-zA-Z]*r[a-zA-Z]*/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strip leading VAR=value assignments and common command-running wrappers
 * (sudo, env, timeout, nice, nohup) so the real command name is token[0].
 */
function stripPrefixes(tokens: string[]): string[] {
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    // VAR=value assignment
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) { i++; continue; }
    // command-running wrappers (consume their own flags too)
    if (/^(sudo|env|timeout|nice|nohup|ionice|time|xargs)$/.test(t)) {
      i++;
      // skip flags belonging to the wrapper (e.g. sudo -u root, timeout 30)
      while (i < tokens.length && tokens[i].startsWith("-")) i++;
      // timeout also takes a duration positional
      if (t === "timeout" && i < tokens.length && /^\d/.test(tokens[i])) i++;
      continue;
    }
    break;
  }
  return tokens.slice(i);
}

/**
 * Tokenise one shell segment (already split on &&, ||, ;, |).
 * Handles quoted strings and strips path prefix from the command name.
 */
function tokenise(segment: string): string[] {
  const tokens: string[] = [];
  const re = /'[^']*'|"[^"]*"|\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(segment)) !== null) {
    let t = m[0];
    // strip surrounding quotes
    if ((t.startsWith("'") && t.endsWith("'")) ||
        (t.startsWith('"') && t.endsWith('"'))) {
      t = t.slice(1, -1);
    }
    tokens.push(t);
  }
  return tokens;
}

/**
 * Split a shell command string into top-level segments on &&, ||, ;, and |.
 * Does not descend into subshells — we only need the command names at the
 * top level for the deny check (subshell contents are separate segments).
 */
function splitSegments(cmd: string): string[] {
  // Simple splitter: break on &&, ||, ;, |, newline
  // Good enough for the deny-list use case (fail-open for unusual forms)
  return cmd.split(/&&|\|\||[;|\n]/).map(s => s.trim()).filter(Boolean);
}

/**
 * Check one shell segment against the deny list.
 * Returns the matching DenyRecord, or null if no match.
 */
function checkSegment(segment: string): DenyRecord | null {
  const raw = tokenise(segment);
  const tokens = stripPrefixes(raw);
  if (tokens.length === 0) return null;

  // rm -r / rm -rf check (flag-order independent)
  if (tokens[0] === "rm" && RM_RECURSIVE.test(segment)) {
    return { tool: "rm", sub: [], reason: "recursive filesystem delete (rm -r / rm -rf)" };
  }

  for (const record of DENY_RECORDS) {
    if (tokens[0] !== record.tool) continue;
    // Check that the subcommand words appear at tokens[1..n] in order
    const sub = record.sub;
    if (tokens.length < 1 + sub.length) continue;
    let match = true;
    for (let i = 0; i < sub.length; i++) {
      if (tokens[1 + i] !== sub[i]) { match = false; break; }
    }
    if (match) return record;
  }
  return null;
}

/**
 * Scan the full command string for any denied operation.
 * Returns the first DenyRecord found, or null.
 */
function findDeniedOperation(command: string): DenyRecord | null {
  for (const segment of splitSegments(command)) {
    const hit = checkSegment(segment);
    if (hit) return hit;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  let enabled = true;

  pi.registerCommand("compute-guardrails-off", {
    description: "Disable compute-guardrails for this session (re-enable with /reload)",
    handler: async (_args, ctx) => {
      enabled = false;
      ctx.ui.notify("compute-guardrails disabled for this session. Run /reload to re-enable.", "warning");
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    // Reset to enabled on every new session
    enabled = true;
    ctx.ui.setStatus("compute-guardrails", "🛡 guardrails");
  });

  pi.on("session_shutdown", async () => {
    enabled = true;
  });

  pi.on("tool_call", async (event, _ctx) => {
    if (!enabled) return undefined;
    if (event.toolName !== "bash") return undefined;

    const command = event.input.command as string;
    const hit = findDeniedOperation(command);
    if (!hit) return undefined;

    const subLabel = hit.sub.length > 0
      ? `${hit.tool} ${hit.sub.join(" ")}`
      : hit.tool;

    return {
      block: true,
      reason: `[compute-guardrails] blocked: \`${subLabel}\` — ${hit.reason}. Run this command manually in a terminal if you need it.`,
    };
  });
}
