"""
axl/client.py

Python HTTP client for Gensyn AXL node.
Agents use this to send and receive messages over the P2P mesh.
All inter-agent messages follow the envelope defined in ARCHITECTURE.md.
"""

import json
import os
import time
import requests
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

# AXL HTTP bridge — each container exposes its node on localhost
AXL_API_PORT = int(os.getenv("AXL_API_PORT", "9002"))
AXL_BASE_URL = f"http://localhost:{AXL_API_PORT}"
AXL_RETRIES = int(os.getenv("AXL_RETRIES", "5"))
AXL_RETRY_DELAY = float(os.getenv("AXL_RETRY_DELAY", "0.5"))


def send_message(destination_pubkey: str, message: dict) -> bool:
    """
    Send a message to another AXL node.

    Args:
        destination_pubkey: 64-character hex public key of recipient node.
        message: dict following the MiliGents message envelope:
                 { type, from, to, payload, timestamp }

    Returns:
        True if message was accepted by local AXL node, False otherwise.
    """
    if "timestamp" not in message:
        message["timestamp"] = datetime.now(timezone.utc).isoformat()

    last_error = None
    for attempt in range(AXL_RETRIES):
        try:
            response = requests.post(
                f"{AXL_BASE_URL}/send",
                headers={"X-Destination-Peer-Id": destination_pubkey},
                data=json.dumps(message),
                timeout=10
            )
            return response.status_code == 200
        except requests.RequestException as e:
            last_error = e
            if attempt < AXL_RETRIES - 1:
                time.sleep(AXL_RETRY_DELAY)
    print(f"[AXL] send_message failed: {last_error}")
    return False


def receive_messages() -> list[dict]:
    """
    Poll local AXL node for inbound messages.

    Returns:
        List of parsed message dicts. Each dict contains the message
        body and a _from_peer_id key with the sender's public key.
        Returns empty list if no messages or on error.
    """
    last_error = None
    for attempt in range(AXL_RETRIES):
        try:
            response = requests.get(
                f"{AXL_BASE_URL}/recv",
                timeout=10
            )
            if response.status_code == 200 and response.text:
                sender_pubkey = response.headers.get("X-From-Peer-Id", "unknown")
                try:
                    body = json.loads(response.text)
                except json.JSONDecodeError:
                    body = {"raw": response.text}
                body["_from_peer_id"] = sender_pubkey
                return [body]
            return []
        except requests.RequestException as e:
            last_error = e
            if attempt < AXL_RETRIES - 1:
                time.sleep(AXL_RETRY_DELAY)
    print(f"[AXL] receive_messages failed: {last_error}")
    return []


def get_our_pubkey() -> str:
    """
    Get this node's public key from the local AXL node.

    Returns:
        64-character hex public key string, or empty string on error.
    """
    topology = get_topology()
    return topology.get("our_public_key", "")


def get_topology() -> dict:
    """
    Get full network topology from the local AXL node.

    Returns:
        Dict containing our_public_key, our_ipv6, and peer information.
        Returns empty dict on error.
    """
    last_error = None
    for attempt in range(AXL_RETRIES):
        try:
            response = requests.get(
                f"{AXL_BASE_URL}/topology",
                timeout=10
            )
            if response.status_code == 200:
                return response.json()
            return {}
        except requests.RequestException as e:
            last_error = e
            if attempt < AXL_RETRIES - 1:
                time.sleep(AXL_RETRY_DELAY)
    print(f"[AXL] get_topology failed: {last_error}")
    return {}


def build_message(
    msg_type: str,
    from_agent: str,
    to_agent: str,
    payload: dict
) -> dict:
    """
    Build a MiliGents message envelope.

    Args:
        msg_type: One of SPAWN_SPECIALIST, REPORT, STATUS, INSTRUCTION
        from_agent: Name of sending agent
        to_agent: Name of recipient agent
        payload: Message content as dict

    Returns:
        Complete message envelope dict ready to pass to send_message()
    """
    return {
        "type": msg_type,
        "from": from_agent,
        "to": to_agent,
        "payload": payload,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
