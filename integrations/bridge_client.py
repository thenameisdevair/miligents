"""
integrations/bridge_client.py

Python HTTP client for the MiliGents TypeScript bridge service.
All agents use this to interact with 0G Storage and iNFT operations.
Never call the bridge HTTP API directly — always use these functions.
"""

import json
import os
import requests
from dotenv import load_dotenv

load_dotenv()

BRIDGE_URL = os.getenv("BRIDGE_URL", "http://localhost:3100")
TIMEOUT = 60  # seconds — blockchain ops can be slow


def health_check() -> bool:
    """
    Check if the bridge service is running and healthy.

    Returns:
        True if bridge is up and responding, False otherwise.
    """
    try:
        response = requests.get(f"{BRIDGE_URL}/health", timeout=10)
        return response.status_code == 200 and \
               response.json().get("status") == "ok"
    except requests.RequestException:
        return False


def upload_data(data: str | dict, filename: str) -> str:
    """
    Upload data to 0G Storage via the bridge.

    Args:
        data: String or dict to upload. Dicts are JSON-serialized.
        filename: Logical name for this data (for identification).

    Returns:
        root_hash: Permanent 0G Storage retrieval address.

    Raises:
        RuntimeError: If upload fails.
    """
    payload = {
        "data": data if isinstance(data, str) else json.dumps(data),
        "filename": filename
    }
    try:
        response = requests.post(
            f"{BRIDGE_URL}/storage/upload",
            json=payload,
            timeout=TIMEOUT
        )
        response.raise_for_status()
        return response.json()["root_hash"]
    except requests.RequestException as e:
        raise RuntimeError(f"Bridge upload failed: {e}")


def download_data(root_hash: str) -> str:
    """
    Download data from 0G Storage via the bridge.

    Args:
        root_hash: Root hash returned from upload_data.

    Returns:
        Data content as string.

    Raises:
        RuntimeError: If download fails.
    """
    try:
        response = requests.get(
            f"{BRIDGE_URL}/storage/download",
            params={"hash": root_hash},
            timeout=TIMEOUT
        )
        response.raise_for_status()
        return response.json()["data"]
    except requests.RequestException as e:
        raise RuntimeError(f"Bridge download failed: {e}")


def mint_inft(root_hash: str, metadata: dict) -> str:
    """
    Mint a new iNFT on 0G Chain via the bridge.
    Call this when an agent produces a new strategy version.

    Args:
        root_hash: 0G Storage root hash of the strategy data.
        metadata: Strategy metadata dict (agent name, version, etc).

    Returns:
        token_id: On-chain token ID as string.

    Raises:
        RuntimeError: If minting fails.
    """
    payload = {"root_hash": root_hash, "metadata": metadata}
    try:
        response = requests.post(
            f"{BRIDGE_URL}/inft/mint",
            json=payload,
            timeout=TIMEOUT
        )
        response.raise_for_status()
        return response.json()["token_id"]
    except requests.RequestException as e:
        raise RuntimeError(f"Bridge iNFT mint failed: {e}")


def get_inft(token_id: str) -> dict:
    """
    Get iNFT data by token ID via the bridge.

    Args:
        token_id: Token ID from mint_inft.

    Returns:
        Dict with root_hash, metadata_hash, version, owner.

    Raises:
        RuntimeError: If retrieval fails.
    """
    try:
        response = requests.get(
            f"{BRIDGE_URL}/inft/get",
            params={"token_id": token_id},
            timeout=TIMEOUT
        )
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        raise RuntimeError(f"Bridge iNFT get failed: {e}")


def update_inft(token_id: str, root_hash: str, metadata: dict) -> bool:
    """
    Update an existing iNFT with a new strategy version.

    Args:
        token_id: Existing token ID to update.
        root_hash: New 0G Storage root hash.
        metadata: Updated metadata dict.

    Returns:
        True if update succeeded.

    Raises:
        RuntimeError: If update fails.
    """
    payload = {
        "token_id": token_id,
        "root_hash": root_hash,
        "metadata": metadata
    }
    try:
        response = requests.post(
            f"{BRIDGE_URL}/inft/update",
            json=payload,
            timeout=TIMEOUT
        )
        response.raise_for_status()
        return response.json().get("success", False)
    except requests.RequestException as e:
        raise RuntimeError(f"Bridge iNFT update failed: {e}")
