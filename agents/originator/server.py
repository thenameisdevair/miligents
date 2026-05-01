"""
agents/originator/server.py

FastAPI wrapper for the Originator agent.
Exposes POST /run and GET /status so the scheduler
can trigger and poll this agent over the Docker network.

Runs on port 8001 (internal to Docker network only).
"""

import os
import sys
import threading

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from agents.originator.main import run
from integrations.state_writer import write_agent_status, write_activity

load_dotenv()

app = FastAPI(title="Originator Agent", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_is_running = False
_run_lock = threading.Lock()


@app.get("/health")
def health():
    return {"status": "ok", "agent": "originator"}


@app.get("/status")
def status():
    return {"agent": "originator", "running": _is_running}


@app.post("/run")
def trigger_run():
    global _is_running
    with _run_lock:
        if _is_running:
            raise HTTPException(status_code=409, detail="Originator already running")
        _is_running = True

    def _run():
        global _is_running
        write_activity("originator", "status", "started")
        try:
            run()
            write_activity("originator", "status", "finished")
        except Exception as e:
            print(f"[Originator Server] run() failed: {e}")
            write_agent_status("originator", "error", result=str(e))
            write_activity("originator", "error", f"run() raised: {str(e)[:120]}")
        finally:
            _is_running = False

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
    return {"status": "started", "agent": "originator"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
