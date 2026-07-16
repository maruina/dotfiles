#!/usr/bin/env python3
"""
Slack MCP OAuth authentication script.

Completes the OAuth 2.0 + PKCE flow for the Slack MCP server and stores the
resulting tokens in the 'Claude Code-credentials' macOS keychain entry so that
slack-mcp-proxy.py can use them immediately.

This is the same clientId used by the claude-plugins-official Slack plugin, so
tokens written here are also read by Claude Code's built-in plugin system.

Run this once (or when tokens expire and refresh fails):
  python3 slack-mcp-auth.py
"""

import http.server
import threading
import urllib.request
import urllib.parse
import hashlib
import base64
import secrets
import json
import subprocess
import webbrowser
import sys
import getpass
import time

CLIENT_ID = "1601185624273.8899143856786"
CALLBACK_PORT = 3118
REDIRECT_URI = f"http://localhost:{CALLBACK_PORT}/callback"
AUTH_ENDPOINT = "https://slack.com/oauth/v2_user/authorize"
TOKEN_ENDPOINT = "https://slack.com/api/oauth.v2.user.access"
SCOPES = (
    "channels:history groups:history im:history mpim:history "
    "search:read.public search:read.private search:read.mpim "
    "search:read.im search:read.files search:read.users "
    "users:read users:read.email chat:write"
)
KEYCHAIN_SERVICE = "Claude Code-credentials"
KEYCHAIN_ACCOUNT = getpass.getuser()  # resolved at runtime
SLACK_CREDENTIAL_KEY = "slack|38801a7d845718b3"


def read_keychain() -> dict:
    result = subprocess.run(
        ["security", "find-generic-password",
         "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT, "-w"],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        # Entry doesn't exist yet — start fresh
        return {}
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


def pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(32)
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()
    ).rstrip(b"=").decode()
    return verifier, challenge


def build_auth_url(challenge: str, state: str) -> str:
    params = {
        "client_id": CLIENT_ID,
        "response_type": "code",
        "redirect_uri": REDIRECT_URI,
        "scope": SCOPES,
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    return AUTH_ENDPOINT + "?" + urllib.parse.urlencode(params)


def exchange_code(code: str, verifier: str) -> dict:
    body = urllib.parse.urlencode({
        "client_id": CLIENT_ID,
        "code": code,
        "redirect_uri": REDIRECT_URI,
        "code_verifier": verifier,
    }).encode()
    req = urllib.request.Request(
        TOKEN_ENDPOINT, data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def run_local_server(expected_state: str) -> str:
    """Start a one-shot HTTP server on CALLBACK_PORT; return the auth code."""
    code_holder: dict = {}
    done = threading.Event()

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            parsed = urllib.parse.urlparse(self.path)
            params = dict(urllib.parse.parse_qsl(parsed.query))

            if parsed.path != "/callback":
                self.send_response(404)
                self.end_headers()
                return

            if params.get("state") != expected_state:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b"State mismatch")
                return

            code_holder["code"] = params.get("code", "")
            self.send_response(200)
            self.send_header("Content-type", "text/html")
            self.end_headers()
            self.wfile.write(
                b"<html><body>"
                b"<h2>Slack authenticated!</h2>"
                b"<p>You can close this tab and return to the terminal.</p>"
                b"</body></html>"
            )
            threading.Thread(target=self.server.shutdown, daemon=True).start()
            done.set()

        def log_message(self, *args):
            pass  # silence access log

    server = http.server.HTTPServer(("localhost", CALLBACK_PORT), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    done.wait(timeout=120)
    return code_holder.get("code", "")


def token_entry(access_token: str, refresh_token: str, expires_in: int | None) -> dict:
    entry = {
        "serverName": "slack",
        "serverUrl": "https://mcp.slack.com/mcp",
        "accessToken": access_token,
        "refreshToken": refresh_token,
        "discoveryState": {
            "authorizationServerUrl": "https://mcp.slack.com",
            "resourceMetadataUrl": "https://mcp.slack.com/.well-known/oauth-protected-resource",
        },
    }
    if expires_in is not None:
        entry["expiresAt"] = int(time.time() * 1000) + expires_in * 1000
    return entry


def main():
    verifier, challenge = pkce_pair()
    state = secrets.token_urlsafe(16)
    auth_url = build_auth_url(challenge, state)

    print("Opening Slack OAuth in your browser...")
    print(f"If the browser doesn't open, visit:\n  {auth_url}\n")
    webbrowser.open(auth_url)

    print(f"Waiting for callback on localhost:{CALLBACK_PORT}...")
    code = run_local_server(state)

    if not code:
        print("ERROR: No auth code received (timeout or cancelled)")
        sys.exit(1)

    print("Exchanging code for token...")
    result = exchange_code(code, verifier)

    if not result.get("ok"):
        print(f"ERROR: Token exchange failed: {result.get('error')}")
        sys.exit(1)

    access_token = result["access_token"]
    refresh_token = result.get("refresh_token", "")
    expires_in = result.get("expires_in")
    if expires_in is not None:
        expires_in = int(expires_in)
    team = result.get("team", {}).get("name", "unknown")

    # Update every existing Slack credential. Seed the key used by Claude Code's
    # Slack plugin when this is the user's first authorization.
    creds = read_keychain()
    mcp = creds.setdefault("mcpOAuth", {})
    existing_keys = [
        key for key in mcp
        if key.startswith("slack|") or key.startswith("plugin:slack:slack|")
    ]
    for key in existing_keys or [SLACK_CREDENTIAL_KEY]:
        previous = mcp.get(key, {})
        entry = {**previous, **token_entry(access_token, refresh_token, expires_in)}
        if not refresh_token or expires_in is None:
            entry.pop("expiresAt", None)
        mcp[key] = entry

    write_keychain(creds)

    print(f"\nAuthenticated to {team} Slack workspace")
    print(f"Token stored in keychain ({access_token[:15]}...)")
    print("\nslack-mcp-proxy.py and Claude Code plugin will now use this token.")


if __name__ == "__main__":
    main()
