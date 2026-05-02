"""
integrations/state_writer.py

Shared SQLite state writer for all MiliGents agents.
Every agent imports this and calls these functions to persist
their state to a shared state.db file so the API server
can read and expose real data to the frontend.

DB file location: /app/state/state.db (Docker shared volume)
Falls back to: ./state/state.db (local development)
"""

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

# State DB path — shared Docker volume in production, local in dev
STATE_DIR = os.getenv("STATE_DIR", "./state")
DB_PATH = os.path.join(STATE_DIR, "state.db")
DEFAULT_ORGANISM_ID = os.getenv("DEFAULT_ORGANISM_ID", "local-default")


def _get_conn() -> sqlite3.Connection:
    """Open connection to state DB, creating it and schema if needed."""
    Path(STATE_DIR).mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    _ensure_schema(conn)
    return conn


def _ensure_schema(conn: sqlite3.Connection) -> None:
    """Create all tables if they do not exist."""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS organisms (
            organism_id              TEXT PRIMARY KEY,
            owner_wallet             TEXT NOT NULL,
            owner_chain_id           INTEGER,
            status                   TEXT NOT NULL DEFAULT 'created',
            name                     TEXT,
            risk_profile             TEXT NOT NULL DEFAULT 'balanced',
            max_child_agents         INTEGER NOT NULL DEFAULT 3,
            domains                  TEXT,
            treasury_target_amount   TEXT,
            treasury_asset           TEXT,
            keeperhub_wallet_address TEXT,
            keeperhub_wallet_label   TEXT,
            og_wallet_mode           TEXT NOT NULL DEFAULT 'platform',
            created_at               TEXT NOT NULL,
            updated_at               TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS organisms_owner_idx
            ON organisms(owner_wallet);

        CREATE TABLE IF NOT EXISTS organism_policy (
            organism_id             TEXT PRIMARY KEY,
            live_execution          INTEGER NOT NULL DEFAULT 0,
            allowed_networks        TEXT NOT NULL DEFAULT 'sepolia',
            allowed_contracts       TEXT,
            allowed_functions       TEXT,
            max_tx_eth              TEXT NOT NULL DEFAULT '0.001',
            max_daily_spend_eth     TEXT NOT NULL DEFAULT '0.005',
            allow_approvals         INTEGER NOT NULL DEFAULT 0,
            mainnet_confirmed       INTEGER NOT NULL DEFAULT 0,
            created_at              TEXT NOT NULL,
            updated_at              TEXT NOT NULL,
            FOREIGN KEY (organism_id) REFERENCES organisms(organism_id)
        );

        CREATE TABLE IF NOT EXISTS organism_funding (
            id                 INTEGER PRIMARY KEY AUTOINCREMENT,
            organism_id         TEXT NOT NULL,
            network             TEXT NOT NULL,
            asset               TEXT NOT NULL,
            deposit_address     TEXT NOT NULL,
            expected_amount     TEXT,
            received_amount     TEXT,
            funding_tx          TEXT,
            status              TEXT NOT NULL DEFAULT 'pending',
            created_at          TEXT NOT NULL,
            updated_at          TEXT NOT NULL,
            FOREIGN KEY (organism_id) REFERENCES organisms(organism_id)
        );
        CREATE INDEX IF NOT EXISTS organism_funding_org_idx
            ON organism_funding(organism_id);

        CREATE TABLE IF NOT EXISTS organism_execution (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            organism_id      TEXT NOT NULL,
            agent_id         TEXT NOT NULL,
            network          TEXT,
            action_type      TEXT,
            execution_id     TEXT,
            tx_hash          TEXT,
            status           TEXT,
            amount_eth       TEXT,
            details          TEXT,
            timestamp        TEXT NOT NULL,
            FOREIGN KEY (organism_id) REFERENCES organisms(organism_id)
        );
        CREATE INDEX IF NOT EXISTS organism_execution_org_ts
            ON organism_execution(organism_id, timestamp DESC);

        CREATE TABLE IF NOT EXISTS keeperhub_wallet_pool (
            wallet_address        TEXT PRIMARY KEY,
            wallet_label          TEXT,
            network               TEXT NOT NULL,
            status                TEXT NOT NULL DEFAULT 'available',
            assigned_organism_id  TEXT,
            created_at            TEXT NOT NULL,
            updated_at            TEXT NOT NULL,
            FOREIGN KEY (assigned_organism_id) REFERENCES organisms(organism_id)
        );
        CREATE INDEX IF NOT EXISTS keeperhub_wallet_pool_status_idx
            ON keeperhub_wallet_pool(status, network);

        CREATE TABLE IF NOT EXISTS auth_nonces (
            nonce          TEXT PRIMARY KEY,
            address        TEXT NOT NULL,
            chain_id       INTEGER,
            message        TEXT NOT NULL,
            issued_at      TEXT NOT NULL,
            expires_at     TEXT NOT NULL,
            consumed_at    TEXT
        );
        CREATE INDEX IF NOT EXISTS auth_nonces_address_idx
            ON auth_nonces(address, issued_at DESC);

        CREATE TABLE IF NOT EXISTS auth_sessions (
            session_token  TEXT PRIMARY KEY,
            owner_wallet   TEXT NOT NULL,
            chain_id       INTEGER,
            created_at     TEXT NOT NULL,
            expires_at     TEXT NOT NULL,
            revoked_at     TEXT
        );
        CREATE INDEX IF NOT EXISTS auth_sessions_owner_idx
            ON auth_sessions(owner_wallet, created_at DESC);

        CREATE TABLE IF NOT EXISTS agents (
            agent_id      TEXT PRIMARY KEY,
            status        TEXT NOT NULL DEFAULT 'idle',
            current_task  TEXT,
            started_at    TEXT,
            updated_at    TEXT,
            spawned_count INTEGER DEFAULT 0,
            result        TEXT
        );

        CREATE TABLE IF NOT EXISTS axl_messages (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            from_agent    TEXT NOT NULL,
            to_agent      TEXT NOT NULL,
            msg_type      TEXT NOT NULL,
            payload       TEXT,
            timestamp     TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS storage_records (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id      TEXT NOT NULL,
            filename      TEXT NOT NULL,
            root_hash     TEXT NOT NULL,
            timestamp     TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS keeperhub_tasks (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id      TEXT NOT NULL,
            workflow_id   TEXT,
            execution_id  TEXT,
            task_type     TEXT,
            status        TEXT,
            tx_hash       TEXT,
            timestamp     TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS infts (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id      TEXT NOT NULL,
            token_id      TEXT NOT NULL,
            root_hash     TEXT NOT NULL,
            strategy_name TEXT,
            version       INTEGER DEFAULT 1,
            mint_tx       TEXT,
            minted_at     TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS treasury_snapshots (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            eth_balance   TEXT NOT NULL,
            usd_value     TEXT,
            timestamp     TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS cycles (
            id                 INTEGER PRIMARY KEY AUTOINCREMENT,
            cycle_id           TEXT UNIQUE NOT NULL,
            started_at         TEXT NOT NULL,
            completed_at       TEXT,
            status             TEXT NOT NULL DEFAULT 'running',
            originator_status  TEXT,
            specialist_status  TEXT,
            execution_status   TEXT
        );

        CREATE TABLE IF NOT EXISTS activity (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id    TEXT NOT NULL,
            kind        TEXT NOT NULL,
            summary     TEXT NOT NULL,
            details     TEXT,
            cycle_id    TEXT,
            timestamp   TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS activity_agent_ts
            ON activity(agent_id, timestamp DESC);
        CREATE INDEX IF NOT EXISTS activity_ts
            ON activity(timestamp DESC);
    """)
    _ensure_organism_columns(conn)
    _ensure_default_organism(conn)
    conn.commit()


def _table_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}


def _ensure_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    if column not in _table_columns(conn, table):
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def _ensure_organism_columns(conn: sqlite3.Connection) -> None:
    """Backfill organism_id onto existing tables without breaking old queries."""
    organism_tables = [
        "agents",
        "axl_messages",
        "storage_records",
        "keeperhub_tasks",
        "infts",
        "treasury_snapshots",
        "cycles",
        "activity",
    ]
    for table in organism_tables:
        _ensure_column(conn, table, "organism_id", "TEXT")
        conn.execute(
            f"UPDATE {table} SET organism_id = ? WHERE organism_id IS NULL",
            (DEFAULT_ORGANISM_ID,),
        )

    conn.executescript("""
        CREATE INDEX IF NOT EXISTS agents_organism_idx
            ON agents(organism_id);
        CREATE INDEX IF NOT EXISTS axl_messages_organism_ts
            ON axl_messages(organism_id, timestamp DESC);
        CREATE INDEX IF NOT EXISTS storage_records_organism_ts
            ON storage_records(organism_id, timestamp DESC);
        CREATE INDEX IF NOT EXISTS keeperhub_tasks_organism_ts
            ON keeperhub_tasks(organism_id, timestamp DESC);
        CREATE INDEX IF NOT EXISTS infts_organism_ts
            ON infts(organism_id, minted_at DESC);
        CREATE INDEX IF NOT EXISTS treasury_snapshots_organism_ts
            ON treasury_snapshots(organism_id, timestamp DESC);
        CREATE INDEX IF NOT EXISTS cycles_organism_ts
            ON cycles(organism_id, started_at DESC);
        CREATE INDEX IF NOT EXISTS activity_organism_ts
            ON activity(organism_id, timestamp DESC);
    """)


def _ensure_default_organism(conn: sqlite3.Connection) -> None:
    now = _now()
    owner_wallet = os.getenv("WALLET_ADDRESS") or "local-default-owner"
    conn.execute(
        """INSERT OR IGNORE INTO organisms
           (organism_id, owner_wallet, owner_chain_id, status, name, risk_profile,
            max_child_agents, domains, treasury_target_amount, treasury_asset,
            keeperhub_wallet_address, keeperhub_wallet_label, og_wallet_mode,
            created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            DEFAULT_ORGANISM_ID,
            owner_wallet,
            None,
            "active",
            "Local Default Organism",
            "balanced",
            3,
            json.dumps(["Agentic Trading", "Data Services"]),
            None,
            "ETH",
            os.getenv("KEEPERHUB_WALLET_ADDRESS") or os.getenv("WALLET_ADDRESS"),
            "local-default",
            "platform",
            now,
            now,
        ),
    )
    conn.execute(
        """INSERT OR IGNORE INTO organism_policy
           (organism_id, live_execution, allowed_networks, allowed_contracts,
            allowed_functions, max_tx_eth, max_daily_spend_eth, allow_approvals,
            mainnet_confirmed, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            DEFAULT_ORGANISM_ID,
            0,
            os.getenv("KEEPERHUB_ALLOWED_NETWORKS", "sepolia"),
            os.getenv("KEEPERHUB_ALLOWED_CONTRACTS"),
            os.getenv("KEEPERHUB_ALLOWED_FUNCTIONS"),
            os.getenv("KEEPERHUB_MAX_TX_ETH", "0.001"),
            os.getenv("KEEPERHUB_MAX_DAILY_SPEND_ETH", "0.005"),
            1 if os.getenv("KEEPERHUB_ALLOW_APPROVALS", "false").lower() == "true" else 0,
            1 if os.getenv("KEEPERHUB_MAINNET_CONFIRMED", "false").lower() == "true" else 0,
            now,
            now,
        ),
    )


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ─── Agent Status ─────────────────────────────────────────────────────────────

def write_agent_status(
    agent_id: str,
    status: str,
    current_task: str = None,
    spawned_count: int = None,
    result: str = None
) -> None:
    """
    Write or update an agent's current status.

    Args:
        agent_id: One of 'originator', 'specialist', 'execution'.
        status: 'idle' | 'running' | 'complete' | 'error'
        current_task: Human-readable description of current task.
        spawned_count: Number of child agents spawned (Originator only).
        result: Final result string (truncated to 500 chars).
    """
    try:
        conn = _get_conn()
        now = _now()
        existing = conn.execute(
            "SELECT agent_id FROM agents WHERE agent_id = ?", (agent_id,)
        ).fetchone()

        if existing:
            fields = ["status = ?", "updated_at = ?"]
            values = [status, now]
            if current_task is not None:
                fields.append("current_task = ?")
                values.append(current_task)
            if spawned_count is not None:
                fields.append("spawned_count = ?")
                values.append(spawned_count)
            if result is not None:
                fields.append("result = ?")
                values.append(result[:500])
            values.append(agent_id)
            conn.execute(
                f"UPDATE agents SET {', '.join(fields)} WHERE agent_id = ?",
                values
            )
        else:
            conn.execute(
                """INSERT INTO agents
                   (agent_id, status, current_task, started_at, updated_at, spawned_count, result)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    agent_id, status, current_task, now, now,
                    spawned_count or 0,
                    result[:500] if result else None
                )
            )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[StateWriter] write_agent_status failed: {e}")


# ─── AXL Messages ─────────────────────────────────────────────────────────────

def write_axl_message(
    from_agent: str,
    to_agent: str,
    msg_type: str,
    payload: dict
) -> None:
    """
    Record an AXL message sent or received.

    Args:
        from_agent: Sending agent name.
        to_agent: Receiving agent name.
        msg_type: 'SPAWN_SPECIALIST' | 'INSTRUCTION' | 'REPORT' | 'STATUS'
        payload: Message payload dict.
    """
    try:
        conn = _get_conn()
        conn.execute(
            """INSERT INTO axl_messages (from_agent, to_agent, msg_type, payload, timestamp)
               VALUES (?, ?, ?, ?, ?)""",
            (from_agent, to_agent, msg_type, json.dumps(payload), _now())
        )
        conn.commit()
        conn.close()
        write_activity(from_agent, "axl_send", f"sent {msg_type} to {to_agent}", {
            "to_agent": to_agent,
            "msg_type": msg_type,
        })
        write_activity(to_agent, "axl_recv", f"received {msg_type} from {from_agent}", {
            "from_agent": from_agent,
            "msg_type": msg_type,
        })
    except Exception as e:
        print(f"[StateWriter] write_axl_message failed: {e}")


# ─── Storage Records ──────────────────────────────────────────────────────────

def write_storage_record(
    agent_id: str,
    filename: str,
    root_hash: str
) -> None:
    """
    Record a 0G Storage upload.

    Args:
        agent_id: Agent that performed the upload.
        filename: Logical filename used.
        root_hash: 0G Storage root hash returned.
    """
    try:
        conn = _get_conn()
        conn.execute(
            """INSERT INTO storage_records (agent_id, filename, root_hash, timestamp)
               VALUES (?, ?, ?, ?)""",
            (agent_id, filename, root_hash, _now())
        )
        conn.commit()
        conn.close()
        root_short = root_hash[:10] + "…" if len(root_hash) > 10 else root_hash
        write_activity(agent_id, "storage", f"stored {filename} (root: {root_short})", {
            "filename": filename,
            "root_hash": root_hash,
        })
    except Exception as e:
        print(f"[StateWriter] write_storage_record failed: {e}")


# ─── KeeperHub Tasks ──────────────────────────────────────────────────────────

def write_keeperhub_task(
    agent_id: str,
    workflow_id: str = None,
    execution_id: str = None,
    task_type: str = None,
    status: str = None,
    tx_hash: str = None
) -> None:
    """
    Record a KeeperHub workflow or execution event.

    Args:
        agent_id: Agent that triggered the task.
        workflow_id: KeeperHub workflow ID.
        execution_id: KeeperHub execution ID.
        task_type: Human-readable task type description.
        status: 'pending' | 'running' | 'complete' | 'failed'
        tx_hash: On-chain transaction hash if available.
    """
    try:
        conn = _get_conn()
        conn.execute(
            """INSERT INTO keeperhub_tasks
               (agent_id, workflow_id, execution_id, task_type, status, tx_hash, timestamp)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (agent_id, workflow_id, execution_id, task_type, status, tx_hash, _now())
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[StateWriter] write_keeperhub_task failed: {e}")


# ─── iNFTs ────────────────────────────────────────────────────────────────────

def write_inft(
    agent_id: str,
    token_id: str,
    root_hash: str,
    strategy_name: str = None,
    version: int = 1,
    mint_tx: str = None
) -> None:
    """
    Record a minted iNFT.

    Args:
        agent_id: Agent that minted the iNFT.
        token_id: On-chain token ID.
        root_hash: 0G Storage root hash of the strategy.
        strategy_name: Human-readable strategy name.
        version: Strategy version number.
        mint_tx: Mint transaction hash.
    """
    try:
        conn = _get_conn()
        conn.execute(
            """INSERT INTO infts
               (agent_id, token_id, root_hash, strategy_name, version, mint_tx, minted_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (agent_id, token_id, root_hash, strategy_name, version, mint_tx, _now())
        )
        conn.commit()
        conn.close()
        name = strategy_name or "strategy"
        write_activity(agent_id, "inft_mint", f"minted v{version} of {name} (token #{token_id})", {
            "token_id": token_id,
            "root_hash": root_hash,
            "strategy_name": strategy_name,
            "version": version,
            "mint_tx": mint_tx,
        })
    except Exception as e:
        print(f"[StateWriter] write_inft failed: {e}")


# ─── Treasury ─────────────────────────────────────────────────────────────────

def write_treasury_snapshot(
    eth_balance: str,
    usd_value: str = None
) -> None:
    """
    Record a treasury balance snapshot.

    Args:
        eth_balance: ETH balance as string (in ETH, not wei).
        usd_value: USD equivalent as string.
    """
    try:
        conn = _get_conn()
        conn.execute(
            """INSERT INTO treasury_snapshots (eth_balance, usd_value, timestamp)
               VALUES (?, ?, ?)""",
            (eth_balance, usd_value, _now())
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[StateWriter] write_treasury_snapshot failed: {e}")


# ─── Activity (live feed) ─────────────────────────────────────────────────────

CURRENT_CYCLE_FILE = os.path.join(STATE_DIR, "current_cycle.txt")


def set_current_cycle(cycle_id: str) -> None:
    """Record the active cycle_id so write_activity() can attach it."""
    try:
        Path(STATE_DIR).mkdir(parents=True, exist_ok=True)
        with open(CURRENT_CYCLE_FILE, "w") as f:
            f.write(cycle_id)
    except Exception as e:
        print(f"[StateWriter] set_current_cycle failed: {e}")


def clear_current_cycle() -> None:
    """Remove the active-cycle marker. Called when a cycle finishes."""
    try:
        if os.path.exists(CURRENT_CYCLE_FILE):
            os.remove(CURRENT_CYCLE_FILE)
    except Exception as e:
        print(f"[StateWriter] clear_current_cycle failed: {e}")


def _read_current_cycle() -> str | None:
    try:
        if os.path.exists(CURRENT_CYCLE_FILE):
            with open(CURRENT_CYCLE_FILE) as f:
                v = f.read().strip()
                return v or None
    except Exception:
        pass
    return None


def write_activity(
    agent_id: str,
    kind: str,
    summary: str,
    details: dict | None = None,
    cycle_id: str | None = None,
) -> None:
    """
    Append one event to the live activity feed.

    Args:
        agent_id: 'originator' | 'specialist' | 'execution' | 'scheduler'.
        kind: One of cycle, task, tool_call, tool_result, axl_send, axl_recv,
              storage, inft_mint, error, status.
        summary: Short human-readable string. Truncated to 140 chars.
        details: Optional dict serialised to JSON for the details column.
        cycle_id: Optional cycle id; falls back to STATE_DIR/current_cycle.txt
                  if not provided.

    This function is fail-silent — activity logging must never break a cycle.
    """
    try:
        if cycle_id is None:
            cycle_id = _read_current_cycle()
        conn = _get_conn()
        conn.execute(
            """INSERT INTO activity
               (agent_id, kind, summary, details, cycle_id, timestamp)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                agent_id,
                kind,
                (summary or "")[:140],
                json.dumps(details) if details else None,
                cycle_id,
                _now(),
            ),
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[StateWriter] write_activity failed: {e}")


# ─── Scheduler Cycles ─────────────────────────────────────────────────────────

def write_cycle_start(cycle_id: str) -> None:
    """
    Record the start of a new scheduler cycle.
    Args:
        cycle_id: Unique identifier e.g. 'cycle_20260501_143000'.
    """
    try:
        conn = _get_conn()
        conn.execute(
            """INSERT OR IGNORE INTO cycles (cycle_id, started_at, status)
               VALUES (?, ?, 'running')""",
            (cycle_id, _now())
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[StateWriter] write_cycle_start failed: {e}")


def write_cycle_complete(
    cycle_id: str,
    status: str = "complete",
    originator_status: str = None,
    specialist_status: str = None,
    execution_status: str = None,
) -> None:
    """
    Update a cycle record when it finishes.
    Args:
        cycle_id: The cycle to update.
        status: 'complete' | 'error'
        originator_status: Final status of originator agent.
        specialist_status: Final status of specialist agent.
        execution_status: Final status of execution agent.
    """
    try:
        conn = _get_conn()
        conn.execute(
            """UPDATE cycles
               SET completed_at = ?,
                   status = ?,
                   originator_status = ?,
                   specialist_status = ?,
                   execution_status = ?
               WHERE cycle_id = ?""",
            (
                _now(), status,
                originator_status, specialist_status, execution_status,
                cycle_id,
            )
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[StateWriter] write_cycle_complete failed: {e}")
