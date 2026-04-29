"""
integrations/keeperhub.py

KeeperHub MCP client for MiliGents agents.
Connects to the KeeperHub MCP HTTP server and calls tools
for guaranteed on-chain execution.

All on-chain actions in MiliGents go through this wrapper.
Never send raw transactions from agent code.

Prerequisites:
- KeeperHub MCP server running locally:
  PORT=3001 MCP_API_KEY=miligents_local KEEPERHUB_API_KEY=<key> pnpm start
- KEEPERHUB_MCP_URL set in .env (default: http://localhost:3001)
- KEEPERHUB_MCP_API_KEY set in .env (default: miligents_local)
"""

import json
import os
import queue
import threading
import requests
from dotenv import load_dotenv

load_dotenv()

KEEPERHUB_MCP_URL = os.getenv("KEEPERHUB_MCP_URL", "http://localhost:3001")
KEEPERHUB_MCP_API_KEY = os.getenv("KEEPERHUB_MCP_API_KEY", "miligents_local")
TIMEOUT = 60

HEADERS = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {KEEPERHUB_MCP_API_KEY}"
}


def _get_session_id() -> str:
    """
    Establish an SSE session with KeeperHub MCP server.
    Returns the sessionId from the endpoint event.
    """
    session_queue = queue.Queue()

    def stream():
        try:
            with requests.get(
                f"{KEEPERHUB_MCP_URL}/sse",
                headers={"Authorization": f"Bearer {KEEPERHUB_MCP_API_KEY}"},
                stream=True,
                timeout=10
            ) as response:
                for line in response.iter_lines():
                    if line:
                        decoded = line.decode("utf-8")
                        if decoded.startswith("data: /message?sessionId="):
                            session_id = decoded.split("sessionId=")[1].strip()
                            session_queue.put(session_id)
                            return
        except Exception as e:
            session_queue.put(None)

    thread = threading.Thread(target=stream, daemon=True)
    thread.start()

    session_id = session_queue.get(timeout=10)
    if not session_id:
        raise RuntimeError("Failed to get KeeperHub session ID")
    return session_id


def _call_tool(tool_name: str, arguments: dict) -> dict:
    """
    Call a KeeperHub MCP tool via SSE session.

    Args:
        tool_name: Name of the MCP tool to call.
        arguments: Tool arguments as dict.

    Returns:
        Tool response as dict.

    Raises:
        RuntimeError: If the tool call fails.
    """
    session_id = _get_session_id()

    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": arguments
        }
    }

    try:
        response = requests.post(
            f"{KEEPERHUB_MCP_URL}/message?sessionId={session_id}",
            headers=HEADERS,
            json=payload,
            timeout=TIMEOUT
        )
        response.raise_for_status()
        result = response.json()

        if "error" in result:
            raise RuntimeError(f"MCP error: {result['error']}")

        content = result.get("result", {}).get("content", [])
        if content and content[0].get("type") == "text":
            text = content[0]["text"]
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                return {"result": text}

        return result.get("result", {})

    except requests.RequestException as e:
        raise RuntimeError(f"KeeperHub MCP call failed: {e}")


def health_check() -> bool:
    """
    Check if KeeperHub MCP server is running.

    Returns:
        True if healthy, False otherwise.
    """
    try:
        response = requests.get(
            f"{KEEPERHUB_MCP_URL}/health",
            timeout=10
        )
        return response.status_code == 200
    except requests.RequestException:
        return False


def list_workflows() -> list:
    """
    List all workflows in the KeeperHub organization.

    Returns:
        List of workflow dicts.
    """
    result = _call_tool("list_workflows", {})
    return result if isinstance(result, list) else result.get("workflows", [])


def create_workflow(
    name: str,
    description: str,
    trigger_type: str = "manual"
) -> str:
    """
    Create a new workflow in KeeperHub.

    Args:
        name: Workflow name.
        description: Workflow description.
        trigger_type: Trigger type (default: manual).

    Returns:
        workflow_id as string.

    Raises:
        RuntimeError: If creation fails.
    """
    result = _call_tool("create_workflow", {
        "name": name,
        "description": description,
        "nodes": [
            {
                "id": "1",
                "type": "trigger",
                "data": {"type": trigger_type}
            }
        ],
        "edges": []
    })
    workflow_id = result.get("id") or result.get("workflow_id", "")
    if not workflow_id:
        raise RuntimeError(f"No workflow ID returned: {result}")
    print(f"[KeeperHub] Created workflow: {workflow_id}")
    return workflow_id


def execute_workflow(workflow_id: str) -> str:
    """
    Execute a KeeperHub workflow by ID.

    Args:
        workflow_id: ID of the workflow to execute.

    Returns:
        execution_id as string.

    Raises:
        RuntimeError: If execution fails.
    """
    result = _call_tool("execute_workflow", {
        "workflow_id": workflow_id
    })
    execution_id = result.get("id") or result.get("execution_id", "")
    if not execution_id:
        raise RuntimeError(f"No execution ID returned: {result}")
    print(f"[KeeperHub] Started execution: {execution_id}")
    return execution_id


def generate_workflow(prompt: str) -> dict:
    """
    Generate a workflow from a natural language prompt using
    KeeperHub's AI generation tool.

    Args:
        prompt: Natural language description of the workflow.

    Returns:
        Generated workflow dict.

    Raises:
        RuntimeError: If generation fails.
    """
    result = _call_tool("generate_workflow", {
        "prompt": prompt
    })
    print(f"[KeeperHub] Generated workflow from prompt")
    return result


def get_execution_status(execution_id: str) -> dict:
    """
    Get the status of a workflow execution.

    Args:
        execution_id: Execution ID from execute_workflow.

    Returns:
        Dict with status, result, and logs.
    """
    result = _call_tool("get_execution", {
        "execution_id": execution_id
    })
    return result


def test_keeperhub() -> bool:
    """
    Smoke test for KeeperHub MCP integration.

    Returns:
        True if all basic operations work.
    """
    try:
        # Test 1 — health check
        assert health_check(), "Health check failed"
        print("[KeeperHub] Health: OK")

        # Test 2 — list workflows
        workflows = list_workflows()
        print(f"[KeeperHub] Workflows: {len(workflows)} found")

        # Test 3 — generate a workflow from natural language
        generated = generate_workflow(
            "Send a notification when a wallet balance drops below 0.1 ETH"
        )
        print(f"[KeeperHub] Workflow generation: OK")

        print("[KeeperHub] All tests passed")
        return True

    except Exception as e:
        print(f"[KeeperHub] Test failed: {e}")
        return False
