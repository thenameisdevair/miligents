"""
axl/test_axl.py

Two-node AXL round-trip verification test.
Run this before Stage 2 to confirm AXL is working.

Prerequisites:
- AXL binary built at axl/node (or axl/axl/node if cloned inside repo)
- private-a.pem and private-b.pem generated in axl/configs/
- Two AXL node configs in axl/configs/

Usage:
    python axl/test_axl.py

Expected output:
    [AXL TEST] Node A started — public key: <64 char hex>
    [AXL TEST] Node B started — public key: <64 char hex>
    [AXL TEST] Sending message from B to A...
    [AXL TEST] PASS — message received on A: hello from node B
"""

import json
import subprocess
import sys
import time
import requests
import os

# Paths — adjust AXL_BINARY if your binary is elsewhere
AXL_BINARY = os.path.join(os.path.dirname(__file__), "..", "axl-src", "node")
CONFIG_DIR = os.path.join(os.path.dirname(__file__), "configs")
CONFIG_A = os.path.join(CONFIG_DIR, "node-config-originator.json")
CONFIG_B = os.path.join(CONFIG_DIR, "node-config-specialist.json")

NODE_A_PORT = 9002
NODE_B_PORT = 9012


def get_pubkey(port: int) -> str:
    """Get public key from running AXL node."""
    try:
        r = requests.get(f"http://localhost:{port}/topology", timeout=5)
        return r.json().get("our_public_key", "")
    except Exception as e:
        print(f"[AXL TEST] Failed to get pubkey on port {port}: {e}")
        return ""


def send(port: int, dest_pubkey: str, message: str) -> bool:
    """Send raw message to dest_pubkey via AXL node on given port."""
    try:
        r = requests.post(
            f"http://localhost:{port}/send",
            headers={"X-Destination-Peer-Id": dest_pubkey},
            data=message,
            timeout=5
        )
        return r.status_code == 200
    except Exception as e:
        print(f"[AXL TEST] Send failed: {e}")
        return False


def recv(port: int) -> str:
    """Receive one message from AXL node on given port."""
    try:
        r = requests.get(f"http://localhost:{port}/recv", timeout=5)
        if r.status_code == 200 and r.text:
            return r.text
        return ""
    except Exception as e:
        print(f"[AXL TEST] Recv failed: {e}")
        return ""


def main():
    print("[AXL TEST] Starting two-node round-trip test...")

    # Start Node A
    proc_a = subprocess.Popen(
        [AXL_BINARY, "-config", CONFIG_A],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )

    # Start Node B
    proc_b = subprocess.Popen(
        [AXL_BINARY, "-config", CONFIG_B],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )

    print("[AXL TEST] Waiting for nodes to start...")
    time.sleep(3)

    # Get public keys
    pubkey_a = get_pubkey(NODE_A_PORT)
    pubkey_b = get_pubkey(NODE_B_PORT)

    if not pubkey_a or not pubkey_b:
        print("[AXL TEST] FAIL — could not retrieve public keys")
        proc_a.terminate()
        proc_b.terminate()
        sys.exit(1)

    print(f"[AXL TEST] Node A public key: {pubkey_a}")
    print(f"[AXL TEST] Node B public key: {pubkey_b}")

    # Send from B to A
    test_message = "hello from node B"
    print(f"[AXL TEST] Sending message from B to A: '{test_message}'")
    ok = send(NODE_B_PORT, pubkey_a, test_message)

    if not ok:
        print("[AXL TEST] FAIL — send returned non-200")
        proc_a.terminate()
        proc_b.terminate()
        sys.exit(1)

    time.sleep(2)

    # Receive on A
    received = recv(NODE_A_PORT)

    proc_a.terminate()
    proc_b.terminate()

    if test_message in received:
        print(f"[AXL TEST] PASS — message received on A: {received}")
        sys.exit(0)
    else:
        print(f"[AXL TEST] FAIL — expected '{test_message}', got: '{received}'")
        sys.exit(1)


if __name__ == "__main__":
    main()
