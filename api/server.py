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
import json
import os
import time
import requests
from datetime import datetime, timezone

from fastapi import FastAPI, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
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
    get_activity,
)
from integrations.auth import (
    SESSION_COOKIE,
    create_nonce,
    get_session,
    revoke_session,
    verify_wallet_signature,
)
from integrations.bridge_client import upload_data, mint_inft
from integrations.execution_policy import get_policy
from integrations.keeperhub import execute_transfer, get_direct_execution_status
from integrations.state_writer import (
    write_activity,
    write_agent_status,
    write_axl_message,
    write_cycle_complete,
    write_cycle_start,
    write_inft,
    write_storage_record,
    write_keeperhub_task,
    write_treasury_snapshot,
    set_current_cycle,
    clear_current_cycle,
)
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
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:8081")


class AuthVerifyRequest(BaseModel):
    address: str
    chain_id: int = 1
    message: str
    signature: str


# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/")
def frontend():
    """Serve the MiliGents frontend."""
    html_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "MiliGents v2.html")
    return FileResponse(os.path.abspath(html_path))


# ─── Wallet Auth ──────────────────────────────────────────────────────────────

def _session_token_from_request(request: Request) -> str | None:
    auth_header = request.headers.get("authorization") or ""
    if auth_header.lower().startswith("bearer "):
        return auth_header.split(" ", 1)[1].strip()
    return request.cookies.get(SESSION_COOKIE)


@app.get("/api/auth/nonce")
def auth_nonce(address: str, chain_id: int = 1):
    try:
        return {"auth": create_nonce(address, chain_id=chain_id, uri=FRONTEND_ORIGIN)}
    except Exception as e:
        return {"status": "error", "error": str(e)}


@app.post("/api/auth/verify")
def auth_verify(payload: AuthVerifyRequest, response: Response):
    try:
        session = verify_wallet_signature(
            address=payload.address,
            chain_id=payload.chain_id,
            message=payload.message,
            signature=payload.signature,
        )
        response.set_cookie(
            SESSION_COOKIE,
            session["session_token"],
            httponly=True,
            secure=os.getenv("AUTH_COOKIE_SECURE", "false").lower() == "true",
            samesite=os.getenv("AUTH_COOKIE_SAMESITE", "lax"),
            max_age=7 * 24 * 60 * 60,
        )
        return {
            "status": "ok",
            "session": {
                "owner_wallet": session["owner_wallet"],
                "chain_id": session["chain_id"],
                "expires_at": session["expires_at"],
            },
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}


@app.get("/api/auth/session")
def auth_session(request: Request):
    session = get_session(_session_token_from_request(request))
    return {"authenticated": bool(session), "session": session}


@app.post("/api/auth/logout")
def auth_logout(request: Request, response: Response):
    revoke_session(_session_token_from_request(request))
    response.delete_cookie(SESSION_COOKIE)
    return {"status": "ok"}


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


@app.get("/api/execution/policy")
def execution_policy():
    policy = get_policy()
    return {
        "policy": {
            "live_execution": policy.live_execution,
            "allowed_networks": sorted(policy.allowed_networks),
            "allowed_contracts_count": len(policy.allowed_contracts),
            "allowed_functions": sorted(policy.allowed_functions),
            "max_tx_eth": str(policy.max_tx_eth),
            "max_daily_spend_eth": str(policy.max_daily_spend_eth),
            "allow_approvals": policy.allow_approvals,
            "mainnet_confirmed": policy.mainnet_confirmed,
        }
    }


@app.post("/api/keeperhub/test-transfer")
def keeperhub_test_transfer(network: str = "sepolia", amount: str = None, to: str = None):
    """
    Trigger a tiny KeeperHub direct transfer for controlled verification.

    Policy gates still apply. By default this is blocked until
    KEEPERHUB_LIVE_EXECUTION=true and the selected network is allowed.
    """
    recipient = to or os.getenv("WALLET_ADDRESS")
    amount = amount or os.getenv("KEEPERHUB_TEST_TRANSFER_ETH", "0.00001")
    if not recipient:
        return {"status": "error", "error": "WALLET_ADDRESS or to is required"}

    try:
        write_activity("execution", "tool_call", f"keeperhub test transfer on {network}")
        execution_id = execute_transfer(
            to=recipient,
            amount=amount,
            token="ETH",
            network=network,
        )
        if not execution_id:
            raise RuntimeError("KeeperHub returned empty execution_id")
        write_keeperhub_task(
            agent_id="execution",
            execution_id=execution_id,
            task_type=f"direct_transfer_{network}",
            status="running",
        )

        status = {"status": "submitted"}
        for _ in range(8):
            try:
                status = get_direct_execution_status(execution_id)
            except Exception as e:
                status = {"status": "submitted", "poll_error": str(e)}
            if status.get("status") in ("completed", "failed"):
                break
            time.sleep(3)

        tx_hash = status.get("transactionHash") or status.get("tx_hash")
        task_status = status.get("status", "submitted")
        write_keeperhub_task(
            agent_id="execution",
            execution_id=execution_id,
            task_type=f"direct_transfer_{network}",
            status=task_status,
            tx_hash=tx_hash,
        )
        if tx_hash:
            write_activity("execution", "tool_result", f"keeperhub transfer tx {tx_hash[:10]}...")
        else:
            write_activity("execution", "tool_result", f"keeperhub transfer status {task_status}")

        return {
            "status": task_status,
            "network": network,
            "amount": amount,
            "recipient": recipient,
            "execution_id": execution_id,
            "tx_hash": tx_hash,
            "transaction_link": status.get("transactionLink"),
            "keeperhub_status": status,
        }
    except Exception as e:
        err = str(e)
        write_keeperhub_task(
            agent_id="execution",
            task_type=f"direct_transfer_{network}",
            status="blocked" if "KEEPERHUB_" in err or "allowed" in err else "failed",
        )
        write_activity("execution", "error", f"keeperhub test transfer failed: {err[:100]}")
        return {
            "status": "error",
            "network": network,
            "amount": amount,
            "recipient": recipient,
            "error": err,
        }


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


# ─── Activity ─────────────────────────────────────────────────────────────────

@app.get("/api/activity")
def activity(agent_id: str = None, cycle_id: str = None, limit: int = 30):
    return {
        "activity": get_activity(
            agent_id=agent_id,
            cycle_id=cycle_id,
            limit=limit,
        )
    }


@app.get("/api/activity/grouped")
def activity_grouped(limit_per_agent: int = 15):
    limit_per_agent = max(1, min(int(limit_per_agent or 15), 50))
    agents = ["originator", "specialist", "execution", "scheduler"]
    return {
        "agents": {
            agent_id: get_activity(agent_id=agent_id, limit=limit_per_agent)
            for agent_id in agents
        }
    }


# ─── Demo Proof Cycle ─────────────────────────────────────────────────────────

@app.post("/api/demo/run")
def demo_run():
    """
    Run a compact proof cycle for demos.

    This avoids long CrewAI context windows while still using the real bridge:
    it uploads a strategy proof to 0G Storage, mints an iNFT, stores root/tx
    state, and emits activity for all dashboard lanes.
    """
    cycle_id = f"demo_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
    set_current_cycle(cycle_id)
    write_cycle_start(cycle_id)
    write_activity("scheduler", "cycle", f"started {cycle_id}", cycle_id=cycle_id)

    try:
        now = datetime.now(timezone.utc).isoformat()
        write_agent_status("originator", "running", current_task="Preparing demo proof strategy")
        write_activity("originator", "task", "selected compact proof strategy", cycle_id=cycle_id)

        strategy = {
            "name": "Demo Proof Strategy",
            "created_at": now,
            "summary": "Compact strategy proof generated for the MiliGents live dashboard.",
            "steps": [
                "store strategy proof on 0G Storage",
                "mint strategy as iNFT",
                "surface root hash and mint tx in dashboard",
            ],
        }
        filename = f"demo_proof_strategy_{cycle_id}.json"

        write_agent_status("specialist", "running", current_task="Writing compact strategy report")
        write_activity("specialist", "task", "prepared storage proof payload", cycle_id=cycle_id)
        root_hash = upload_data(json.dumps(strategy, indent=2), filename)
        write_storage_record("specialist", filename, root_hash)

        write_axl_message("specialist", "execution", "REPORT", {
            "summary": strategy["summary"],
            "root_hash": root_hash,
            "status": "complete",
            "cycle_id": cycle_id,
        })

        write_agent_status("execution", "running", current_task="Minting demo iNFT proof")
        write_activity("execution", "task", "minting demo proof iNFT", cycle_id=cycle_id)
        minted = mint_inft(root_hash, {
            "agent": "execution",
            "version": 1,
            "type": "demo_proof_strategy",
            "cycle_id": cycle_id,
        })
        token_id = str(minted["token_id"])
        mint_tx = minted.get("mint_tx")

        write_inft(
            agent_id="execution",
            token_id=token_id,
            root_hash=root_hash,
            strategy_name=filename,
            version=1,
            mint_tx=mint_tx,
        )
        write_axl_message("execution", "originator", "STATUS", {
            "status": "completed",
            "token_id": token_id,
            "root_hash": root_hash,
            "mint_tx": mint_tx,
            "cycle_id": cycle_id,
        })

        write_agent_status("originator", "complete", current_task="Demo proof complete")
        write_agent_status("specialist", "complete", current_task="Demo report stored")
        write_agent_status("execution", "complete", current_task=f"Minted iNFT token {token_id}")
        write_activity("scheduler", "cycle", f"finished {cycle_id} (complete)", cycle_id=cycle_id)
        write_cycle_complete(
            cycle_id,
            status="complete",
            originator_status="complete",
            specialist_status="complete",
            execution_status="complete",
        )

        return {
            "status": "complete",
            "cycle_id": cycle_id,
            "root_hash": root_hash,
            "token_id": token_id,
            "mint_tx": mint_tx,
        }
    except Exception as e:
        err = str(e)
        write_activity("scheduler", "error", f"demo proof failed: {err[:100]}", cycle_id=cycle_id)
        write_cycle_complete(cycle_id, status="error")
        write_agent_status("execution", "error", result=err)
        return {"status": "error", "cycle_id": cycle_id, "error": err}
    finally:
        clear_current_cycle()


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
                "activity": get_activity(limit=40),
            }
            await manager.broadcast(payload)
            await asyncio.sleep(3)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
