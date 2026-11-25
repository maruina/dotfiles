import assert from "node:assert/strict";
import test from "node:test";

import { createRexStatusExtension } from "./index.ts";
import {
  collectLayoutPositions,
  extractSessionPanes,
  formatRexPaneLocation,
  formatRexPaneReference,
  formatSplitPosition,
  listRexPanes,
  sortRexPanes,
} from "./panes.ts";

test("formatSplitPosition formats single, orthogonal, and nested split paths", () => {
  assert.equal(formatSplitPosition([]), "");
  assert.equal(formatSplitPosition(["left"]), "left");
  assert.equal(formatSplitPosition(["top", "left"]), "top-left");
  assert.equal(formatSplitPosition(["right", "bottom"]), "bottom-right");
  assert.equal(formatSplitPosition(["right", "left"]), "right / left");
  assert.equal(formatSplitPosition(["left", "bottom", "right"]), "left / bottom / right");
});

test("collectLayoutPositions maps nested horizontal and vertical splits", () => {
  const positions = collectLayoutPositions({
    split: {
      direction: "horizontal",
      before: { block_id: "block:left-pane" },
      after: {
        split: {
          direction: "vertical",
          before: { block_id: "block:top-right" },
          after: { block_id: "block:bottom-right" },
        },
      },
    },
  });

  assert.equal(positions.get("block:left-pane"), "left");
  assert.equal(positions.get("block:top-right"), "top-right");
  assert.equal(positions.get("block:bottom-right"), "bottom-right");
});

test("extractSessionPanes filters non-terminal blocks and records floating and split positions", () => {
  const panes = extractSessionPanes(
    {
      session_id: "session:s1",
      label: "dotfiles",
      active_window_id: "window:w1",
      windows: [
        {
          window_id: "window:w1",
          label: "dev",
          focused_block_id: "block:b2",
          layers: [
            {
              kind: "tiled",
              layout: {
                split: {
                  direction: "horizontal",
                  before: { block_id: "block:b1" },
                  after: { block_id: "block:b2" },
                },
              },
              blocks: [
                { block_id: "block:b1", label: "tests", creator_name: "com.superlogical.terminal" },
                { block_id: "block:b2", label: "pi", creator_name: "com.superlogical.terminal" },
                { block_id: "block:b3", label: "browser", creator_name: "com.superlogical.webview" },
              ],
            },
            {
              kind: "floating",
              blocks: [{ block_id: "block:b4", label: "scratch", creator_name: "com.superlogical.terminal" }],
            },
          ],
        },
      ],
    },
    { sessionId: "session:s1", blockId: "block:b2" },
  );

  assert.equal(panes.length, 3);
  assert.equal(panes[0].position, "left");
  assert.equal(panes[0].isCurrentSession, true);
  assert.equal(panes[0].isCurrentPane, false);
  assert.equal(panes[0].isActiveTab, true);
  assert.equal(panes[1].position, "right");
  assert.equal(panes[1].isCurrentPane, true);
  assert.equal(panes[1].isFocusedPane, true);
  assert.equal(panes[2].position, "floating");
});

test("listRexPanes sorts current session non-Pi panes before Pi pane and other sessions", async () => {
  const responses = new Map([
    ["whoami --json", { session_id: "session:s2", block_id: "block:pi-here" }],
    [
      "ls --json",
      {
        sessions: [
          { session_id: "session:s1", label: "other" },
          { session_id: "session:s2", label: "current" },
        ],
      },
    ],
    [
      "session inspect session:s1 --json",
      {
        session_id: "session:s1",
        label: "other",
        active_window_id: "window:o1",
        windows: [
          {
            window_id: "window:o1",
            label: "logs",
            focused_block_id: "block:o1",
            layers: [{ kind: "tiled", layout: { block_id: "block:o1" }, blocks: [{ block_id: "block:o1", label: "shell" }] }],
          },
        ],
      },
    ],
    [
      "session inspect session:s2 --json",
      {
        session_id: "session:s2",
        label: "current",
        active_window_id: "window:c2",
        windows: [
          {
            window_id: "window:c1",
            label: "tab-one",
            focused_block_id: "block:c1",
            layers: [{ kind: "tiled", layout: { block_id: "block:c1" }, blocks: [{ block_id: "block:c1", label: "build" }] }],
          },
          {
            window_id: "window:c2",
            label: "tab-two",
            focused_block_id: "block:pi-here",
            layers: [
              {
                kind: "tiled",
                layout: {
                  split: {
                    direction: "horizontal",
                    before: { block_id: "block:pi-here" },
                    after: { block_id: "block:beside" },
                  },
                },
                blocks: [
                  { block_id: "block:pi-here", label: "pi" },
                  { block_id: "block:beside", label: "server" },
                ],
              },
            ],
          },
        ],
      },
    ],
  ]);

  const panes = await listRexPanes(async (args) => {
    const key = args.join(" ");
    if (!responses.has(key)) throw new Error(`unexpected rex call: ${key}`);
    return responses.get(key);
  });

  assert.deepEqual(
    panes.map((pane) => pane.blockId),
    ["block:beside", "block:c1", "block:pi-here", "block:o1"],
  );
  assert.equal(formatRexPaneLocation(panes[0]), "current / tab 2 (tab-two) / server (right)");
  assert.equal(
    formatRexPaneReference(panes[0]),
    "Rex pane: current / tab 2 (tab-two) / server (right) (`-s session:s2 -b block:beside`)",
  );
});

test("listRexPanes tolerates whoami failure and skips sessions that fail inspect", async () => {
  const panes = await listRexPanes(async (args) => {
    const key = args.join(" ");
    if (key === "whoami --json") throw new Error("not inside rex");
    if (key === "ls --json") {
      return {
        sessions: [
          { session_id: "session:gone", label: "gone" },
          { session_id: "session:live", label: "live" },
        ],
      };
    }
    if (key === "session inspect session:gone --json") throw new Error("session closed");
    if (key === "session inspect session:live --json") {
      return {
        session_id: "session:live",
        label: "live",
        windows: [
          {
            window_id: "window:w1",
            label: "",
            layers: [{ kind: "tiled", layout: { block_id: "block:b1" }, blocks: [{ block_id: "block:b1", label: "shell" }] }],
          },
        ],
      };
    }
    throw new Error(`unexpected: ${key}`);
  });

  assert.equal(panes.length, 1);
  assert.equal(formatRexPaneLocation(panes[0]), "live / tab 1 / shell");
});

test("sortRexPanes preserves relative order within each bucket", () => {
  const base = {
    sessionId: "session:s1",
    sessionLabel: "s1",
    windowId: "window:w1",
    windowLabel: "w1",
    tabIndex: 1,
    blockLabel: "shell",
    position: "",
    isCurrentSession: true,
    isCurrentPane: false,
    isActiveTab: true,
    isFocusedPane: false,
  };
  const sorted = sortRexPanes([
    { ...base, blockId: "block:a" },
    { ...base, blockId: "block:b" },
  ]);
  assert.deepEqual(sorted.map((p) => p.blockId), ["block:a", "block:b"]);
});

test("/rex-status command copies selected pane reference and notifies", async () => {
  let registeredHandler;
  const copied = [];
  const notifications = [];
  const samplePane = {
    sessionId: "session:s1",
    sessionLabel: "dotfiles",
    windowId: "window:w1",
    windowLabel: "dev",
    tabIndex: 1,
    blockId: "block:b1",
    blockLabel: "tests",
    position: "left",
    isCurrentSession: true,
    isCurrentPane: false,
    isActiveTab: true,
    isFocusedPane: false,
  };

  const ext = createRexStatusExtension({
    listPanes: async () => [samplePane],
    pickPane: async (_ctx, panes, query) => {
      assert.equal(query, "tests");
      return panes[0];
    },
    copy: async (text) => {
      copied.push(text);
    },
  });

  ext({
    registerCommand(name, def) {
      assert.equal(name, "rex-status");
      registeredHandler = def.handler;
    },
  });

  await registeredHandler("tests", {
    hasUI: true,
    mode: "tui",
    ui: {
      notify(message, level) {
        notifications.push({ message, level });
      },
    },
  });

  assert.equal(copied.length, 1);
  assert.equal(copied[0], formatRexPaneReference(samplePane));
  assert.deepEqual(notifications, [
    { message: "Copied Rex pane reference (dotfiles / tab 1 (dev) / tests (left))", level: "info" },
  ]);
});

test("/rex-status command refuses non-tui mode and handles empty or error states", async () => {
  let registeredHandler;
  const notifications = [];
  let shouldThrow = false;

  const ext = createRexStatusExtension({
    listPanes: async () => {
      if (shouldThrow) throw new Error("server unreachable");
      return [];
    },
  });

  ext({
    registerCommand(_name, def) {
      registeredHandler = def.handler;
    },
  });

  const notify = (message, level) => notifications.push({ message, level });
  await registeredHandler("", { hasUI: false, mode: "print", ui: { notify } });
  await registeredHandler("", { hasUI: true, mode: "tui", ui: { notify } });
  shouldThrow = true;
  await registeredHandler("", { hasUI: true, mode: "tui", ui: { notify } });

  assert.deepEqual(notifications, [
    { message: "/rex-status requires an interactive TUI.", level: "warning" },
    { message: "No Rex terminal panes found.", level: "info" },
    { message: "Could not inspect Rex panes: server unreachable", level: "error" },
  ]);
});
