"""
scheduler/main.py

MiliGents Scheduler — triggers agent cycles by calling agent run()
functions directly (no HTTP, no separate containers needed).

Works both as:
  - Standalone process:  python3 scheduler/main.py
  - Background thread:   import and call main() from api/server.py

Environment variables:
    CYCLE_INTERVAL_MINUTES  Minutes between cycles (default 10)
    STATE_DIR               Shared state path (default /app/state)
"""

import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from integrations.state_writer import (
    write_cycle_start,
    write_cycle_complete,
    write_activity,
    set_current_cycle,
    clear_current_cycle,
    set_current_organism,
    clear_current_organism,
    DEFAULT_ORGANISM_ID,
)
from integrations.organisms import list_organisms

# Direct agent imports — no HTTP needed
from agents.originator.main import run as run_originator
from agents.research_specialist.main import run as run_specialist
from agents.execution.main import run as run_execution

# ─── Config ───────────────────────────────────────────────────────────────────

CYCLE_INTERVAL_MINUTES = int(os.getenv("CYCLE_INTERVAL_MINUTES", "10"))
STATE_DIR              = os.getenv("STATE_DIR", "/app/state")
PAUSE_FLAG             = os.path.join(STATE_DIR, "scheduler.paused")
STARTUP_DELAY_SECONDS  = 30


# ─── Helpers ──────────────────────────────────────────────────────────────────

def is_paused() -> bool:
    return Path(PAUSE_FLAG).exists()


def now_id() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")


def log(msg: str):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    print(f"[Scheduler {ts}] {msg}", flush=True)


def run_agent(name: str, fn, organism_id: str, cycle_id: str) -> str:
    """
    Call an agent's run() function directly.
    Returns 'complete' or 'error'.
    """
    log(f"Running {name}...")
    try:
        fn(organism_id=organism_id, cycle_id=cycle_id)
        log(f"{name} complete")
        return "complete"
    except Exception as e:
        log(f"{name} failed: {e}")
        return "error"


# ─── Cycle ────────────────────────────────────────────────────────────────────

def run_cycle(organism_id: str):
    cycle_id = f"cycle_{organism_id}_{now_id()}"
    log(f"Starting cycle {cycle_id} for {organism_id}")

    set_current_organism(organism_id)
    write_cycle_start(cycle_id, organism_id=organism_id)
    set_current_cycle(cycle_id)
    write_activity(
        "scheduler", "cycle",
        f"started {cycle_id}",
        cycle_id=cycle_id,
        organism_id=organism_id,
    )

    o_status = run_agent("originator", run_originator, organism_id, cycle_id)
    write_activity("scheduler", "status", f"originator → {o_status}",
                   cycle_id=cycle_id, organism_id=organism_id)

    s_status = run_agent("specialist", run_specialist, organism_id, cycle_id)
    write_activity("scheduler", "status", f"specialist → {s_status}",
                   cycle_id=cycle_id, organism_id=organism_id)

    e_status = run_agent("execution", run_execution, organism_id, cycle_id)
    write_activity("scheduler", "status", f"execution → {e_status}",
                   cycle_id=cycle_id, organism_id=organism_id)

    final = "complete" if all(
        s in ("complete", "timeout") for s in [o_status, s_status, e_status]
    ) else "error"

    write_cycle_complete(
        cycle_id,
        status=final,
        originator_status=o_status,
        specialist_status=s_status,
        execution_status=e_status,
        organism_id=organism_id,
    )
    write_activity("scheduler", "cycle", f"finished {cycle_id} ({final})",
                   cycle_id=cycle_id, organism_id=organism_id)
    clear_current_cycle()
    clear_current_organism()
    log(f"Cycle {cycle_id} done — status: {final}")


# ─── Organism list ─────────────────────────────────────────────────────────────

def active_organism_ids() -> list[str]:
    try:
        organisms = list_organisms()
        ids = [
            org["organism_id"]
            for org in organisms
            if org.get("status") in {"active", "funded", "sponsored"}
            and org.get("organism_id")
        ]
        return ids or [DEFAULT_ORGANISM_ID]
    except Exception as e:
        log(f"Could not load organisms, falling back to {DEFAULT_ORGANISM_ID}: {e}")
        return [DEFAULT_ORGANISM_ID]


# ─── Main loop ────────────────────────────────────────────────────────────────

def main():
    log(f"Scheduler started. Interval: {CYCLE_INTERVAL_MINUTES}m")
    log(f"Waiting {STARTUP_DELAY_SECONDS}s for services to become ready...")
    time.sleep(STARTUP_DELAY_SECONDS)

    while True:
        if is_paused():
            log("Paused — skipping cycle. Delete scheduler.paused to resume.")
        else:
            try:
                for organism_id in active_organism_ids():
                    run_cycle(organism_id)
            except Exception as e:
                log(f"Cycle failed with unexpected error: {e}")

        log(f"Sleeping {CYCLE_INTERVAL_MINUTES} minutes...")
        time.sleep(CYCLE_INTERVAL_MINUTES * 60)


if __name__ == "__main__":
    main()
