#!/usr/bin/env python3
"""
Slack MCP stdio proxy.

Bridges JSON-RPC 2.0 over stdin/stdout to the mcp.slack.com HTTP MCP endpoint
using a Bearer token read from the macOS keychain. Works in both Claude Code
(as a registered MCP server) and Space Jam (stdio MCP client).

Token lifecycle:
  - On startup: reads access_token from 'Claude Code-credentials' keychain entry
  - On 401: attempts token refresh using stored refresh_token, persists new
    tokens back to keychain so all consumers stay in sync
  - On refresh failure: exits with a message telling the user to re-auth

Usage:
  Add to ~/.claude.json (or ~/.config/mcp/mcp.json for Space Jam):
    "slack": {
      "command": "python3",
      "args": ["/path/to/slack-mcp-proxy.py"]
    }
"""

import getpass
import json
import sys
import subprocess
import urllib.request
import urllib.error
import urllib.parse

MCP_URL = "https://mcp.slack.com/mcp"
TOKEN_ENDPOINT = "https://slack.com/api/oauth.v2.user.access"
CLIENT_ID = "1601185624273.8899143856786"
KEYCHAIN_SERVICE = "Claude Code-credentials"
KEYCHAIN_ACCOUNT = getpass.getuser()  # resolved at runtime from OS username
TOKEN_KEY_PREFIX = "slack"             # key format: "slack|<hash>" or "plugin:slack:slack|<hash>"


def log(msg: str):
    print(f"[slack-mcp-proxy] {msg}", file=sys.stderr, flush=True)


# ---------------------------------------------------------------------------
# Keychain helpers
# ---------------------------------------------------------------------------

def read_keychain() -> dict:
    result = subprocess.run(
        ["security", "find-generic-password",
         "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT, "-w"],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"Keychain read failed ({result.returncode}): {result.stderr.strip()}"
        )
    return json.loads(result.stdout.strip())


def write_keychain(data: dict):
    payload = json.dumps(data)
    result = subprocess.run(
        ["security", "add-generic-password",
         "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT,
         "-w", payload, "-U"],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Keychain write failed: {result.stderr.strip()}")


def find_token_keys(creds: dict) -> list[str]:
    """Discover all keychain keys that look like Slack MCP entries."""
    mcp = creds.get("mcpOAuth", {})
    return [
        k for k in mcp
        if k.startswith("slack|") or k.startswith("plugin:slack:slack|")
    ]


def get_tokens() -> tuple[str, str]:
    """Return (access_token, refresh_token) from keychain."""
    creds = read_keychain()
    for key in find_token_keys(creds):
        entry = creds["mcpOAuth"][key]
        if entry.get("accessToken"):
            return entry["accessToken"], entry.get("refreshToken", "")
    return "", ""


def save_tokens(access: str, refresh: str):
    """Persist refreshed tokens back to keychain (all Slack key variants)."""
    creds = read_keychain()
    mcp = creds.setdefault("mcpOAuth", {})
    for key in find_token_keys(creds):
        mcp[key]["accessToken"] = access
        mcp[key]["refreshToken"] = refresh
    write_keychain(creds)
    log("Refreshed tokens persisted to keychain")


# ---------------------------------------------------------------------------
# Token refresh
# ---------------------------------------------------------------------------

def refresh_token(refresh_tok: str) -> tuple[str, str]:
    """Exchange refresh_token for new (access_token, refresh_token)."""
    body = urllib.parse.urlencode({
        "grant_type": "refresh_token",
        "client_id": CLIENT_ID,
        "refresh_token": refresh_tok,
    }).encode()
    req = urllib.request.Request(
        TOKEN_ENDPOINT, data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        result = json.loads(resp.read())
    if not result.get("ok"):
        raise RuntimeError(f"Token refresh error: {result.get('error', 'unknown')}")
    new_access = result["access_token"]
    new_refresh = result.get("refresh_token", refresh_tok)
    save_tokens(new_access, new_refresh)
    return new_access, new_refresh


# ---------------------------------------------------------------------------
# HTTP helper
# ---------------------------------------------------------------------------

def http_post(body: bytes, token: str, session_id: str | None) -> tuple[int, str, str | None, bytes]:
    headers = {
        "Accept": "application/json, text/event-stream",
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    }
    if session_id:
        headers["Mcp-Session-Id"] = session_id
    req = urllib.request.Request(MCP_URL, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return (
                resp.status,
                resp.headers.get("Content-Type", ""),
                resp.headers.get("Mcp-Session-Id"),
                resp.read(),
            )
    except urllib.error.HTTPError as exc:
        return exc.code, exc.headers.get("Content-Type", ""), None, exc.read()


def is_initialize(body: bytes) -> bool:
    try:
        message = json.loads(body)
    except json.JSONDecodeError:
        return False
    messages = message if isinstance(message, list) else [message]
    return any(isinstance(item, dict) and item.get("method") == "initialize" for item in messages)


def response_messages(content_type: str, response: bytes) -> list[bytes]:
    """Convert an HTTP MCP response into newline-delimited JSON-RPC messages."""
    if not response:
        return []
    if content_type.split(";", 1)[0].strip().lower() != "text/event-stream":
        return [response.strip()]

    messages: list[bytes] = []
    data_lines: list[str] = []

    def append_event():
        if not data_lines:
            return
        data = "\n".join(data_lines)
        data_lines.clear()
        try:
            messages.append(json.dumps(json.loads(data), separators=(",", ":")).encode())
        except json.JSONDecodeError:
            log("Ignoring an SSE event with invalid JSON-RPC data")

    for line in response.decode("utf-8").splitlines():
        if not line:
            append_event()
        elif line.startswith("data:"):
            data_lines.append(line[5:].lstrip())
    append_event()
    return messages


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def main():
    log("Starting — reading token from keychain")
    access_token, refresh_tok = get_tokens()
    session_id: str | None = None

    if not access_token:
        log("ERROR: No Slack access token found in keychain.")
        log("Run the slack-mcp-auth.py script to authenticate, then retry.")
        sys.exit(1)

    log(f"Token loaded ({access_token[:12]}...)")

    stdin = sys.stdin.buffer
    stdout = sys.stdout.buffer

    while True:
        line = stdin.readline()
        if not line:
            break  # EOF — parent closed the pipe

        line = line.strip()
        if not line:
            continue

        initializing = is_initialize(line)
        request_session = None if initializing else session_id
        status, content_type, returned_session, response = http_post(
            line, access_token, request_session
        )

        # Attempt one token refresh on 401.
        if status == 401:
            if not refresh_tok:
                log("Got 401 and no refresh_token — re-authentication required")
                log("Run slack-mcp-auth.py to re-authenticate")
                sys.exit(1)
            log("Got 401 — refreshing token")
            try:
                access_token, refresh_tok = refresh_token(refresh_tok)
                status, content_type, returned_session, response = http_post(
                    line, access_token, request_session
                )
            except Exception as exc:
                log(f"Token refresh failed: {exc}")
                log("Run slack-mcp-auth.py to re-authenticate")
                sys.exit(1)

        if status == 404 and request_session:
            session_id = None
            log("MCP session expired; waiting for the client to reinitialize")
        elif initializing and returned_session:
            session_id = returned_session

        for message in response_messages(content_type, response):
            stdout.write(message)
            stdout.write(b"\n")
        stdout.flush()


if __name__ == "__main__":
    main()
