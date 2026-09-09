/**
 * /ship command entrypoint. Runs execute then verify as separate pi
 * subprocesses under distinct models, surfacing the terminal verdict while
 * preserving every hard gate. The conductor never edits, commits, or repairs.
 */

import { spawn } from "node:child_process";
import { join } from "node:path";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { runConductor, type StageRunner } from "./_conductor.ts";
import { createPromptReader } from "./_prompts.ts";
import { buildStageArgs, getPiInvocation, runStage, type Spawner } from "./_spawn.ts";
import { createGitRunner, resolvePlan } from "./_worktree.ts";

export default function shipConductor(pi: ExtensionAPI): void {
  pi.registerCommand("ship", {
    description: "Run execute then verify as separate pi subprocesses under distinct models",
    handler: async (args, ctx) => {
      const planInput = args.trim();
      if (!planInput) {
        ctx.ui.notify("ship: usage: /ship <plan.md>", "error");
        return;
      }
      if (!ctx.hasUI) {
        ctx.ui.notify("ship: requires an interactive session", "error");
        return;
      }

      const spawner: Spawner = (command, commandArgs, options) =>
        spawn(command, commandArgs, { cwd: options.cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
      const runStageFor: StageRunner = (options, signal) => {
        const invocation = getPiInvocation(buildStageArgs(options.model, options.prompt));
        return runStage(spawner, invocation, options.cwd, signal);
      };

      const git = createGitRunner();
      const abortController = new AbortController();
      const onSigint = () => abortController.abort();
      process.on("SIGINT", onSigint);
      try {
        await runConductor(
          planInput,
          ctx.cwd,
          {
            resolvePlan: (input, cwd) => resolvePlan(input, cwd, git),
            readPrompt: createPromptReader(join(getAgentDir(), "prompts")),
            registry: ctx.modelRegistry,
            runStage: runStageFor,
            ui: ctx.ui,
          },
          ctx.signal ?? abortController.signal,
        );
      } finally {
        process.off("SIGINT", onSigint);
      }
    },
  });
}
