"""
bridge/test_bridge.py

Smoke test for the MiliGents bridge service.
Run this after starting the bridge to verify all endpoints work.

Prerequisites:
- Bridge running: cd bridge && npm start
- OG_PRIVATE_KEY, OG_RPC_URL, OG_STORAGE_INDEXER set in .env
- OG_INFT_CONTRACT_ADDRESS set in .env (after deploying contract)

Usage:
    python bridge/test_bridge.py
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from integrations.bridge_client import (
    health_check,
    upload_data,
    download_data,
    mint_inft,
    get_inft
)

def run_tests():
    print("[Bridge Test] Starting smoke tests...")

    # Test 1 — Health check
    print("\n[Test 1] Health check...")
    assert health_check(), "FAIL — bridge not reachable"
    print("PASS — bridge is healthy")

    # Test 2 — Upload
    print("\n[Test 2] Upload to 0G Storage...")
    test_data = {
        "agent": "originator",
        "test": True,
        "message": "MiliGents bridge smoke test"
    }
    root_hash = upload_data(test_data, "smoke_test.json")
    assert root_hash and len(root_hash) > 0, "FAIL — no root hash returned"
    print(f"PASS — uploaded, root hash: {root_hash}")

    # Test 3 — Download
    print("\n[Test 3] Download from 0G Storage...")
    downloaded = download_data(root_hash)
    assert "MiliGents" in downloaded, "FAIL — content mismatch"
    print(f"PASS — downloaded and verified")

    # Test 4 — Mint iNFT
    print("\n[Test 4] Mint iNFT on 0G Chain...")
    token_id = mint_inft(root_hash, {
        "agent": "originator",
        "version": 1,
        "strategy": "smoke_test"
    })
    assert token_id and len(token_id) > 0, "FAIL — no token ID returned"
    print(f"PASS — minted iNFT token ID: {token_id}")

    # Test 5 — Get iNFT
    print("\n[Test 5] Get iNFT from 0G Chain...")
    inft = get_inft(token_id)
    assert inft["root_hash"] == root_hash, "FAIL — root hash mismatch"
    assert inft["version"] == 1, "FAIL — version mismatch"
    print(f"PASS — retrieved iNFT: version {inft['version']}, owner {inft['owner']}")

    print("\n[Bridge Test] All tests passed.")

if __name__ == "__main__":
    run_tests()
