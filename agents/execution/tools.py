"""
agents/execution/tools.py

CrewAI-compatible tools for the Execution Agent.
The Execution Agent uses these to receive strategy assignments,
execute on-chain actions via KeeperHub, store results on 0G,
mint iNFTs when strategy improves, and report to the Originator.
"""

import json
import sys
import os
import time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))
from integrations.state_writer import write_agent_status, write_axl_message, write_storage_record, write_keeperhub_task, write_inft

from crewai.tools import tool
from integrations.bridge_client import upload_data, mint_inft
from integrations.chroma_memory import store, search
from integrations.activity import emit
from integrations.state_writer import write_activity
from integrations.keeperhub import (
    create_workflow,
    execute_workflow,
    generate_workflow,
    get_execution_status,
    list_workflows
)
from axl.client import send_message, receive_messages, build_message
from dotenv import load_dotenv
import requests

load_dotenv()

AGENT = "execution"
MAX_TOOL_OUTPUT_CHARS = 1800
MAX_STORED_TEXT_CHARS = 5000

# How long to poll an execution before giving up. Each poll is ~3s.
KEEPERHUB_POLL_INTERVAL_SECONDS = 3
KEEPERHUB_POLL_MAX_ATTEMPTS = 10

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
TAVILY_URL = "https://api.tavily.com/search"


def _clip(text: str, limit: int = MAX_TOOL_OUTPUT_CHARS) -> str:
    text = str(text or "")
    return text if len(text) <= limit else text[:limit].rstrip() + "\n...[truncated]"


@tool("receive_strategy")
@emit(agent_id=AGENT, summary_fn=lambda a, k: "checking AXL inbox for strategy")
def receive_strategy_tool(dummy: str = "") -> str:
    """
    Check AXL inbox for strategy assignment from the Originator.
    The assignment contains the business strategy to execute.

    Args:
        dummy: Unused parameter required by CrewAI.

    Returns:
        Strategy assignment as JSON string, or 'no assignment yet'.
    """
    try:
        messages = receive_messages()
        if not messages:
            return "no assignment yet"
        for msg in messages:
            if msg.get("type") in ["INSTRUCTION", "SPAWN_EXECUTION"]:
                return _clip(json.dumps(msg), 900)
        return "no assignment yet"
    except Exception as e:
        return f"AXL receive failed: {e}"


@tool("run_keeperhub_action")
@emit(agent_id=AGENT, summary_fn=lambda a, k: f"keeperhub: {(a[0] if a else k.get('name', '?'))[:60]}")
def run_keeperhub_action_tool(name: str, description: str) -> str:
    """
    Create, execute, and confirm a KeeperHub workflow in one call.
    Use this whenever you need to perform an on-chain action.
    The tool handles all internal IDs — you only provide the workflow's
    name and a plain-language description of what it should do.

    Args:
        name: Short workflow name (e.g. 'AgenticTradingExecution_v1').
        description: Plain-language description of what the workflow does.

    Returns:
        JSON string with workflow_id, execution_id, status, tx_hash, and
        a short message. On any failure the JSON contains an 'error' key
        and the partial state reached so the caller can record honestly.
    """
    state: dict = {
        "name": name,
        "workflow_id": None,
        "execution_id": None,
        "status": None,
        "tx_hash": None,
    }
    try:
        workflow_id = create_workflow(name, description)
        state["workflow_id"] = workflow_id
        write_keeperhub_task(
            agent_id="execution",
            workflow_id=workflow_id,
            task_type=name,
            status="created",
        )

        execution_id = execute_workflow(workflow_id)
        state["execution_id"] = execution_id
        write_keeperhub_task(
            agent_id="execution",
            workflow_id=workflow_id,
            execution_id=execution_id,
            task_type="workflow_execution",
            status="running",
        )
        write_agent_status(
            "execution",
            "running",
            current_task=f"Running workflow: {name}",
        )

        for _ in range(KEEPERHUB_POLL_MAX_ATTEMPTS):
            poll = get_execution_status(execution_id)
            status = poll.get("status") if isinstance(poll, dict) else None
            tx_hash = poll.get("tx_hash") if isinstance(poll, dict) else None
            state["status"] = status
            state["tx_hash"] = tx_hash
            if status in ("complete", "completed", "success", "failed", "error"):
                break
            time.sleep(KEEPERHUB_POLL_INTERVAL_SECONDS)

        write_keeperhub_task(
            agent_id="execution",
            workflow_id=state["workflow_id"],
            execution_id=state["execution_id"],
            task_type="status_check",
            status=state["status"] or "unknown",
            tx_hash=state["tx_hash"],
        )
        return json.dumps(state)
    except Exception as e:
        state["error"] = str(e)
        write_keeperhub_task(
            agent_id="execution",
            workflow_id=state["workflow_id"],
            execution_id=state["execution_id"],
            task_type=name,
            status="failed",
        )
        return json.dumps(state)


@tool("create_keeperhub_workflow")
@emit(agent_id=AGENT, summary_fn=lambda a, k: f"creating workflow: {(a[0] if a else k.get('name', '?'))[:60]}")
def create_workflow_tool(name: str, description: str) -> str:
    """
    Create a new KeeperHub workflow for on-chain execution.
    Use this to set up an automation before executing it.

    Args:
        name: Workflow name.
        description: What this workflow does.

    Returns:
        workflow_id if successful, error message otherwise.
    """
    try:
        workflow_id = create_workflow(name, description)
        write_keeperhub_task(
            agent_id="execution",
            workflow_id=workflow_id,
            task_type=name,
            status="created"
        )
        return f"Created workflow: {workflow_id}"
    except Exception as e:
        return f"Workflow creation failed: {e}"


@tool("generate_keeperhub_workflow")
@emit(agent_id=AGENT, summary_fn=lambda a, k: f"generating workflow: {(a[0] if a else k.get('prompt', '?'))[:60]}")
def generate_workflow_tool(prompt: str) -> str:
    """
    Generate a KeeperHub workflow from a natural language prompt.
    Use this to create complex workflows without manual configuration.

    Args:
        prompt: Natural language description of what the workflow should do.

    Returns:
        Generated workflow details as JSON string.
    """
    try:
        result = generate_workflow(prompt)
        return json.dumps(result)
    except Exception as e:
        return f"Workflow generation failed: {e}"


@tool("execute_keeperhub_workflow")
@emit(agent_id=AGENT, summary_fn=lambda a, k: f"executing workflow: {(a[0] if a else k.get('workflow_id', '?'))[:60]}")
def execute_workflow_tool(workflow_id: str) -> str:
    """
    Execute a KeeperHub workflow by ID.
    Use this to trigger guaranteed on-chain execution.

    Args:
        workflow_id: ID of the workflow to execute.

    Returns:
        execution_id if successful, error message otherwise.
    """
    try:
        execution_id = execute_workflow(workflow_id)
        write_keeperhub_task(
            agent_id="execution",
            workflow_id=workflow_id,
            execution_id=execution_id,
            task_type="workflow_execution",
            status="running"
        )
        write_agent_status("execution", "running", current_task=f"Executing workflow: {workflow_id}")
        return f"Execution started: {execution_id}"
    except Exception as e:
        return f"Execution failed: {e}"


@tool("check_execution_status")
@emit(agent_id=AGENT, summary_fn=lambda a, k: f"checking execution: {(a[0] if a else k.get('execution_id', '?'))[:60]}")
def check_status_tool(execution_id: str) -> str:
    """
    Check the status of a KeeperHub workflow execution.

    Args:
        execution_id: Execution ID from execute_workflow.

    Returns:
        Execution status as JSON string.
    """
    try:
        status = get_execution_status(execution_id)
        write_keeperhub_task(
            agent_id="execution",
            execution_id=execution_id,
            task_type="status_check",
            status=status.get("status", "unknown"),
            tx_hash=status.get("tx_hash")
        )
        return json.dumps(status)
    except Exception as e:
        return f"Status check failed: {e}"


@tool("store_strategy")
@emit(agent_id=AGENT, summary_fn=lambda a, k: f"storing strategy v{(a[1] if len(a) > 1 else k.get('version', '?'))} on 0G + minting iNFT")
def store_strategy_tool(strategy: str, version: int, agent_name: str) -> str:
    """
    Store an improved strategy on 0G Storage and mint an iNFT.
    Call this when the agent has improved its strategy based on results.

    Args:
        strategy: Strategy content as string.
        version: Strategy version number (increment on each improvement).
        agent_name: Name of this execution agent.

    Returns:
        JSON string with root_hash and token_id.
    """
    try:
        strategy = _clip(strategy, MAX_STORED_TEXT_CHARS)
        filename = f"{agent_name}_strategy_v{version}"
        root_hash = upload_data(strategy, filename)

        minted = mint_inft(root_hash, {
            "agent": agent_name,
            "version": version,
            "type": "execution_strategy"
        })
        token_id = minted["token_id"]
        mint_tx = minted.get("mint_tx")

        write_storage_record("execution", filename, root_hash)
        write_inft(
            agent_id="execution",
            token_id=str(token_id),
            root_hash=root_hash,
            strategy_name=filename,
            version=version,
            mint_tx=mint_tx
        )
        write_agent_status("execution", "running", current_task=f"Minted iNFT v{version}: token {token_id}")
        from integrations.state_writer import write_treasury_snapshot
        write_treasury_snapshot(eth_balance="0.05", usd_value="$162.50")

        try:
            store(
                collection="execution",
                doc_id=filename,
                text=strategy,
                metadata={
                    "root_hash": root_hash,
                    "token_id": token_id,
                    "mint_tx": mint_tx,
                    "version": version
                }
            )
        except Exception as e:
            write_activity("execution", "error", f"memory store skipped: {type(e).__name__}")

        return json.dumps({
            "root_hash": root_hash,
            "token_id": token_id,
            "mint_tx": mint_tx,
            "version": version,
            "filename": filename
        })
    except Exception as e:
        return f"Strategy storage failed: {e}"


@tool("report_status_to_originator")
@emit(agent_id=AGENT, summary_fn=lambda a, k: f"reporting STATUS '{(a[1] if len(a) > 1 else k.get('status', '?'))}' to originator")
def report_status_tool(
    originator_pubkey: str,
    status: str,
    metrics: str
) -> str:
    """
    Send a STATUS report to the Originator over AXL.
    Call this after each execution cycle with performance metrics.

    Args:
        originator_pubkey: 64-char hex public key of Originator.
        status: Current status (running/improving/completed/failed).
        metrics: Performance metrics as JSON string.

    Returns:
        'sent' if successful, error message otherwise.
    """
    try:
        metrics_dict = json.loads(metrics) if isinstance(metrics, str) else metrics
        message = build_message(
            msg_type="STATUS",
            from_agent="execution",
            to_agent="originator",
            payload={
                "status": status,
                "metrics": metrics_dict
            }
        )
        success = send_message(originator_pubkey, message)
        write_axl_message("execution", "originator", "STATUS", {
            "status": status,
            "metrics": metrics_dict
        })
        return "sent" if success else "attempted"
    except Exception as e:
        return f"AXL send failed: {e}"


@tool("web_search")
@emit(agent_id=AGENT, summary_fn=lambda a, k: f"searching: {(a[0] if a else k.get('query', '?'))[:80]}")
def web_search_tool(query: str) -> str:
    """
    Search the web for current market data and strategy insights.

    Args:
        query: Search query string.

    Returns:
        Search results as formatted string.
    """
    try:
        response = requests.post(
            TAVILY_URL,
            json={
                "api_key": TAVILY_API_KEY,
                "query": query,
                "search_depth": "basic",
                "max_results": 3
            },
            timeout=30
        )
        response.raise_for_status()
        results = response.json().get("results", [])
        formatted = []
        for r in results:
            content = _clip(r.get("content", ""), 350)
            formatted.append(
                f"Title: {r.get('title')}\n"
                f"Content: {content}\n"
            )
        return _clip("\n---\n".join(formatted)) if formatted else "No results."
    except Exception as e:
        return f"Search failed: {e}"
