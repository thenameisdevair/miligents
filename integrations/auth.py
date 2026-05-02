"""
Wallet ownership authentication for MiliGents organisms.

The frontend gets a one-time SIWE-style message, the user signs it with their
owner wallet, and the backend verifies the recovered signer before creating a
short-lived session. Raw wallet addresses from the frontend are never trusted.
"""

import re
import secrets
from datetime import datetime, timedelta, timezone

from integrations.state_writer import _get_conn

try:
    from eth_account import Account
    from eth_account.messages import encode_defunct
except Exception:  # pragma: no cover - handled at runtime for clearer API errors
    Account = None
    encode_defunct = None


ADDRESS_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")
NONCE_TTL_MINUTES = 10
SESSION_TTL_DAYS = 7
SESSION_COOKIE = "miligents_session"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value)


def normalize_address(address: str) -> str:
    address = (address or "").strip()
    if not ADDRESS_RE.match(address):
        raise ValueError("invalid wallet address")
    return address.lower()


def build_auth_message(address: str, nonce: str, chain_id: int, issued_at: str, uri: str) -> str:
    return (
        "MiliGents wants you to sign in with your Ethereum account:\n"
        f"{address}\n\n"
        "Create or manage MiliGents organisms.\n\n"
        f"URI: {uri}\n"
        "Version: 1\n"
        f"Chain ID: {chain_id}\n"
        f"Nonce: {nonce}\n"
        f"Issued At: {issued_at}"
    )


def create_nonce(address: str, chain_id: int = 1, uri: str = "http://localhost:8081") -> dict:
    address = normalize_address(address)
    chain_id = int(chain_id or 1)
    nonce = secrets.token_urlsafe(18)
    issued_at = _now()
    expires_at = issued_at + timedelta(minutes=NONCE_TTL_MINUTES)
    message = build_auth_message(address, nonce, chain_id, _iso(issued_at), uri)

    conn = _get_conn()
    conn.execute(
        """INSERT INTO auth_nonces
           (nonce, address, chain_id, message, issued_at, expires_at, consumed_at)
           VALUES (?, ?, ?, ?, ?, ?, NULL)""",
        (nonce, address, chain_id, message, _iso(issued_at), _iso(expires_at)),
    )
    conn.commit()
    conn.close()
    return {
        "address": address,
        "chain_id": chain_id,
        "nonce": nonce,
        "message": message,
        "expires_at": _iso(expires_at),
    }


def verify_wallet_signature(address: str, chain_id: int, message: str, signature: str) -> dict:
    if Account is None or encode_defunct is None:
        raise RuntimeError("eth-account is required for wallet signature verification")

    address = normalize_address(address)
    chain_id = int(chain_id or 1)
    signature = (signature or "").strip()
    if not signature.startswith("0x"):
        raise ValueError("invalid signature")

    conn = _get_conn()
    row = conn.execute(
        """SELECT * FROM auth_nonces
           WHERE address = ? AND chain_id = ? AND message = ?
           ORDER BY issued_at DESC LIMIT 1""",
        (address, chain_id, message),
    ).fetchone()
    if not row:
        conn.close()
        raise ValueError("auth nonce not found")
    if row["consumed_at"]:
        conn.close()
        raise ValueError("auth nonce already consumed")
    if _parse_iso(row["expires_at"]) < _now():
        conn.close()
        raise ValueError("auth nonce expired")

    recovered = Account.recover_message(encode_defunct(text=message), signature=signature)
    if recovered.lower() != address:
        conn.close()
        raise ValueError("signature does not match wallet address")

    session_token = secrets.token_urlsafe(32)
    now = _now()
    expires_at = now + timedelta(days=SESSION_TTL_DAYS)
    conn.execute(
        "UPDATE auth_nonces SET consumed_at = ? WHERE nonce = ?",
        (_iso(now), row["nonce"]),
    )
    conn.execute(
        """INSERT INTO auth_sessions
           (session_token, owner_wallet, chain_id, created_at, expires_at, revoked_at)
           VALUES (?, ?, ?, ?, ?, NULL)""",
        (session_token, address, chain_id, _iso(now), _iso(expires_at)),
    )
    conn.commit()
    conn.close()
    return {
        "session_token": session_token,
        "owner_wallet": address,
        "chain_id": chain_id,
        "expires_at": _iso(expires_at),
    }


def get_session(session_token: str | None) -> dict | None:
    if not session_token:
        return None
    conn = _get_conn()
    row = conn.execute(
        """SELECT * FROM auth_sessions
           WHERE session_token = ? AND revoked_at IS NULL""",
        (session_token,),
    ).fetchone()
    conn.close()
    if not row:
        return None
    if _parse_iso(row["expires_at"]) < _now():
        return None
    return {
        "owner_wallet": row["owner_wallet"],
        "chain_id": row["chain_id"],
        "expires_at": row["expires_at"],
    }


def revoke_session(session_token: str | None) -> None:
    if not session_token:
        return
    conn = _get_conn()
    conn.execute(
        "UPDATE auth_sessions SET revoked_at = ? WHERE session_token = ?",
        (_iso(_now()), session_token),
    )
    conn.commit()
    conn.close()
