"""
api/server.py

FastAPI server for MiliGents frontend.
Reads from state.db via api/db.py and exposes all data
the frontend needs over HTTP and WebSocket.

Run locally:
    uvicorn api.server:app --host 0.0.0.0 --port 8080 --reload

Endpoints:
    GET  /api/health
    GET  /api/agents
    GET  /api/agents/{agent_id}
    GET  /api/axl
    GET  /api/storage
    GET  /api/tasks
    GET  /api/infts
    GET  /api/treasury
    GET  /api/treasury/history
    GET  /api/stats
    GET  /api/services
    WS   /api/feed/live
"""

import asyncio
import os
import requests
from datetime import datetime, timezone

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from api.db import (
    get_all_agents,
    get_agent,
    get_axl_messages,
    get_storage_records,
    get_keeperhub_tasks,
    get_infts,
    get_inft_count,
    get_latest_treasury,
    get_treasury_history,
    get_summary_stats,
    get_cycles,
)
from integrations.state_writer import write_treasury_snapshot
from integrations.wallet import get_eth_balance

app = FastAPI(title="MiliGents API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BRIDGE_URL = os.getenv("BRIDGE_URL", "http://localhost:3100")
KEEPERHUB_MCP_URL = os.getenv("KEEPERHUB_MCP_URL", "http://localhost:3001")


# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/")
def frontend():
    """Serve the MiliGents frontend."""
    html_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "MiliGents v2.html")
    return FileResponse(os.path.abspath(html_path))


# ─── Agents ───────────────────────────────────────────────────────────────────

@app.get("/api/agents")
def agents():
    return {"agents": get_all_agents()}


@app.get("/api/agents/{agent_id}")
def agent(agent_id: str):
    data = get_agent(agent_id)
    if not data:
        return {"agent": None, "error": "not found"}
    return {"agent": data}


# ─── AXL Messages ─────────────────────────────────────────────────────────────

@app.get("/api/axl")
def axl(limit: int = 50):
    return {"messages": get_axl_messages(limit=limit)}


# ─── Storage Records ──────────────────────────────────────────────────────────

@app.get("/api/storage")
def storage(limit: int = 20):
    return {"records": get_storage_records(limit=limit)}


# ─── KeeperHub Tasks ──────────────────────────────────────────────────────────

@app.get("/api/tasks")
def tasks(limit: int = 20):
    return {"tasks": get_keeperhub_tasks(limit=limit)}


# ─── iNFTs ────────────────────────────────────────────────────────────────────

@app.get("/api/infts")
def infts(limit: int = 20):
    return {
        "infts": get_infts(limit=limit),
        "total": get_inft_count()
    }


# ─── Treasury ─────────────────────────────────────────────────────────────────

@app.get("/api/treasury")
def treasury():
    """
    Fetch the organism's treasury wallet balance from the configured
    EVM RPC, write a snapshot to state.db, and return the latest snapshot.

    On RPC failure, returns the last known snapshot without writing.
    """
    address = os.getenv("WALLET_ADDRESS")
    rpc_error = None
    if address:
        try:
            balance = get_eth_balance(address)
            write_treasury_snapshot(eth_balance=balance)
        except Exception as e:
            rpc_error = str(e)

    return {
        "treasury": get_latest_treasury(),
        "wallet_address": address,
        "rpc_error": rpc_error,
    }


@app.get("/api/treasury/history")
def treasury_history(limit: int = 60):
    return {"history": get_treasury_history(limit=limit)}


# ─── Stats ────────────────────────────────────────────────────────────────────

@app.get("/api/stats")
def stats():
    return {
        "stats": get_summary_stats(),
        "wallet_address": os.getenv("WALLET_ADDRESS"),
    }


# ─── Service Health ───────────────────────────────────────────────────────────

@app.get("/api/services")
def services():
    """
    Check health of all dependent services.
    Used by the frontend deploy pre-flight checks.
    """
    def check(url: str, path: str = "/health") -> str:
        try:
            r = requests.get(f"{url}{path}", timeout=5)
            return "online" if r.status_code == 200 else "error"
        except Exception:
            return "offline"

    return {
        "bridge": check(BRIDGE_URL),
        "keeperhub": check(KEEPERHUB_MCP_URL),
        "api": "online"
    }


# ─── Cycles ───────────────────────────────────────────────────────────────────

@app.get("/api/cycles")
def cycles(limit: int = 20):
    return {"cycles": get_cycles(limit=limit)}


# ─── Scheduler Control ────────────────────────────────────────────────────────

@app.post("/api/scheduler/pause")
def scheduler_pause():
    """
    Pause the scheduler by writing the pause flag file.
    The scheduler checks this file before each cycle.
    """
    try:
        state_dir = os.getenv("STATE_DIR", "./state")
        os.makedirs(state_dir, exist_ok=True)
        flag = os.path.join(state_dir, "scheduler.paused")
        open(flag, "w").close()
        return {"status": "paused"}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


@app.post("/api/scheduler/resume")
def scheduler_resume():
    """
    Resume the scheduler by deleting the pause flag file.
    """
    try:
        flag = os.path.join(os.getenv("STATE_DIR", "./state"), "scheduler.paused")
        if os.path.exists(flag):
            os.remove(flag)
        return {"status": "resumed"}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


@app.get("/api/scheduler/status")
def scheduler_status():
    """
    Return whether the scheduler is currently paused.
    """
    flag = os.path.join(os.getenv("STATE_DIR", "./state"), "scheduler.paused")
    return {"paused": os.path.exists(flag)}


# ─── WebSocket Feed ───────────────────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, data: dict):
        for ws in list(self.active):
            try:
                await ws.send_json(data)
            except Exception:
                self.disconnect(ws)


manager = ConnectionManager()


@app.websocket("/api/feed/live")
async def feed(websocket: WebSocket):
    """
    WebSocket endpoint — pushes live state updates every 3 seconds.
    Frontend connects here for real-time dashboard updates.
    """
    await manager.connect(websocket)
    try:
        while True:
            payload = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "agents": get_all_agents(),
                "axl": get_axl_messages(limit=10),
                "tasks": get_keeperhub_tasks(limit=5),
                "infts": get_infts(limit=5),
                "treasury": get_latest_treasury(),
                "stats": get_summary_stats(),
            }
            await manager.broadcast(payload)
            await asyncio.sleep(3)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
