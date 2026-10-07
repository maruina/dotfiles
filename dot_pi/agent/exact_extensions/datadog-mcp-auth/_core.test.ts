import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { registerDatadogMcpAuth } from "./_core.ts";
import type { AuthExtensionAPI } from "./_core.ts";

type ServerConfig = {
  url: string;
  exposure: string;
  description: string;
  headers: Record<string, string>;
};

type SessionStartHandler = (event: { type: "session_start" }, ctx: TestContext) => unknown;
type SessionShutdownHandler = (event: { type: "session_shutdown" }, ctx: TestContext) => unknown;
type TestContext = {
  ui: { notify: (message: string, level: "warning" | "info") => void };
};

const expectedServers = [
  {
    name: "datadog-prod",
    domain: "app.datadoghq.com",
    description:
      "Query Datadog production org 2 (app.datadoghq.com): metrics, logs, traces, monitors, dashboards, incidents, notebooks.",
  },
  {
    name: "datadog-staging",
    domain: "ddstaging.datadoghq.com",
    description: "Query Datadog staging org 197728 (ddstaging.datadoghq.com) for staging clusters and datacenters.",
  },
];

function createExtension(runDdAuth: (domain: string) => Promise<string>) {
  const registrations: Array<{ name: string; config: ServerConfig }> = [];
  const notifications: Array<{ message: string; level: "warning" | "info" }> = [];
  let sessionStart: SessionStartHandler | undefined;
  let sessionShutdown: SessionShutdownHandler | undefined;
  const pi = {
    on(event: string, handler: SessionStartHandler | SessionShutdownHandler) {
      if (event === "session_start") sessionStart = handler as SessionStartHandler;
      if (event === "session_shutdown") sessionShutdown = handler as SessionShutdownHandler;
    },
    registerMcpServer(name: string, config: ServerConfig) {
      registrations.push({ name, config });
    },
  };
  const ctx: TestContext = {
    ui: {
      notify(message, level) {
        notifications.push({ message, level });
      },
    },
  };

  registerDatadogMcpAuth(pi as unknown as AuthExtensionAPI, runDdAuth);
  assert.ok(sessionStart, "extension did not register a session_start handler");
  return { sessionStart, sessionShutdown, ctx, registrations, notifications };
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

test("session_start returns before the auth fetch resolves", () => {
  const pending = new Promise<string>(() => {});
  const extension = createExtension(async () => pending);

  const result = extension.sessionStart({ type: "session_start" }, extension.ctx);

  assert.equal(result, undefined);
  assert.deepEqual(extension.registrations, []);
});

test("registers both servers with expected config and sequential auth calls", async () => {
  const first = deferred<string>();
  const second = deferred<string>();
  const calls: string[] = [];
  const extension = createExtension((domain) => {
    calls.push(domain);
    return calls.length === 1 ? first.promise : second.promise;
  });

  extension.sessionStart({ type: "session_start" }, extension.ctx);
  assert.deepEqual(calls, ["app.datadoghq.com"]);

  first.resolve("api1\napp1\n");
  await flushMicrotasks();
  assert.deepEqual(calls, ["app.datadoghq.com", "ddstaging.datadoghq.com"]);

  second.resolve("api2\napp2\n");
  await flushMicrotasks();
  assert.deepEqual(
    extension.registrations,
    expectedServers.map((server, index) => ({
      name: server.name,
      config: {
        url: "https://mcp.datadoghq.com/api/unstable/mcp-server/mcp",
        exposure: "deferred",
        description: server.description,
        headers: {
          "DD-API-KEY": index === 0 ? "api1" : "api2",
          "DD-APPLICATION-KEY": index === 0 ? "app1" : "app2",
        },
      },
    })),
  );
  assert.deepEqual(extension.notifications, []);
});

test("a failed production fetch does not prevent staging registration", async () => {
  const calls: string[] = [];
  const extension = createExtension(async (domain) => {
    calls.push(domain);
    if (domain === "app.datadoghq.com") throw new Error("exit code 1");
    return "stage-api\nstage-app\n";
  });

  extension.sessionStart({ type: "session_start" }, extension.ctx);
  await flushMicrotasks();

  assert.deepEqual(calls, ["app.datadoghq.com", "ddstaging.datadoghq.com"]);
  assert.deepEqual(extension.registrations.map(({ name }) => name), ["datadog-staging"]);
  assert.deepEqual(extension.notifications, [
    { message: "Datadog auth failed for app.datadoghq.com (exit code 1).", level: "warning" },
  ]);
});

test("rejects malformed keys without exposing auth output", async (t) => {
  for (const output of ["api-only\n", "api$secret\napp1\n", "!command\napp1\n"]) {
    await t.test("invalid output", async () => {
      const extension = createExtension(async (domain) =>
        domain === "app.datadoghq.com" ? output : "stage-api\nstage-app\n",
      );

      extension.sessionStart({ type: "session_start" }, extension.ctx);
      await flushMicrotasks();

      assert.deepEqual(extension.registrations.map(({ name }) => name), ["datadog-staging"]);
      assert.equal(extension.notifications.length, 1);
      assert.equal(extension.notifications[0]?.level, "warning");
      assert.match(extension.notifications[0]?.message ?? "", /invalid output/);
      assert.doesNotMatch(extension.notifications[0]?.message ?? "", /api-only|api\$secret|!command|app1/);
    });
  }
});

test("warns once for repeated failures, keeps the last registration, and announces recovery", async () => {
  const prodResults: Array<() => Promise<string>> = [
    async () => "api1\napp1\n",
    async () => {
      throw new Error("exit code 1");
    },
    async () => {
      throw new Error("exit code 1");
    },
    async () => "api2\napp2\n",
  ];
  const extension = createExtension(async (domain) => {
    if (domain === "app.datadoghq.com") return prodResults.shift()!();
    return "stage-api\nstage-app\n";
  });
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    extension.sessionStart({ type: "session_start" }, extension.ctx);
    await flushMicrotasks();
    assert.equal(extension.registrations.length, 2);

    mock.timers.tick(5 * 60 * 1000);
    await flushMicrotasks();
    assert.equal(extension.registrations.length, 2);
    mock.timers.tick(5 * 60 * 1000);
    await flushMicrotasks();
    assert.equal(extension.registrations.length, 2);
    mock.timers.tick(5 * 60 * 1000);
    await flushMicrotasks();

    assert.deepEqual(extension.notifications, [
      { message: "Datadog auth failed for app.datadoghq.com (exit code 1).", level: "warning" },
      { message: "Datadog auth recovered for app.datadoghq.com.", level: "info" },
    ]);
    assert.equal(extension.registrations.length, 3);
    assert.deepEqual(extension.registrations[2]?.config.headers, {
      "DD-API-KEY": "api2",
      "DD-APPLICATION-KEY": "app2",
    });
  } finally {
    mock.timers.reset();
  }
});

test("does not re-register servers when keys are unchanged", async () => {
  const calls: string[] = [];
  const extension = createExtension(async (domain) => {
    calls.push(domain);
    return domain === "app.datadoghq.com" ? "api1\napp1\n" : "stage-api\nstage-app\n";
  });
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    extension.sessionStart({ type: "session_start" }, extension.ctx);
    await flushMicrotasks();
    mock.timers.tick(5 * 60 * 1000);
    await flushMicrotasks();

    assert.deepEqual(calls, [
      "app.datadoghq.com",
      "ddstaging.datadoghq.com",
      "app.datadoghq.com",
      "ddstaging.datadoghq.com",
    ]);
    assert.equal(extension.registrations.length, 2);
  } finally {
    mock.timers.reset();
  }
});

test("re-registers a server when its keys change", async () => {
  const calls = new Map<string, number>();
  const extension = createExtension(async (domain) => {
    const call = (calls.get(domain) ?? 0) + 1;
    calls.set(domain, call);
    const prefix = domain === "app.datadoghq.com" ? "api" : "stage-api";
    const appKey = domain === "app.datadoghq.com" ? "app" : "stage-app";
    return `${prefix}${call}\n${appKey}${call}\n`;
  });
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    extension.sessionStart({ type: "session_start" }, extension.ctx);
    await flushMicrotasks();
    mock.timers.tick(5 * 60 * 1000);
    await flushMicrotasks();

    assert.equal(extension.registrations.length, 4);
    assert.deepEqual(extension.registrations.slice(2).map(({ config }) => config.headers), [
      { "DD-API-KEY": "api2", "DD-APPLICATION-KEY": "app2" },
      { "DD-API-KEY": "stage-api2", "DD-APPLICATION-KEY": "stage-app2" },
    ]);
  } finally {
    mock.timers.reset();
  }
});

test("skips an interval tick while a fetch cycle is still running", async () => {
  const pendingProd = deferred<string>();
  const calls: string[] = [];
  const extension = createExtension((domain) => {
    calls.push(domain);
    return domain === "app.datadoghq.com" ? pendingProd.promise : Promise.resolve("stage-api\nstage-app\n");
  });
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    extension.sessionStart({ type: "session_start" }, extension.ctx);
    mock.timers.tick(5 * 60 * 1000);
    await flushMicrotasks();
    assert.deepEqual(calls, ["app.datadoghq.com"]);

    pendingProd.resolve("api1\napp1\n");
    await flushMicrotasks();
    assert.deepEqual(calls, ["app.datadoghq.com", "ddstaging.datadoghq.com"]);

    mock.timers.tick(5 * 60 * 1000);
    await flushMicrotasks();
    assert.deepEqual(calls, [
      "app.datadoghq.com",
      "ddstaging.datadoghq.com",
      "app.datadoghq.com",
      "ddstaging.datadoghq.com",
    ]);
  } finally {
    mock.timers.reset();
  }
});

test("shutdown is idempotent and prevents later interval fetches", async () => {
  const calls: string[] = [];
  const extension = createExtension(async (domain) => {
    calls.push(domain);
    return "api1\napp1\n";
  });
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    extension.sessionStart({ type: "session_start" }, extension.ctx);
    await flushMicrotasks();
    extension.sessionShutdown!({ type: "session_shutdown" }, extension.ctx);
    extension.sessionShutdown!({ type: "session_shutdown" }, extension.ctx);
    mock.timers.tick(10 * 60 * 1000);
    await flushMicrotasks();

    assert.deepEqual(calls, ["app.datadoghq.com", "ddstaging.datadoghq.com"]);
  } finally {
    mock.timers.reset();
  }
});

test("discards an in-flight fetch result after shutdown", async () => {
  const pendingProd = deferred<string>();
  const calls: string[] = [];
  const extension = createExtension((domain) => {
    calls.push(domain);
    return pendingProd.promise;
  });

  extension.sessionStart({ type: "session_start" }, extension.ctx);
  extension.sessionShutdown!({ type: "session_shutdown" }, extension.ctx);
  pendingProd.resolve("api1\napp1\n");
  await flushMicrotasks();

  assert.deepEqual(calls, ["app.datadoghq.com"]);
  assert.deepEqual(extension.registrations, []);
});
