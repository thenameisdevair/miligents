"""
Safety policy for live KeeperHub execution.

The policy is intentionally deny-by-default. Agents may propose actions, but
real money-moving writes require explicit environment configuration.
"""

from __future__ import annotations

import os
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path

try:
    from dotenv import load_dotenv
except ModuleNotFoundError:
    load_dotenv = None

if load_dotenv:
    load_dotenv()


MAINNET_NETWORKS = {
    "ethereum",
    "mainnet",
    "base",
    "arbitrum",
    "optimism",
    "polygon",
}
DANGEROUS_APPROVAL_FUNCTIONS = {
    "approve",
    "setapprovalforall",
    "increaseallowance",
    "permit",
}


class PolicyViolation(RuntimeError):
    """Raised when a proposed live execution violates policy."""


@dataclass(frozen=True)
class ExecutionPolicy:
    live_execution: bool
    allowed_networks: set[str]
    allowed_contracts: set[str]
    allowed_functions: set[str]
    max_tx_eth: Decimal
    max_daily_spend_eth: Decimal
    allow_approvals: bool
    mainnet_confirmed: bool


def _bool_env(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _csv_env(name: str, default: str = "") -> set[str]:
    raw = os.getenv(name, default)
    return {item.strip().lower() for item in raw.split(",") if item.strip()}


def _decimal_env(name: str, default: str) -> Decimal:
    raw = os.getenv(name, default).strip()
    try:
        return Decimal(raw)
    except (InvalidOperation, AttributeError) as e:
        raise PolicyViolation(f"{name} must be a decimal value") from e


def get_policy() -> ExecutionPolicy:
    """Load the current KeeperHub execution policy from environment variables."""
    return ExecutionPolicy(
        live_execution=_bool_env("KEEPERHUB_LIVE_EXECUTION", False),
        allowed_networks=_csv_env("KEEPERHUB_ALLOWED_NETWORKS", "sepolia"),
        allowed_contracts=_csv_env("KEEPERHUB_ALLOWED_CONTRACTS"),
        allowed_functions=_csv_env("KEEPERHUB_ALLOWED_FUNCTIONS"),
        max_tx_eth=_decimal_env("KEEPERHUB_MAX_TX_ETH", "0.001"),
        max_daily_spend_eth=_decimal_env("KEEPERHUB_MAX_DAILY_SPEND_ETH", "0.005"),
        allow_approvals=_bool_env("KEEPERHUB_ALLOW_APPROVALS", False),
        mainnet_confirmed=_bool_env("KEEPERHUB_MAINNET_CONFIRMED", False),
    )


def policy_from_organism(record: dict) -> ExecutionPolicy:
    """Build an ExecutionPolicy from an organism_policy database record."""
    def as_set(value) -> set[str]:
        if value is None:
            return set()
        if isinstance(value, (list, tuple, set)):
            return {str(v).strip().lower() for v in value if str(v).strip()}
        return {item.strip().lower() for item in str(value).split(",") if item.strip()}

    def as_decimal(name: str, default: str) -> Decimal:
        try:
            return Decimal(str(record.get(name) or default))
        except InvalidOperation as e:
            raise PolicyViolation(f"{name} must be a decimal value") from e

    return ExecutionPolicy(
        live_execution=bool(record.get("live_execution")),
        allowed_networks=as_set(record.get("allowed_networks") or {"sepolia"}),
        allowed_contracts=as_set(record.get("allowed_contracts")),
        allowed_functions=as_set(record.get("allowed_functions")),
        max_tx_eth=as_decimal("max_tx_eth", "0.001"),
        max_daily_spend_eth=as_decimal("max_daily_spend_eth", "0.005"),
        allow_approvals=bool(record.get("allow_approvals")),
        mainnet_confirmed=bool(record.get("mainnet_confirmed")),
    )


def _normalise_address(value: str | None) -> str:
    return str(value or "").strip().lower()


def _normalise_network(network: str) -> str:
    return str(network or "").strip().lower()


def _parse_amount_eth(amount: str | int | float | Decimal | None) -> Decimal:
    if amount is None or amount == "":
        return Decimal("0")
    try:
        return Decimal(str(amount))
    except InvalidOperation as e:
        raise PolicyViolation("amount must be a decimal ETH value") from e


def _parse_wei_as_eth(value: str | int | None) -> Decimal:
    if value is None or value == "":
        return Decimal("0")
    try:
        return Decimal(str(value)) / Decimal("1000000000000000000")
    except InvalidOperation as e:
        raise PolicyViolation("value must be an integer wei value") from e


def _spend_file(organism_id: str | None = None) -> Path:
    state_dir = Path(os.getenv("STATE_DIR", "./state"))
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    suffix = organism_id or "global"
    safe_suffix = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in suffix)
    return state_dir / f"keeperhub_spend_{safe_suffix}_{day}.json"


def _read_reserved_spend(organism_id: str | None = None) -> Decimal:
    path = _spend_file(organism_id)
    if not path.exists():
        return Decimal("0")
    try:
        data = json.loads(path.read_text())
        return Decimal(str(data.get("reserved_eth", "0")))
    except Exception as e:
        raise PolicyViolation(f"could not read daily spend ledger: {e}") from e


def _reserve_spend(
    amount_eth: Decimal,
    policy: ExecutionPolicy,
    reason: str,
    organism_id: str | None = None,
) -> None:
    if amount_eth <= 0:
        return
    current = _read_reserved_spend(organism_id)
    next_total = current + amount_eth
    if next_total > policy.max_daily_spend_eth:
        raise PolicyViolation(
            f"daily spend {next_total} ETH would exceed cap {policy.max_daily_spend_eth} ETH"
        )
    path = _spend_file(organism_id)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({
            "reserved_eth": str(next_total),
            "last_amount_eth": str(amount_eth),
            "last_reason": reason,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, indent=2))
    except Exception as e:
        raise PolicyViolation(f"could not write daily spend ledger: {e}") from e


def _check_common(policy: ExecutionPolicy, network: str) -> str:
    normalised = _normalise_network(network)
    if not policy.live_execution:
        raise PolicyViolation("KEEPERHUB_LIVE_EXECUTION is false")
    if normalised not in policy.allowed_networks:
        allowed = ", ".join(sorted(policy.allowed_networks)) or "none"
        raise PolicyViolation(f"network '{network}' is not allowed; allowed: {allowed}")
    if normalised in MAINNET_NETWORKS and not policy.mainnet_confirmed:
        raise PolicyViolation("mainnet/L2 execution requires KEEPERHUB_MAINNET_CONFIRMED=true")
    return normalised


def validate_transfer(
    network: str,
    recipient_address: str,
    amount: str,
    token_address: str | None = None,
) -> dict:
    """
    Validate a direct KeeperHub transfer before it can reach KeeperHub.

    Native-token transfers are capped by KEEPERHUB_MAX_TX_ETH. ERC-20 transfers
    are allowed only when token_address is set; amount-unit risk must be handled
    by the caller's token-specific policy before enabling live mode.
    """
    return validate_transfer_with_policy(
        get_policy(),
        network=network,
        recipient_address=recipient_address,
        amount=amount,
        token_address=token_address,
    )


def validate_transfer_with_policy(
    policy: ExecutionPolicy,
    network: str,
    recipient_address: str,
    amount: str,
    token_address: str | None = None,
    organism_id: str | None = None,
) -> dict:
    """Validate a direct transfer against an explicit organism policy."""
    normalised_network = _check_common(policy, network)
    if not _normalise_address(recipient_address).startswith("0x"):
        raise PolicyViolation("recipient_address must be a 0x address")

    native_amount = Decimal("0")
    if not token_address:
        native_amount = _parse_amount_eth(amount)
        if native_amount > policy.max_tx_eth:
            raise PolicyViolation(f"transfer amount {native_amount} ETH exceeds max {policy.max_tx_eth} ETH")
        _reserve_spend(native_amount, policy, "transfer", organism_id=organism_id)

    return {
        "action": "transfer",
        "network": normalised_network,
        "recipient_address": recipient_address,
        "amount": str(amount),
        "token_address": token_address,
        "native_value_eth": str(native_amount),
        "max_tx_eth": str(policy.max_tx_eth),
    }


def validate_contract_call(
    network: str,
    contract_address: str,
    function_name: str,
    value_wei: str | int | None = None,
) -> dict:
    """Validate a KeeperHub contract call before it can reach KeeperHub."""
    return validate_contract_call_with_policy(
        get_policy(),
        network=network,
        contract_address=contract_address,
        function_name=function_name,
        value_wei=value_wei,
    )


def validate_contract_call_with_policy(
    policy: ExecutionPolicy,
    network: str,
    contract_address: str,
    function_name: str,
    value_wei: str | int | None = None,
    organism_id: str | None = None,
) -> dict:
    """Validate a KeeperHub contract call against an explicit organism policy."""
    normalised_network = _check_common(policy, network)
    contract = _normalise_address(contract_address)
    function = str(function_name or "").strip()
    function_key = function.lower()

    if not contract.startswith("0x"):
        raise PolicyViolation("contract_address must be a 0x address")
    if policy.allowed_contracts and contract not in policy.allowed_contracts:
        raise PolicyViolation("contract_address is not in KEEPERHUB_ALLOWED_CONTRACTS")
    if policy.allowed_functions and function_key not in policy.allowed_functions:
        raise PolicyViolation("function_name is not in KEEPERHUB_ALLOWED_FUNCTIONS")
    if function_key in DANGEROUS_APPROVAL_FUNCTIONS and not policy.allow_approvals:
        raise PolicyViolation(f"{function} is blocked unless KEEPERHUB_ALLOW_APPROVALS=true")

    value_eth = _parse_wei_as_eth(value_wei)
    if value_eth > policy.max_tx_eth:
        raise PolicyViolation(f"call value {value_eth} ETH exceeds max {policy.max_tx_eth} ETH")
    _reserve_spend(value_eth, policy, "contract_call", organism_id=organism_id)

    return {
        "action": "contract_call",
        "network": normalised_network,
        "contract_address": contract_address,
        "function_name": function,
        "value_eth": str(value_eth),
        "max_tx_eth": str(policy.max_tx_eth),
    }
