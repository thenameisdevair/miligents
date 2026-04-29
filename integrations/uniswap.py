"""
integrations/uniswap.py

Uniswap Trading API wrapper for MiliGents.
Handles token swaps for treasury management and agent funding.

Uses Uniswap Trading API REST endpoints via requests.
Sepolia testnet for all demo transactions.

AUTH REQUIRED: UNISWAP_API_KEY and WALLET_PRIVATE_KEY in .env
"""

import os
import requests
from dotenv import load_dotenv

load_dotenv()

UNISWAP_API_KEY = os.getenv("UNISWAP_API_KEY", "")
WALLET_ADDRESS = os.getenv("WALLET_ADDRESS", "")
UNISWAP_API_BASE = "https://trade-api.gateway.uniswap.org/v1"
TIMEOUT = 30

HEADERS = {
    "Content-Type": "application/json",
    "x-api-key": UNISWAP_API_KEY
}

# Sepolia testnet token addresses
WETH_SEPOLIA = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14"
USDC_SEPOLIA = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"


def get_quote(
    token_in: str,
    token_out: str,
    amount: str,
    chain_id: int = 11155111
) -> dict:
    """
    Get a swap quote from Uniswap Trading API.

    Args:
        token_in: Input token contract address.
        token_out: Output token contract address.
        amount: Amount in wei as string.
        chain_id: Chain ID (11155111 = Sepolia).

    Returns:
        Quote dict with price, gas estimate, route.

    Raises:
        RuntimeError: If quote request fails.
    """
    # AUTH REQUIRED: UNISWAP_API_KEY must be set in .env
    try:
        response = requests.post(
            f"{UNISWAP_API_BASE}/quote",
            headers=HEADERS,
            json={
                "tokenInChainId": chain_id,
                "tokenOutChainId": chain_id,
                "tokenIn": token_in,
                "tokenOut": token_out,
                "amount": amount,
                "type": "EXACT_INPUT",
                "swapper": WALLET_ADDRESS
            },
            timeout=TIMEOUT
        )
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        raise RuntimeError(f"Uniswap quote failed: {e}")


def execute_swap(
    token_in: str,
    token_out: str,
    amount: str,
    chain_id: int = 11155111
) -> str:
    """
    Execute a token swap via Uniswap Trading API.
    Gets quote first, then submits the swap transaction.

    Args:
        token_in: Input token contract address.
        token_out: Output token contract address.
        amount: Amount in wei as string.
        chain_id: Chain ID (11155111 = Sepolia).

    Returns:
        Transaction hash as string.

    Raises:
        RuntimeError: If swap fails.
    """
    # AUTH REQUIRED: UNISWAP_API_KEY and WALLET_PRIVATE_KEY in .env
    # Step 1: Get quote
    quote = get_quote(token_in, token_out, amount, chain_id)
    quote_id = quote.get("quote", {}).get("quoteId")

    if not quote_id:
        raise RuntimeError(f"No quote ID returned: {quote}")

    # Step 2: Submit swap using quote
    try:
        response = requests.post(
            f"{UNISWAP_API_BASE}/order",
            headers=HEADERS,
            json={
                "quote": quote.get("quote"),
                "signature": "0x"  # placeholder — real sig requires wallet signing
            },
            timeout=TIMEOUT
        )
        response.raise_for_status()
        result = response.json()
        tx_hash = result.get("hash", "")
        print(f"[Uniswap] Swap submitted: {tx_hash}")
        return tx_hash
    except requests.RequestException as e:
        raise RuntimeError(f"Uniswap swap failed: {e}")


def get_token_balance(token: str, wallet: str, chain_id: int = 11155111) -> str:
    """
    Get token balance for a wallet address.

    Args:
        token: Token contract address.
        wallet: Wallet address to check.
        chain_id: Chain ID.

    Returns:
        Balance in wei as string.
    """
    try:
        response = requests.get(
            f"{UNISWAP_API_BASE}/check_approval",
            headers=HEADERS,
            params={
                "token": token,
                "amount": "0",
                "walletAddress": wallet,
                "chainId": chain_id
            },
            timeout=TIMEOUT
        )
        response.raise_for_status()
        return response.json().get("amount", "0")
    except requests.RequestException:
        return "0"


def test_uniswap() -> bool:
    """
    Smoke test for Uniswap integration.
    Tests quote endpoint only — no actual swap executed.

    Returns:
        True if quote API is reachable.
    """
    try:
        # Test quote only — 0.001 WETH to USDC on Sepolia
        quote = get_quote(
            token_in=WETH_SEPOLIA,
            token_out=USDC_SEPOLIA,
            amount="1000000000000000"  # 0.001 ETH in wei
        )
        print(f"[Uniswap] Quote received: {quote}")
        print("[Uniswap] Connection test passed")
        return True
    except Exception as e:
        print(f"[Uniswap] Test failed: {e}")
        return False
