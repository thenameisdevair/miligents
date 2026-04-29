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
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from crewai.tools import tool
from integrations.bridge_client import upload_data, mint_inft
from integrations.chroma_memory import store, search
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

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
TAVILY_URL = "https://api.tavily.com/search"


@tool("receive_strategy")
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
                return json.dumps(msg)
        return "no assignment yet"
    except Exception as e:
        return f"AXL receive failed: {e}"


@tool("create_keeperhub_workflow")
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
        return f"Created workflow: {workflow_id}"
    except Exception as e:
        return f"Workflow creation failed: {e}"


@tool("generate_keeperhub_workflow")
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
        return f"Execution started: {execution_id}"
    except Exception as e:
        return f"Execution failed: {e}"


@tool("check_execution_status")
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
        return json.dumps(status)
    except Exception as e:
        return f"Status check failed: {e}"


@tool("store_strategy")
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
        filename = f"{agent_name}_strategy_v{version}"
        root_hash = upload_data(strategy, filename)

        token_id = mint_inft(root_hash, {
            "agent": agent_name,
            "version": version,
            "type": "execution_strategy"
        })

        store(
            collection="execution",
            doc_id=filename,
            text=strategy,
            metadata={
                "root_hash": root_hash,
                "token_id": token_id,
                "version": version
            }
        )

        return json.dumps({
            "root_hash": root_hash,
            "token_id": token_id,
            "version": version,
            "filename": filename
        })
    except Exception as e:
        return f"Strategy storage failed: {e}"


@tool("report_status_to_originator")
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
        return "sent" if success else "failed to send"
    except Exception as e:
        return f"AXL send failed: {e}"


@tool("web_search")
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
            formatted.append(
                f"Title: {r.get('title')}\n"
                f"Content: {r.get('content', '')[:300]}\n"
            )
        return "\n---\n".join(formatted) if formatted else "No results."
    except Exception as e:
        return f"Search failed: {e}"
