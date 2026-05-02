"""
axl/local_bridge.py

Small AXL-compatible HTTP bridge for local Docker demos.

The production design expects a Gensyn AXL node exposing /send, /recv, and
/topology inside each agent container. The hackathon Docker image does not
bundle that external binary, so this bridge gives the agents a concrete local
endpoint instead of failing with connection refused.
"""

import json
import os
import sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


STATE_DIR = os.getenv("STATE_DIR", "/app/state")
DB_PATH = os.path.join(STATE_DIR, "state.db")
AGENT_ID = os.getenv("AXL_AGENT_ID", os.getenv("AGENT_ID", "agent"))
AXL_API_PORT = int(os.getenv("AXL_API_PORT", "9002"))
CURSOR_PATH = os.path.join(STATE_DIR, f"axl_{AGENT_ID}.cursor")


def _ensure_state_dir() -> None:
    Path(STATE_DIR).mkdir(parents=True, exist_ok=True)


def _read_cursor() -> int:
    try:
        with open(CURSOR_PATH) as f:
            return int(f.read().strip() or "0")
    except Exception:
        return 0


def _write_cursor(value: int) -> None:
    try:
        _ensure_state_dir()
        with open(CURSOR_PATH, "w") as f:
            f.write(str(value))
    except Exception:
        pass


def _next_message() -> tuple[int, dict] | None:
    if not os.path.exists(DB_PATH):
        return None
    cursor = _read_cursor()
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            """SELECT * FROM axl_messages
               WHERE id > ? AND to_agent = ?
               ORDER BY id ASC LIMIT 1""",
            (cursor, AGENT_ID),
        ).fetchone()
        conn.close()
    except Exception:
        return None
    if not row:
        return None
    payload = row["payload"]
    try:
        payload = json.loads(payload) if payload else {}
    except json.JSONDecodeError:
        payload = {"raw": payload}
    body = {
        "type": row["msg_type"],
        "from": row["from_agent"],
        "to": row["to_agent"],
        "payload": payload,
        "timestamp": row["timestamp"],
    }
    return row["id"], body


class Handler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, body: dict, headers: dict | None = None):
        data = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/health":
            self._send_json(200, {"status": "ok", "agent": AGENT_ID})
            return
        if self.path == "/topology":
            self._send_json(200, {
                "our_public_key": os.getenv("AXL_PUBLIC_KEY", f"local-{AGENT_ID}"),
                "our_agent_id": AGENT_ID,
                "transport": "local-state-bridge",
            })
            return
        if self.path == "/recv":
            message = _next_message()
            if not message:
                self.send_response(204)
                self.end_headers()
                return
            message_id, body = message
            _write_cursor(message_id)
            self._send_json(
                200,
                body,
                {"X-From-Peer-Id": body.get("from", "unknown")},
            )
            return
        self._send_json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/send":
            self._send_json(404, {"error": "not found"})
            return
        length = int(self.headers.get("Content-Length", "0") or "0")
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        try:
            body = json.loads(raw)
        except json.JSONDecodeError:
            body = {"raw": raw}
        self._send_json(200, {
            "status": "accepted",
            "agent": AGENT_ID,
            "destination": self.headers.get("X-Destination-Peer-Id", ""),
            "type": body.get("type"),
            "transport": "local-state-bridge",
        })

    def log_message(self, fmt, *args):
        print(f"[AXL Local Bridge:{AGENT_ID}] {fmt % args}", flush=True)


def main():
    _ensure_state_dir()
    server = ThreadingHTTPServer(("0.0.0.0", AXL_API_PORT), Handler)
    print(
        f"[AXL Local Bridge:{AGENT_ID}] listening on 0.0.0.0:{AXL_API_PORT}",
        flush=True,
    )
    server.serve_forever()


if __name__ == "__main__":
    main()
