"""
integrations/wallet.py

Lightweight JSON-RPC wallet client for the MiliGents organism.
Reads the native token balance of the organism's treasury wallet
from the configured EVM RPC endpoint.

No web3.py dependency — raw JSON-RPC over HTTPS via `requests`.

Environment variables:
    OG_RPC_URL       EVM JSON-RPC endpoint (e.g. https://evmrpc-testnet.0g.ai)
    WALLET_ADDRESS   Treasury wallet address (0x-prefixed, 40 hex chars)
"""

import os
from decimal import Decimal

import requests
from dotenv import load_dotenv

load_dotenv()

DEFAULT_TIMEOUT = 10
WEI_PER_ETH = Decimal(10) ** 18
ETH_DISPLAY_PRECISION = Decimal("0.000001")


def _rpc_call(method: str, params: list, rpc_url: str | None = None) -> dict:
    """
    Send a JSON-RPC request to the configured EVM endpoint.

    Args:
        method: JSON-RPC method name (e.g. 'eth_getBalance').
        params: List of method parameters.
        rpc_url: Override RPC URL. Falls back to OG_RPC_URL env var.

    Returns:
        Raw JSON-RPC response dict.

    Raises:
        RuntimeError: If RPC URL is not configured or response is malformed.
        requests.RequestException: On network/HTTP failure.
    """
    url = rpc_url or os.getenv("OG_RPC_URL")
    if not url:
        raise RuntimeError("OG_RPC_URL is not set")

    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params,
    }
    response = requests.post(url, json=payload, timeout=DEFAULT_TIMEOUT)
    response.raise_for_status()
    data = response.json()
    if "error" in data:
        raise RuntimeError(f"RPC error: {data['error']}")
    return data


def get_eth_balance(address: str | None = None, rpc_url: str | None = None) -> str:
    """
    Fetch the native token balance of an address as a decimal string.

    Args:
        address: Wallet address. Falls back to WALLET_ADDRESS env var.
        rpc_url: Override RPC URL. Falls back to OG_RPC_URL env var.

    Returns:
        Balance in ETH as a fixed-precision decimal string (6 dp).

    Raises:
        RuntimeError: If address is not configured or RPC fails.
    """
    addr = address or os.getenv("WALLET_ADDRESS")
    if not addr:
        raise RuntimeError("WALLET_ADDRESS is not set")

    data = _rpc_call("eth_getBalance", [addr, "latest"], rpc_url=rpc_url)
    wei_hex = data.get("result")
    if not isinstance(wei_hex, str) or not wei_hex.startswith("0x"):
        raise RuntimeError(f"Unexpected eth_getBalance result: {data!r}")

    wei = Decimal(int(wei_hex, 16))
    eth = (wei / WEI_PER_ETH).quantize(ETH_DISPLAY_PRECISION)
    return str(eth)


def get_block_number(rpc_url: str | None = None) -> int:
    """
    Fetch the current block number as an int. Used as an RPC sanity check.

    Args:
        rpc_url: Override RPC URL. Falls back to OG_RPC_URL env var.

    Returns:
        Current block number.
    """
    data = _rpc_call("eth_blockNumber", [], rpc_url=rpc_url)
    return int(data["result"], 16)
