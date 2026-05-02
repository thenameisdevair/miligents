"""
api/db.py

Read-only query functions for the MiliGents state database.
The API server uses these to fetch agent state, AXL messages,
KeeperHub tasks, iNFTs, and treasury data for the frontend.

DB path is read from STATE_DIR env var, same as state_writer.py.
"""

import json
import os
import sqlite3
from pathlib import Path

STATE_DIR = os.getenv("STATE_DIR", "./state")
DB_PATH = os.path.join(STATE_DIR, "state.db")


def _get_conn() -> sqlite3.Connection:
    """Open read-only connection to state DB."""
    if not Path(DB_PATH).exists():
        return None
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _row_to_dict(row) -> dict:
    return dict(row) if row else None


def _rows_to_list(rows) -> list:
    return [dict(r) for r in rows] if rows else []


# ─── Agents ───────────────────────────────────────────────────────────────────

def get_all_agents(organism_id: str = None) -> list:
    """
    Get current status of all agents.

    Returns:
        List of agent dicts with id, status, current_task,
        started_at, updated_at, spawned_count, result.
    """
    conn = _get_conn()
    if not conn:
        return []
    if organism_id:
        rows = conn.execute(
            "SELECT * FROM agents WHERE organism_id = ? ORDER BY agent_id",
            (organism_id,),
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM agents ORDER BY agent_id").fetchall()
    conn.close()
    return _rows_to_list(rows)


def get_agent(agent_id: str) -> dict:
    """
    Get status of a single agent.

    Args:
        agent_id: One of 'originator', 'specialist', 'execution'.

    Returns:
        Agent dict or None if not found.
    """
    conn = _get_conn()
    if not conn:
        return None
    row = conn.execute(
        "SELECT * FROM agents WHERE agent_id = ?", (agent_id,)
    ).fetchone()
    conn.close()
    return _row_to_dict(row)


# ─── AXL Messages ─────────────────────────────────────────────────────────────

def get_axl_messages(limit: int = 50, organism_id: str = None) -> list:
    """
    Get most recent AXL messages.

    Args:
        limit: Max number of messages to return (default 50).

    Returns:
        List of message dicts ordered newest first.
    """
    conn = _get_conn()
    if not conn:
        return []
    if organism_id:
        rows = conn.execute(
            """SELECT * FROM axl_messages
               WHERE organism_id = ?
               ORDER BY timestamp DESC LIMIT ?""",
            (organism_id, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM axl_messages ORDER BY timestamp DESC LIMIT ?",
            (limit,)
        ).fetchall()
    conn.close()
    results = _rows_to_list(rows)
    for r in results:
        if r.get("payload"):
            try:
                r["payload"] = json.loads(r["payload"])
            except (json.JSONDecodeError, TypeError):
                pass
    return results


# ─── Storage Records ──────────────────────────────────────────────────────────

def get_storage_records(limit: int = 20, organism_id: str = None) -> list:
    """
    Get most recent 0G Storage upload records.

    Args:
        limit: Max number of records to return.

    Returns:
        List of storage record dicts ordered newest first.
    """
    conn = _get_conn()
    if not conn:
        return []
    if organism_id:
        rows = conn.execute(
            """SELECT * FROM storage_records
               WHERE organism_id = ?
               ORDER BY timestamp DESC LIMIT ?""",
            (organism_id, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM storage_records ORDER BY timestamp DESC LIMIT ?",
            (limit,)
        ).fetchall()
    conn.close()
    return _rows_to_list(rows)


# ─── KeeperHub Tasks ──────────────────────────────────────────────────────────

def get_keeperhub_tasks(limit: int = 20, organism_id: str = None) -> list:
    """
    Get most recent KeeperHub task records.

    Args:
        limit: Max number of records to return.

    Returns:
        List of task dicts ordered newest first.
    """
    conn = _get_conn()
    if not conn:
        return []
    if organism_id:
        rows = conn.execute(
            """SELECT * FROM keeperhub_tasks
               WHERE organism_id = ?
               ORDER BY timestamp DESC LIMIT ?""",
            (organism_id, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM keeperhub_tasks ORDER BY timestamp DESC LIMIT ?",
            (limit,)
        ).fetchall()
    conn.close()
    return _rows_to_list(rows)


# ─── iNFTs ────────────────────────────────────────────────────────────────────

def get_infts(limit: int = 20, organism_id: str = None) -> list:
    """
    Get most recently minted iNFTs.

    Args:
        limit: Max number of records to return.

    Returns:
        List of iNFT dicts ordered newest first.
    """
    conn = _get_conn()
    if not conn:
        return []
    if organism_id:
        rows = conn.execute(
            """SELECT * FROM infts
               WHERE organism_id = ?
               ORDER BY minted_at DESC LIMIT ?""",
            (organism_id, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM infts ORDER BY minted_at DESC LIMIT ?",
            (limit,)
        ).fetchall()
    conn.close()
    return _rows_to_list(rows)


def get_inft_count(organism_id: str = None) -> int:
    """Get total number of minted iNFTs."""
    conn = _get_conn()
    if not conn:
        return 0
    if organism_id:
        count = conn.execute(
            "SELECT COUNT(*) FROM infts WHERE organism_id = ?",
            (organism_id,),
        ).fetchone()[0]
    else:
        count = conn.execute("SELECT COUNT(*) FROM infts").fetchone()[0]
    conn.close()
    return count


# ─── Treasury ─────────────────────────────────────────────────────────────────

def get_latest_treasury(organism_id: str = None) -> dict:
    """
    Get most recent treasury snapshot.

    Returns:
        Dict with eth_balance, usd_value, timestamp or None.
    """
    conn = _get_conn()
    if not conn:
        return None
    if organism_id:
        row = conn.execute(
            """SELECT * FROM treasury_snapshots
               WHERE organism_id = ?
               ORDER BY timestamp DESC LIMIT 1""",
            (organism_id,),
        ).fetchone()
    else:
        row = conn.execute(
            "SELECT * FROM treasury_snapshots ORDER BY timestamp DESC LIMIT 1"
        ).fetchone()
    conn.close()
    return _row_to_dict(row)


def get_treasury_history(limit: int = 60, organism_id: str = None) -> list:
    """
    Get treasury balance history for sparkline chart.

    Args:
        limit: Max number of snapshots (default 60).

    Returns:
        List of snapshot dicts ordered oldest first.
    """
    conn = _get_conn()
    if not conn:
        return []
    if organism_id:
        rows = conn.execute(
            """SELECT * FROM treasury_snapshots
               WHERE organism_id = ?
               ORDER BY timestamp DESC LIMIT ?""",
            (organism_id, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT * FROM treasury_snapshots
               ORDER BY timestamp DESC LIMIT ?""",
            (limit,)
        ).fetchall()
    conn.close()
    return list(reversed(_rows_to_list(rows)))


# ─── Summary Stats ────────────────────────────────────────────────────────────

def get_summary_stats(organism_id: str = None) -> dict:
    """
    Get aggregate stats for the global dashboard view.

    Returns:
        Dict with agent_count, inft_count, storage_count,
        task_count, axl_message_count.
    """
    conn = _get_conn()
    if not conn:
        return {
            "agent_count": 0,
            "inft_count": 0,
            "storage_count": 0,
            "task_count": 0,
            "axl_message_count": 0
        }
    if organism_id:
        stats = {
            "agent_count": conn.execute("SELECT COUNT(*) FROM agents WHERE organism_id = ?", (organism_id,)).fetchone()[0],
            "inft_count": conn.execute("SELECT COUNT(*) FROM infts WHERE organism_id = ?", (organism_id,)).fetchone()[0],
            "storage_count": conn.execute("SELECT COUNT(*) FROM storage_records WHERE organism_id = ?", (organism_id,)).fetchone()[0],
            "task_count": conn.execute("SELECT COUNT(*) FROM keeperhub_tasks WHERE organism_id = ?", (organism_id,)).fetchone()[0],
            "axl_message_count": conn.execute("SELECT COUNT(*) FROM axl_messages WHERE organism_id = ?", (organism_id,)).fetchone()[0]
        }
    else:
        stats = {
            "agent_count": conn.execute("SELECT COUNT(*) FROM agents").fetchone()[0],
            "inft_count": conn.execute("SELECT COUNT(*) FROM infts").fetchone()[0],
            "storage_count": conn.execute("SELECT COUNT(*) FROM storage_records").fetchone()[0],
            "task_count": conn.execute("SELECT COUNT(*) FROM keeperhub_tasks").fetchone()[0],
            "axl_message_count": conn.execute("SELECT COUNT(*) FROM axl_messages").fetchone()[0]
        }
    conn.close()
    return stats


# ─── Cycles ───────────────────────────────────────────────────────────────────

def get_cycles(limit: int = 20, organism_id: str = None) -> list:
    """
    Get most recent scheduler cycle records.

    Args:
        limit: Max number of cycles to return (default 20).

    Returns:
        List of cycle dicts ordered newest first.
    """
    conn = _get_conn()
    if not conn:
        return []
    if organism_id:
        rows = conn.execute(
            """SELECT * FROM cycles
               WHERE organism_id = ?
               ORDER BY started_at DESC LIMIT ?""",
            (organism_id, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM cycles ORDER BY started_at DESC LIMIT ?",
            (limit,)
        ).fetchall()
    conn.close()
    return _rows_to_list(rows)


# ─── Activity ─────────────────────────────────────────────────────────────────

def get_activity(
    agent_id: str = None,
    cycle_id: str = None,
    organism_id: str = None,
    limit: int = 30,
) -> list:
    """
    Get most recent live activity events.

    Args:
        agent_id: Optional agent filter.
        cycle_id: Optional scheduler cycle filter.
        limit: Max rows to return.

    Returns:
        List of activity rows ordered newest first.
    """
    conn = _get_conn()
    if not conn:
        return []

    limit = max(1, min(int(limit or 30), 200))
    clauses = []
    params = []
    if agent_id:
        clauses.append("agent_id = ?")
        params.append(agent_id)
    if cycle_id:
        clauses.append("cycle_id = ?")
        params.append(cycle_id)
    if organism_id:
        clauses.append("organism_id = ?")
        params.append(organism_id)

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    params.append(limit)

    try:
        rows = conn.execute(
            f"SELECT * FROM activity {where} ORDER BY timestamp DESC, id DESC LIMIT ?",
            params,
        ).fetchall()
    except sqlite3.OperationalError:
        rows = []
    conn.close()

    results = _rows_to_list(rows)
    for r in results:
        if r.get("details"):
            try:
                r["details"] = json.loads(r["details"])
            except (json.JSONDecodeError, TypeError):
                pass
    return results
