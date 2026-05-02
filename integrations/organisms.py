"""
Organism ownership, funding, and policy state helpers.

This module is the backend binding layer between a signed owner wallet and the
per-organism execution wallet/policy that agents are allowed to use.
"""

import json
import os
import secrets
from datetime import datetime, timezone
from decimal import Decimal

from integrations.state_writer import DEFAULT_ORGANISM_ID, _get_conn
from integrations.wallet import get_native_balance
from integrations.execution_policy import ExecutionPolicy, get_policy, policy_from_organism


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _json_list(value, default=None) -> str:
    if value is None:
        value = default or []
    if isinstance(value, str):
        return value
    return json.dumps(list(value))


def _decode_json_list(value) -> list:
    if not value:
        return []
    try:
        data = json.loads(value)
        return data if isinstance(data, list) else []
    except Exception:
        return [v.strip() for v in str(value).split(",") if v.strip()]


def _row_to_organism(row) -> dict | None:
    if not row:
        return None
    data = dict(row)
    data["domains"] = _decode_json_list(data.get("domains"))
    return data


def _row_to_policy(row) -> dict | None:
    if not row:
        return None
    data = dict(row)
    data["live_execution"] = bool(data.get("live_execution"))
    data["allow_approvals"] = bool(data.get("allow_approvals"))
    data["mainnet_confirmed"] = bool(data.get("mainnet_confirmed"))
    data["allowed_networks"] = _decode_json_list(data.get("allowed_networks") or "sepolia")
    data["allowed_contracts"] = _decode_json_list(data.get("allowed_contracts"))
    data["allowed_functions"] = _decode_json_list(data.get("allowed_functions"))
    return data


def _row_to_dict(row) -> dict | None:
    return dict(row) if row else None


def list_organisms(owner_wallet: str | None = None) -> list[dict]:
    conn = _get_conn()
    if owner_wallet:
        rows = conn.execute(
            "SELECT * FROM organisms WHERE lower(owner_wallet) = ? ORDER BY created_at DESC",
            (owner_wallet.lower(),),
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM organisms ORDER BY created_at DESC").fetchall()
    conn.close()
    return [_row_to_organism(r) for r in rows]


def get_organism(organism_id: str) -> dict | None:
    conn = _get_conn()
    row = conn.execute(
        "SELECT * FROM organisms WHERE organism_id = ?",
        (organism_id,),
    ).fetchone()
    conn.close()
    return _row_to_organism(row)


def get_organism_policy(organism_id: str) -> dict | None:
    conn = _get_conn()
    row = conn.execute(
        "SELECT * FROM organism_policy WHERE organism_id = ?",
        (organism_id,),
    ).fetchone()
    conn.close()
    return _row_to_policy(row)


def get_effective_execution_policy(organism_id: str) -> ExecutionPolicy:
    """
    Combine global env policy with organism policy.

    The global env remains the operator-level arming switch; organism policy is
    the owner-specific allowlist and spend cap.
    """
    organism_policy = get_organism_policy(organism_id)
    if not organism_policy:
        raise ValueError("organism policy not found")
    global_policy = get_policy()
    org_policy = policy_from_organism(organism_policy)
    allowed_networks = global_policy.allowed_networks.intersection(org_policy.allowed_networks)
    allowed_contracts = (
        global_policy.allowed_contracts.intersection(org_policy.allowed_contracts)
        if global_policy.allowed_contracts and org_policy.allowed_contracts
        else global_policy.allowed_contracts or org_policy.allowed_contracts
    )
    allowed_functions = (
        global_policy.allowed_functions.intersection(org_policy.allowed_functions)
        if global_policy.allowed_functions and org_policy.allowed_functions
        else global_policy.allowed_functions or org_policy.allowed_functions
    )
    return ExecutionPolicy(
        live_execution=global_policy.live_execution and org_policy.live_execution,
        allowed_networks=allowed_networks,
        allowed_contracts=allowed_contracts,
        allowed_functions=allowed_functions,
        max_tx_eth=min(global_policy.max_tx_eth, org_policy.max_tx_eth),
        max_daily_spend_eth=min(global_policy.max_daily_spend_eth, org_policy.max_daily_spend_eth),
        allow_approvals=global_policy.allow_approvals and org_policy.allow_approvals,
        mainnet_confirmed=global_policy.mainnet_confirmed and org_policy.mainnet_confirmed,
    )


def get_organism_funding(organism_id: str) -> list[dict]:
    conn = _get_conn()
    rows = conn.execute(
        """SELECT * FROM organism_funding
           WHERE organism_id = ?
           ORDER BY created_at DESC, id DESC""",
        (organism_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def _assign_keeperhub_wallet(conn, organism_id: str, network: str) -> dict | None:
    row = conn.execute(
        """SELECT * FROM keeperhub_wallet_pool
           WHERE status = 'available' AND network = ?
           ORDER BY created_at ASC LIMIT 1""",
        (network,),
    ).fetchone()
    if not row:
        return None

    now = _now()
    conn.execute(
        """UPDATE keeperhub_wallet_pool
           SET status = 'assigned', assigned_organism_id = ?, updated_at = ?
           WHERE wallet_address = ?""",
        (organism_id, now, row["wallet_address"]),
    )
    return dict(row)


def create_organism(owner_wallet: str, owner_chain_id: int | None, payload: dict) -> dict:
    organism_id = f"org_{secrets.token_urlsafe(10).replace('-', '').replace('_', '').lower()}"
    network = (payload.get("network") or "sepolia").lower()
    now = _now()

    conn = _get_conn()
    wallet = _assign_keeperhub_wallet(conn, organism_id, network)
    wallet_address = wallet["wallet_address"] if wallet else None
    wallet_label = wallet["wallet_label"] if wallet else None
    status = "needs_funding" if wallet_address else "needs_execution_wallet"

    conn.execute(
        """INSERT INTO organisms
           (organism_id, owner_wallet, owner_chain_id, status, name, risk_profile,
            max_child_agents, domains, treasury_target_amount, treasury_asset,
            keeperhub_wallet_address, keeperhub_wallet_label, og_wallet_mode,
            created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            organism_id,
            owner_wallet.lower(),
            owner_chain_id,
            status,
            payload.get("name") or "MiliGents Organism",
            payload.get("risk_profile") or "balanced",
            int(payload.get("max_child_agents") or 3),
            _json_list(payload.get("domains"), default=["DeFi Trading", "Data Services"]),
            str(payload.get("treasury_target_amount") or "0"),
            payload.get("treasury_asset") or "ETH",
            wallet_address,
            wallet_label,
            "platform",
            now,
            now,
        ),
    )
    conn.execute(
        """INSERT INTO organism_policy
           (organism_id, live_execution, allowed_networks, allowed_contracts,
            allowed_functions, max_tx_eth, max_daily_spend_eth, allow_approvals,
            mainnet_confirmed, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            organism_id,
            0,
            _json_list(payload.get("allowed_networks"), default=[network]),
            _json_list(payload.get("allowed_contracts")),
            _json_list(payload.get("allowed_functions")),
            str(payload.get("max_tx_eth") or os.getenv("KEEPERHUB_MAX_TX_ETH", "0.001")),
            str(payload.get("max_daily_spend_eth") or os.getenv("KEEPERHUB_MAX_DAILY_SPEND_ETH", "0.005")),
            0,
            0,
            now,
            now,
        ),
    )
    conn.execute(
        """INSERT INTO organism_funding
           (organism_id, network, asset, deposit_address, expected_amount,
            received_amount, funding_tx, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            organism_id,
            network,
            payload.get("treasury_asset") or "ETH",
            wallet_address or "",
            str(payload.get("treasury_target_amount") or "0"),
            "0",
            None,
            "pending" if wallet_address else "needs_execution_wallet",
            now,
            now,
        ),
    )
    conn.commit()
    conn.close()
    return get_organism_bundle(organism_id)


def get_organism_bundle(organism_id: str) -> dict | None:
    organism = get_organism(organism_id)
    if not organism:
        return None
    return {
        "organism": organism,
        "policy": get_organism_policy(organism_id),
        "funding": get_organism_funding(organism_id),
    }


def check_funding(organism_id: str) -> dict:
    conn = _get_conn()
    row = conn.execute(
        """SELECT * FROM organism_funding
           WHERE organism_id = ?
           ORDER BY created_at DESC, id DESC LIMIT 1""",
        (organism_id,),
    ).fetchone()
    if not row:
        conn.close()
        raise ValueError("funding record not found")
    if not row["deposit_address"]:
        conn.close()
        raise ValueError("organism has no execution wallet deposit address")

    received = get_native_balance(row["deposit_address"], row["network"])
    expected = Decimal(str(row["expected_amount"] or "0"))
    received_dec = Decimal(str(received))
    status = "funded" if received_dec >= expected and received_dec > 0 else "pending"
    now = _now()
    conn.execute(
        """UPDATE organism_funding
           SET received_amount = ?, status = ?, updated_at = ?
           WHERE id = ?""",
        (received, status, now, row["id"]),
    )
    if status == "funded":
        conn.execute(
            """UPDATE organisms
               SET status = CASE
                   WHEN status IN ('needs_funding', 'created') THEN 'funded'
                   ELSE status
               END,
               updated_at = ?
               WHERE organism_id = ?""",
            (now, organism_id),
        )
    conn.commit()
    conn.close()
    return get_organism_bundle(organism_id)


def record_funding_tx(organism_id: str, tx_hash: str, network: str | None = None) -> dict:
    tx_hash = (tx_hash or "").strip()
    if not tx_hash.startswith("0x") or len(tx_hash) < 20:
        raise ValueError("valid funding tx hash is required")
    conn = _get_conn()
    row = conn.execute(
        """SELECT * FROM organism_funding
           WHERE organism_id = ?
           ORDER BY created_at DESC, id DESC LIMIT 1""",
        (organism_id,),
    ).fetchone()
    if not row:
        conn.close()
        raise ValueError("funding record not found")
    conn.execute(
        """UPDATE organism_funding
           SET funding_tx = ?, network = COALESCE(?, network), status = 'submitted', updated_at = ?
           WHERE id = ?""",
        (tx_hash, network, _now(), row["id"]),
    )
    conn.commit()
    conn.close()
    return get_organism_bundle(organism_id)


def assert_owner(organism_id: str, owner_wallet: str) -> dict:
    organism = get_organism(organism_id)
    if not organism:
        raise ValueError("organism not found")
    if organism["owner_wallet"].lower() != owner_wallet.lower():
        raise PermissionError("organism does not belong to session owner")
    return organism


def update_organism_status(organism_id: str, status: str) -> dict:
    now = _now()
    conn = _get_conn()
    conn.execute(
        "UPDATE organisms SET status = ?, updated_at = ? WHERE organism_id = ?",
        (status, now, organism_id),
    )
    conn.commit()
    conn.close()
    return get_organism_bundle(organism_id)


def patch_policy(organism_id: str, patch: dict) -> dict:
    allowed = {
        "live_execution",
        "allowed_networks",
        "allowed_contracts",
        "allowed_functions",
        "max_tx_eth",
        "max_daily_spend_eth",
        "allow_approvals",
        "mainnet_confirmed",
    }
    fields = []
    values = []
    for key, value in patch.items():
        if key not in allowed or value is None:
            continue
        if key in {"allowed_networks", "allowed_contracts", "allowed_functions"}:
            value = _json_list(value)
        elif key in {"live_execution", "allow_approvals", "mainnet_confirmed"}:
            value = 1 if bool(value) else 0
        elif key in {"max_tx_eth", "max_daily_spend_eth"}:
            if Decimal(str(value)) < 0:
                raise ValueError(f"{key} cannot be negative")
            value = str(value)
        fields.append(f"{key} = ?")
        values.append(value)

    if not fields:
        return get_organism_policy(organism_id)

    fields.append("updated_at = ?")
    values.append(_now())
    values.append(organism_id)
    conn = _get_conn()
    conn.execute(
        f"UPDATE organism_policy SET {', '.join(fields)} WHERE organism_id = ?",
        values,
    )
    conn.commit()
    conn.close()
    return get_organism_policy(organism_id)


def get_default_organism_id() -> str:
    return DEFAULT_ORGANISM_ID
