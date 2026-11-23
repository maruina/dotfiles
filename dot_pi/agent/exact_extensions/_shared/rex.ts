import { lstatSync, realpathSync } from "node:fs";

export type RexPeerIdentity = {
  endpoint: string;
  instance_id?: string;
  host_id?: string;
  session_id: string;
  block_id: string;
  pid?: number;
  principal?: { kind?: string; transport?: string; uid?: number };
};

export function isRexId(kind: "session" | "window" | "block", value: unknown): value is string {
  return typeof value === "string" && new RegExp(`^${kind}:[a-f0-9-]+$`, "i").test(value);
}

export function verifyLocalRexEndpoint(endpoint: string | undefined = process.env.REX_SERVER): string {
  if (!endpoint || !endpoint.startsWith("unix:///")) {
    throw new Error("An explicit local Unix Rex endpoint is required.");
  }
  const url = new URL(endpoint);
  if (url.hostname || url.search || url.hash) {
    throw new Error("Remote or ambiguous Rex endpoints are unsupported.");
  }
  const socket = lstatSync(decodeURIComponent(url.pathname));
  if (!socket.isSocket() || socket.uid !== process.getuid?.()) {
    throw new Error("Rex socket ownership does not match this user.");
  }
  return endpoint;
}

export function verifyLocalRexPeer(
  raw: unknown,
  endpoint: string,
  expected?: { session?: string; block?: string; requireMetadata?: boolean },
): RexPeerIdentity {
  const peer = raw as RexPeerIdentity | null | undefined;
  const uid = process.getuid?.();
  const validBase =
    !!peer &&
    typeof peer === "object" &&
    peer.endpoint === endpoint &&
    peer.principal?.kind === "peer" &&
    peer.principal.transport === "unix" &&
    peer.principal.uid === uid &&
    typeof peer.session_id === "string" &&
    peer.session_id.length > 0 &&
    typeof peer.block_id === "string" &&
    peer.block_id.length > 0;
  const validMeta = !expected?.requireMetadata || (
    isRexId("session", peer?.session_id) &&
    isRexId("block", peer?.block_id) &&
    typeof peer?.instance_id === "string" &&
    peer.instance_id.length > 0 &&
    typeof peer.host_id === "string" &&
    peer.host_id.length > 0 &&
    Number.isSafeInteger(peer.pid)
  );
  if (!validBase || !validMeta) {
    throw new Error("Rex did not verify this user's local session and pane.");
  }
  if (
    (expected?.session !== undefined && peer.session_id !== expected.session) ||
    (expected?.block !== undefined && peer.block_id !== expected.block)
  ) {
    throw new Error("Rex identity does not match the invoking pane.");
  }
  return peer;
}

export function matchesForegroundProcess(
  fg: unknown,
  expected: { pid: number; cwd: string; execPath: string; uid?: number },
): boolean {
  const proc = fg as { pid?: unknown; user_id?: unknown; cwd?: unknown; path?: unknown } | null | undefined;
  if (!proc || typeof proc !== "object") return false;
  if (proc.pid !== expected.pid) return false;
  const uid = expected.uid ?? process.getuid?.();
  if (proc.user_id !== uid) return false;
  if (typeof proc.cwd !== "string" || typeof proc.path !== "string" || !proc.cwd || !proc.path) return false;
  try {
    return (
      realpathSync(proc.cwd) === realpathSync(expected.cwd) &&
      realpathSync(proc.path) === realpathSync(expected.execPath)
    );
  } catch {
    return false;
  }
}
