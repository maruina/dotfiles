import { execFile } from "node:child_process";
import type { ExecFileOptionsWithStringEncoding } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerDatadogMcpAuth } from "./_core.ts";
import type { AuthExtensionAPI, DdAuthRunner } from "./_core.ts";

const runDdAuth: DdAuthRunner = (domain) =>
  new Promise((resolve, reject) => {
    const options: ExecFileOptionsWithStringEncoding & { stdio: ["ignore", "pipe", "ignore"] } = {
      encoding: "utf8",
      timeout: 60_000,
      env: { ...process.env, DD_EXPERIMENTS_NOOP: "true" },
      stdio: ["ignore", "pipe", "ignore"],
    };
    execFile(
      "dd-auth",
      ["--domain", domain, "--", "printenv", "DD_API_KEY", "DD_APP_KEY"],
      options,
      (error, stdout) => {
        if (error) {
          const kind =
            error.killed || error.code === "ETIMEDOUT"
              ? "timeout"
              : typeof error.code === "number"
                ? `exit code ${error.code}`
                : "dd-auth failed";
          reject(new Error(kind));
          return;
        }
        resolve(stdout);
      },
    );
  });

export default function datadogMcpAuthExtension(pi: ExtensionAPI): void {
  // The local pi devDependency is older than the supported runtime API.
  registerDatadogMcpAuth(pi as unknown as AuthExtensionAPI, runDdAuth);
}
