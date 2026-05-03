#!/usr/bin/env python3
"""
Seed a dedicated KeeperHub execution wallet into the organism wallet pool.

Usage:
    python3 scripts/seed_keeperhub_wallet_pool.py \
      --network sepolia \
      --wallet 0x1234... \
      --label judge-sepolia-1
"""

import argparse
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from integrations.state_writer import _get_conn

ADDRESS_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--network", required=True, help="sepolia, base, ethereum, or 0g network label")
    parser.add_argument("--wallet", required=True, help="KeeperHub execution wallet deposit address")
    parser.add_argument("--label", default=None, help="Operator-readable wallet label")
    parser.add_argument("--disable", action="store_true", help="Insert/update as disabled instead of available")
    args = parser.parse_args()

    network = args.network.strip().lower()
    wallet = args.wallet.strip().lower()
    if not ADDRESS_RE.match(wallet):
        raise SystemExit("wallet must be a 0x EVM address")

    label = args.label or f"{network}-{wallet[-6:]}"
    status = "disabled" if args.disable else "available"
    now = datetime.now(timezone.utc).isoformat()

    conn = _get_conn()
    conn.execute(
        """INSERT INTO keeperhub_wallet_pool
           (wallet_address, wallet_label, network, status, assigned_organism_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, NULL, ?, ?)
           ON CONFLICT(wallet_address) DO UPDATE SET
             wallet_label = excluded.wallet_label,
             network = excluded.network,
             status = CASE
               WHEN keeperhub_wallet_pool.assigned_organism_id IS NULL THEN excluded.status
               ELSE keeperhub_wallet_pool.status
             END,
             updated_at = excluded.updated_at""",
        (wallet, label, network, status, now, now),
    )
    row = conn.execute(
        "SELECT wallet_address, wallet_label, network, status, assigned_organism_id FROM keeperhub_wallet_pool WHERE wallet_address = ?",
        (wallet,),
    ).fetchone()
    conn.commit()
    conn.close()

    print(dict(row))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
