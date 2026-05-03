#!/usr/bin/env python3
"""
Verify the deploy-organism state foundation without requiring Docker.

This checks:
- organism tables exist
- existing live tables have organism_id
- local-default organism exists
- context-aware writes attach organism_id to activity/cycles
"""

import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="miligents-organism-") as tmp:
        os.environ["STATE_DIR"] = tmp

        from integrations.state_writer import (
            DEFAULT_ORGANISM_ID,
            _get_conn,
            set_current_cycle,
            set_current_organism,
            write_activity,
            write_cycle_complete,
            write_cycle_start,
            write_keeperhub_task,
            write_organism_execution,
            write_storage_record,
        )

        conn = _get_conn()
        tables = {
            row["name"]
            for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        required_tables = {
            "organisms",
            "organism_policy",
            "organism_funding",
            "organism_execution",
            "keeperhub_wallet_pool",
            "auth_nonces",
            "auth_sessions",
        }
        missing = sorted(required_tables - tables)
        if missing:
            raise AssertionError(f"missing tables: {missing}")

        live_tables = [
            "agents",
            "axl_messages",
            "storage_records",
            "keeperhub_tasks",
            "infts",
            "treasury_snapshots",
            "cycles",
            "activity",
        ]
        for table in live_tables:
            cols = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
            if "organism_id" not in cols:
                raise AssertionError(f"{table} missing organism_id")

        default_org = conn.execute(
            "SELECT organism_id, status FROM organisms WHERE organism_id = ?",
            (DEFAULT_ORGANISM_ID,),
        ).fetchone()
        if not default_org:
            raise AssertionError("local-default organism missing")

        set_current_organism("org_verify")
        set_current_cycle("cycle_verify")
        write_cycle_start("cycle_verify")
        write_activity("scheduler", "cycle", "started")
        write_storage_record("specialist", "verify.json", "0x" + "1" * 64)
        write_keeperhub_task("execution", task_type="verify", status="running")
        write_organism_execution(
            organism_id="org_verify",
            agent_id="execution",
            network="sepolia",
            action_type="direct_transfer",
            execution_id="exec_verify",
            status="running",
            amount_eth="0.00001",
        )
        write_cycle_complete("cycle_verify")

        conn = _get_conn()
        for table in ["activity", "storage_records", "keeperhub_tasks", "organism_execution", "cycles"]:
            row = conn.execute(
                f"SELECT organism_id FROM {table} ORDER BY rowid DESC LIMIT 1"
            ).fetchone()
            if row["organism_id"] != "org_verify":
                raise AssertionError(f"{table} context mismatch: {row['organism_id']}")

        conn.execute(
            """INSERT INTO keeperhub_wallet_pool
               (wallet_address, wallet_label, network, status, assigned_organism_id, created_at, updated_at)
               VALUES (?, ?, 'sepolia', 'available', NULL, datetime('now'), datetime('now'))""",
            ("0x" + "2" * 40, "verify-wallet"),
        )
        wallet = conn.execute(
            "SELECT status FROM keeperhub_wallet_pool WHERE wallet_address = ?",
            ("0x" + "2" * 40,),
        ).fetchone()
        if wallet["status"] != "available":
            raise AssertionError("keeperhub wallet pool seed failed")
        conn.close()

        state_db = Path(tmp) / "state.db"
        if not state_db.exists():
            raise AssertionError("state db was not created")

    print("Deploy organism verification: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
