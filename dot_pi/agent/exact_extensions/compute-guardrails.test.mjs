import assert from "node:assert/strict";
import test from "node:test";

import { findDeniedOperation } from "./_shared/compute-guardrails-core.ts";

const blocked = (command) => findDeniedOperation(command) !== null;

const blockedCases = [
  "kubectl --context prod delete pod foo",
  "kubectl -n ns patch deployment app -p '{}'",
  "helm -n ns upgrade app chart",
  "aws --profile prod ec2 terminate-instances --instance-ids i-123",
  "bash -lc 'kubectl delete pod foo'",
  "sh -c \"aws s3 rm s3://bucket --recursive\"",
  "sudo env FOO=bar kubectl delete node n1",
  "rm -rf /tmp/foo",
  "kubectl plugin-that-mutates stuff",
  "helm repo update",
  "ddtool clusters rename foo list",
  "ddtool cordons apply --name get",
  "ddtool namespaces migrate --to describe",
  "rm --recursive /tmp/foo",
];

const allowedCases = [
  "kubectl get pods",
  "kubectl --context prod -n ns describe pod foo",
  "kubectl auth can-i get pods",
  "kubectl config current-context",
  "helm list",
  "helm status release",
  "helm repo list",
  "aws ec2 describe-instances",
  "aws --profile prod s3api get-bucket-policy --bucket foo",
  "aws logs filter-log-events --log-group-name foo",
  "ddtool clusters list",
  "ddtool datacenters get us1.prod.dog",
  "echo kubectl delete pod foo",
];

test("compute guardrails block mutating protected commands", () => {
  for (const command of blockedCases) {
    assert.equal(blocked(command), true, command);
  }
});

test("compute guardrails allow known read-only protected commands", () => {
  for (const command of allowedCases) {
    assert.equal(blocked(command), false, command);
  }
});
