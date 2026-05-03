"""
agents/research_specialist/server.py

FastAPI wrapper for the Research Specialist agent.
Exposes POST /run and GET /status so the scheduler
can trigger and poll this agent over the Docker network.

Runs on port 8002 (internal to Docker network only).
"""

import os
import sys
import threading

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from agents.research_specialist.main import run
from integrations.state_writer import (
    DEFAULT_ORGANISM_ID,
    set_current_cycle,
    set_current_organism,
    write_agent_status,
    write_activity,
)

load_dotenv()

app = FastAPI(title="Research Specialist Agent", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_is_running = False
_run_lock = threading.Lock()


class RunRequest(BaseModel):
    organism_id: str = DEFAULT_ORGANISM_ID
    cycle_id: str | None = None


@app.get("/health")
def health():
    return {"status": "ok", "agent": "specialist"}


@app.get("/status")
def status():
    return {"agent": "specialist", "running": _is_running}


@app.post("/run")
def trigger_run(payload: RunRequest | None = None):
    global _is_running
    with _run_lock:
        if _is_running:
            raise HTTPException(status_code=409, detail="Specialist already running")
        _is_running = True

    def _run():
        global _is_running
        organism_id = (payload.organism_id if payload else DEFAULT_ORGANISM_ID) or DEFAULT_ORGANISM_ID
        cycle_id = payload.cycle_id if payload else None
        set_current_organism(organism_id)
        if cycle_id:
            set_current_cycle(cycle_id)
        write_activity("specialist", "status", "started", cycle_id=cycle_id, organism_id=organism_id)
        try:
            run(organism_id=organism_id, cycle_id=cycle_id)
            write_activity("specialist", "status", "finished", cycle_id=cycle_id, organism_id=organism_id)
        except Exception as e:
            print(f"[Specialist Server] run() failed: {e}")
            write_agent_status("specialist", "error", result=str(e), organism_id=organism_id)
            write_activity("specialist", "error", f"run() raised: {str(e)[:120]}", cycle_id=cycle_id, organism_id=organism_id)
        finally:
            _is_running = False

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
    return {"status": "started", "agent": "specialist", "organism_id": (payload.organism_id if payload else DEFAULT_ORGANISM_ID)}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8002)
