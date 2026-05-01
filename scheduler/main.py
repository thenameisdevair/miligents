"""
scheduler/main.py

MiliGents Scheduler — triggers agent cycles on a configurable interval.

Behaviour:
- Runs every CYCLE_INTERVAL_MINUTES (default 10).
- Before each cycle checks STATE_DIR/scheduler.paused flag file.
  If the file exists, skips this cycle and waits again.
- Triggers agents sequentially: originator → specialist → execution.
  Polls each agent's /status endpoint until running=false before
  triggering the next (max AGENT_TIMEOUT_MINUTES per agent).
- Writes cycle start/complete records to state.db via state_writer.

Pause/resume controlled by API server writing/deleting scheduler.paused.

Environment variables:
    CYCLE_INTERVAL_MINUTES  Minutes between cycles (default 10)
    AGENT_TIMEOUT_MINUTES   Max wait per agent before moving on (default 15)
    STATE_DIR               Shared state volume path (default /app/state)
    ORIGINATOR_URL          http://originator:8001
    SPECIALIST_URL          http://specialist:8002
    EXECUTION_URL           http://execution:8003
"""

import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

sys.path.insert(0, "/app")

from integrations.state_writer import (
    write_cycle_start,
    write_cycle_complete,
    write_activity,
    set_current_cycle,
    clear_current_cycle,
)

# ─── Config ───────────────────────────────────────────────────────────────────

CYCLE_INTERVAL_MINUTES = int(os.getenv("CYCLE_INTERVAL_MINUTES", "10"))
AGENT_TIMEOUT_MINUTES  = int(os.getenv("AGENT_TIMEOUT_MINUTES", "15"))
STATE_DIR              = os.getenv("STATE_DIR", "/app/state")
PAUSE_FLAG             = os.path.join(STATE_DIR, "scheduler.paused")

ORIGINATOR_URL = os.getenv("ORIGINATOR_URL", "http://originator:8001")
SPECIALIST_URL = os.getenv("SPECIALIST_URL", "http://specialist:8002")
EXECUTION_URL  = os.getenv("EXECUTION_URL",  "http://execution:8003")

POLL_INTERVAL_SECONDS = 15
STARTUP_DELAY_SECONDS = 30


# ─── Helpers ──────────────────────────────────────────────────────────────────

def is_paused() -> bool:
    return Path(PAUSE_FLAG).exists()


def now_id() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")


def log(msg: str):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    print(f"[Scheduler {ts}] {msg}", flush=True)


def wait_for_agent(name: str, url: str, timeout_minutes: int) -> str:
    """
    Trigger an agent via POST /run, then poll GET /status until
    running=false. Returns 'complete' or 'timeout'.
    """
    try:
        resp = requests.post(f"{url}/run", timeout=10)
        if resp.status_code == 409:
            log(f"{name} already running — waiting for it to finish")
        elif resp.status_code != 200:
            log(f"{name} /run returned {resp.status_code} — skipping")
            return "error"
        else:
            log(f"{name} triggered successfully")
    except Exception as e:
        log(f"{name} /run failed: {e}")
        return "error"

    deadline = time.time() + (timeout_minutes * 60)
    while time.time() < deadline:
        time.sleep(POLL_INTERVAL_SECONDS)
        try:
            resp = requests.get(f"{url}/status", timeout=5)
            data = resp.json()
            if not data.get("running", True):
                log(f"{name} finished")
                return "complete"
        except Exception as e:
            log(f"{name} /status poll failed: {e}")

    log(f"{name} timed out after {timeout_minutes} minutes — moving on")
    return "timeout"


# ─── Main Loop ────────────────────────────────────────────────────────────────

def run_cycle():
    cycle_id = f"cycle_{now_id()}"
    log(f"Starting cycle {cycle_id}")
    write_cycle_start(cycle_id)
    set_current_cycle(cycle_id)
    write_activity("scheduler", "cycle", f"started {cycle_id}", cycle_id=cycle_id)

    write_activity("scheduler", "task", "triggering originator", cycle_id=cycle_id)
    o_status = wait_for_agent("originator", ORIGINATOR_URL, AGENT_TIMEOUT_MINUTES)
    write_activity("scheduler", "status", f"originator → {o_status}", cycle_id=cycle_id)

    write_activity("scheduler", "task", "triggering specialist", cycle_id=cycle_id)
    s_status = wait_for_agent("specialist", SPECIALIST_URL, AGENT_TIMEOUT_MINUTES)
    write_activity("scheduler", "status", f"specialist → {s_status}", cycle_id=cycle_id)

    write_activity("scheduler", "task", "triggering execution", cycle_id=cycle_id)
    e_status = wait_for_agent("execution",  EXECUTION_URL,  AGENT_TIMEOUT_MINUTES)
    write_activity("scheduler", "status", f"execution → {e_status}", cycle_id=cycle_id)

    final = "complete" if all(
        s in ("complete", "timeout") for s in [o_status, s_status, e_status]
    ) else "error"

    write_cycle_complete(
        cycle_id,
        status=final,
        originator_status=o_status,
        specialist_status=s_status,
        execution_status=e_status,
    )
    write_activity("scheduler", "cycle", f"finished {cycle_id} ({final})", cycle_id=cycle_id)
    clear_current_cycle()
    log(f"Cycle {cycle_id} done — status: {final}")


def main():
    log(f"Scheduler started. Interval: {CYCLE_INTERVAL_MINUTES}m. "
        f"Agent timeout: {AGENT_TIMEOUT_MINUTES}m.")
    log(f"Waiting {STARTUP_DELAY_SECONDS}s for agents to become ready...")
    time.sleep(STARTUP_DELAY_SECONDS)

    while True:
        if is_paused():
            log("Paused — skipping this cycle. Delete scheduler.paused to resume.")
        else:
            try:
                run_cycle()
            except Exception as e:
                log(f"Cycle failed with unexpected error: {e}")

        log(f"Sleeping {CYCLE_INTERVAL_MINUTES} minutes until next cycle...")
        time.sleep(CYCLE_INTERVAL_MINUTES * 60)


if __name__ == "__main__":
    main()
