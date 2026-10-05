import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// models.json resolves x-dd-tag-client_session_id from this environment variable.
export default function (pi: ExtensionAPI): void {
  pi.on("session_start", (_event, ctx) => {
    process.env.PI_CLIENT_SESSION_ID = ctx.sessionManager.getSessionId();
  });
}
