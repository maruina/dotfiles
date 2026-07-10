/** Pure command inspection helpers for the compute-guardrails extension. */

// ---------------------------------------------------------------------------
// Deny records — ported from compute-support sot-command-records.jsonl
// Each entry: [tool, subcommand-prefix, reason]
// Matching: the parsed command tokens must start with [tool, ...subcommand words]
// ---------------------------------------------------------------------------

export type DenyRecord = { tool: string; sub: string[]; reason: string };

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

// Recursive rm only (not plain rm).
const RM_RECURSIVE = /(?:^|\s)rm\s+(?:\S+\s+)*(?:-[a-zA-Z]*r[a-zA-Z]*|--recursive)(?:\s|$)/;
const PROTECTED_TOOLS = new Set(["aws", "ddtool", "helm", "kubectl"]);
const SHELL_WRAPPERS = new Set(["bash", "fish", "sh", "zsh"]);
const READ_ONLY_KUBECTL = new Set(["api-resources", "api-versions", "auth", "cluster-info", "describe", "explain", "get", "logs", "top", "version"]);
const READ_ONLY_KUBECTL_AUTH = new Set(["can-i", "whoami"]);
const READ_ONLY_KUBECTL_CONFIG = new Set(["current-context", "get-contexts", "view"]);
const READ_ONLY_HELM = new Set(["env", "get", "history", "lint", "list", "search", "show", "status", "template", "version"]);
const READ_ONLY_HELM_REPO = new Set(["list"]);
const READ_ONLY_DDTOOL = new Set(["describe", "find", "get", "info", "list", "search", "show"]);
const READ_ONLY_AWS_PREFIXES = ["describe", "get", "list"];
const READ_ONLY_AWS_EXACT = new Set(["filter-log-events", "lookup-events", "query", "scan"]);

const GLOBAL_FLAGS_WITH_VALUE: Record<string, Set<string>> = {
  aws: new Set(["--ca-bundle", "--cli-binary-format", "--color", "--endpoint-url", "--output", "--profile", "--query", "--region"]),
  ddtool: new Set(["--config", "--context", "--profile"]),
  helm: new Set(["--burst-limit", "--kube-apiserver", "--kube-as-user", "--kube-ca-file", "--kube-context", "--kube-token", "--namespace", "--registry-config", "--repository-cache", "--repository-config", "-k", "-n"]),
  kubectl: new Set(["--as", "--as-group", "--cache-dir", "--certificate-authority", "--client-certificate", "--client-key", "--cluster", "--context", "--kubeconfig", "--match-server-version", "--namespace", "--profile", "--request-timeout", "--server", "--token", "--user", "-n"]),
};

const GLOBAL_FLAGS_WITHOUT_VALUE: Record<string, Set<string>> = {
  aws: new Set(["--debug", "--no-cli-auto-prompt", "--no-cli-pager", "--no-paginate", "--no-sign-request"]),
  ddtool: new Set(["--debug", "--verbose"]),
  helm: new Set(["--debug", "--kube-insecure-skip-tls-verify"]),
  kubectl: new Set(["--insecure-skip-tls-verify"]),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function basename(command: string): string {
  return command.split(/[\\/]/).pop() ?? command;
}

function isAssignment(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}

function isFlag(token: string): boolean {
  return token.startsWith("-") && token !== "-";
}

function stripPrefixes(tokens: string[]): string[] {
  let out = [...tokens];
  while (out.length > 0) {
    const command = basename(out[0]);
    if (isAssignment(command)) {
      out = out.slice(1);
      continue;
    }
    if (command === "sudo") {
      out = stripSudo(out.slice(1));
      continue;
    }
    if (command === "env") {
      out = stripEnv(out.slice(1));
      continue;
    }
    if (["command", "nohup", "time", "xargs"].includes(command)) {
      out = out.slice(1);
      continue;
    }
    if (command === "timeout") {
      out = stripTimeout(out.slice(1));
      continue;
    }
    if (command === "nice" || command === "ionice") {
      out = stripSimpleWrapperOptions(out.slice(1));
      continue;
    }
    break;
  }
  return out;
}

function stripSudo(tokens: string[]): string[] {
  let i = 0;
  const valueFlags = new Set(["-C", "-D", "-g", "-h", "-p", "-T", "-t", "-U", "-u", "--askpass", "--chdir", "--group", "--host", "--login-class", "--prompt", "--role", "--type", "--user"]);
  while (i < tokens.length && isFlag(tokens[i])) {
    const token = tokens[i];
    i++;
    if (!token.includes("=") && valueFlags.has(token) && i < tokens.length) i++;
  }
  return tokens.slice(i);
}

function stripEnv(tokens: string[]): string[] {
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (isAssignment(token)) {
      i++;
      continue;
    }
    if (token === "-i" || token === "--ignore-environment" || token === "-0" || token === "--null") {
      i++;
      continue;
    }
    if ((token === "-u" || token === "--unset") && i + 1 < tokens.length) {
      i += 2;
      continue;
    }
    break;
  }
  return tokens.slice(i);
}

function stripTimeout(tokens: string[]): string[] {
  let i = 0;
  const valueFlags = new Set(["--kill-after", "-k", "--signal", "-s"]);
  while (i < tokens.length && isFlag(tokens[i])) {
    const token = tokens[i];
    i++;
    if (!token.includes("=") && valueFlags.has(token) && i < tokens.length) i++;
  }
  if (i < tokens.length && /^\d/.test(tokens[i])) i++;
  return tokens.slice(i);
}

function stripSimpleWrapperOptions(tokens: string[]): string[] {
  let i = 0;
  while (i < tokens.length && isFlag(tokens[i])) i++;
  return tokens.slice(i);
}

function tokenize(segment: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < segment.length; i++) {
    const char = segment[i];
    if (quote) {
      if (char === quote) {
        quote = null;
      } else if (char === "\\" && quote === '"' && i + 1 < segment.length) {
        current += segment[++i];
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}

function splitSegments(command: string): string[] {
  const segments: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    const next = command[i + 1];
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === "\n" || char === ";" || char === "|" || (char === "&" && next === "&")) {
      if (current.trim()) segments.push(current.trim());
      current = "";
      if ((char === "|" && next === "|") || (char === "&" && next === "&")) i++;
      continue;
    }
    current += char;
  }
  if (current.trim()) segments.push(current.trim());
  return segments;
}

function skipGlobalFlags(tool: string, args: string[]): string[] {
  const withValue = GLOBAL_FLAGS_WITH_VALUE[tool] ?? new Set<string>();
  const withoutValue = GLOBAL_FLAGS_WITHOUT_VALUE[tool] ?? new Set<string>();
  let i = 0;
  while (i < args.length) {
    const token = args[i];
    if (isAssignment(token)) {
      i++;
      continue;
    }
    if (!isFlag(token)) break;
    const flag = token.includes("=") ? token.slice(0, token.indexOf("=")) : token;
    if (withValue.has(flag)) {
      i += token.includes("=") ? 1 : 2;
      continue;
    }
    if (withoutValue.has(flag)) {
      i++;
      continue;
    }
    // Unknown leading flags are treated as global flags. If they take a value,
    // the next pass will stop on that value and fail closed for protected tools.
    i++;
  }
  return args.slice(i);
}

function findShellCommand(tokens: string[]): string | null {
  if (tokens.length === 0 || !SHELL_WRAPPERS.has(basename(tokens[0]))) return null;
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "-c" || token.endsWith("c") && token.startsWith("-")) {
      return tokens[i + 1] ?? null;
    }
  }
  return null;
}

function exactDenyRecord(tool: string, args: string[]): DenyRecord | null {
  for (const record of DENY_RECORDS) {
    if (tool !== record.tool) continue;
    if (args.length < record.sub.length) continue;
    if (record.sub.every((part, index) => args[index] === part)) return record;
  }
  return null;
}

function protectedToolDecision(tool: string, args: string[]): DenyRecord | null {
  const record = exactDenyRecord(tool, args);
  if (record) return record;
  if (isAllowedReadOnly(tool, args)) return null;
  return { tool, sub: args.slice(0, 2), reason: "unknown or mutating protected command" };
}

function isAllowedReadOnly(tool: string, args: string[]): boolean {
  const [first, second] = args;
  if (!first) return false;
  switch (tool) {
    case "kubectl":
      if (first === "auth") return Boolean(second && READ_ONLY_KUBECTL_AUTH.has(second));
      if (first === "config") return Boolean(second && READ_ONLY_KUBECTL_CONFIG.has(second));
      return READ_ONLY_KUBECTL.has(first);
    case "helm":
      if (first === "repo") return Boolean(second && READ_ONLY_HELM_REPO.has(second));
      return READ_ONLY_HELM.has(first);
    case "aws":
      return isAllowedAws(args);
    case "ddtool":
      return READ_ONLY_DDTOOL.has(first) || Boolean(second && READ_ONLY_DDTOOL.has(second));
    default:
      return false;
  }
}

function isAllowedAws(args: string[]): boolean {
  const [service, operation] = args;
  if (!service || !operation) return false;
  if (service === "s3" && operation === "ls") return true;
  if (READ_ONLY_AWS_EXACT.has(operation)) return true;
  return READ_ONLY_AWS_PREFIXES.some((prefix) => operation.startsWith(prefix));
}

function inspectCommandSubstitutions(command: string, depth: number): DenyRecord | null {
  for (const match of command.matchAll(/\$\(([^()]*)\)|`([^`]*)`/g)) {
    const nested = match[1] ?? match[2];
    if (!nested) continue;
    const hit = findDeniedOperation(nested, depth + 1);
    if (hit) return hit;
  }
  return null;
}

function checkSegment(segment: string, depth: number): DenyRecord | null {
  const tokens = stripPrefixes(tokenize(segment));
  if (tokens.length === 0) return null;

  const shellCommand = findShellCommand(tokens);
  if (shellCommand) return findDeniedOperation(shellCommand, depth + 1);

  const tool = basename(tokens[0]);
  if (tool === "rm" && RM_RECURSIVE.test(segment)) {
    return { tool: "rm", sub: [], reason: "recursive filesystem delete" };
  }
  if (!PROTECTED_TOOLS.has(tool)) return null;

  const args = skipGlobalFlags(tool, tokens.slice(1));
  return protectedToolDecision(tool, args);
}

/**
 * Scan the full command string for any denied operation. Returns null for
 * commands outside the protected CLI families and for known read-only forms.
 */
export function findDeniedOperation(command: string, depth = 0): DenyRecord | null {
  if (depth > 3) return { tool: "shell", sub: [], reason: "nested shell command exceeded guardrail inspection depth" };
  const nestedHit = inspectCommandSubstitutions(command, depth);
  if (nestedHit) return nestedHit;
  for (const segment of splitSegments(command)) {
    const hit = checkSegment(segment, depth);
    if (hit) return hit;
  }
  return null;
}
