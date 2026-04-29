"""
agents/originator/tools.py

CrewAI-compatible tools for the Originator agent.
The Originator uses these to research, store, and communicate.
"""

import json
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from crewai.tools import tool
from integrations.bridge_client import upload_data, download_data
from integrations.chroma_memory import store, search
from axl.client import send_message, receive_messages, get_our_pubkey, build_message
from dotenv import load_dotenv
import requests
import os

load_dotenv()

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
TAVILY_URL = "https://api.tavily.com/search"


@tool("web_search")
def web_search_tool(query: str) -> str:
    """
    Search the web for current information.
    Use this to research money-making opportunities,
    market conditions, and industry trends.

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
                "search_depth": "advanced",
                "max_results": 5
            },
            timeout=30
        )
        response.raise_for_status()
        results = response.json().get("results", [])
        formatted = []
        for r in results:
            formatted.append(f"Title: {r.get('title')}\nURL: {r.get('url')}\nContent: {r.get('content')}\n")
        return "\n---\n".join(formatted) if formatted else "No results found."
    except Exception as e:
        return f"Search failed: {e}"


@tool("store_research")
def store_research_tool(data: str, filename: str) -> str:
    """
    Store research findings permanently on 0G Storage
    and locally in ChromaDB for fast retrieval.
    Use this after completing any research task.

    Args:
        data: Research content to store (string or JSON string).
        filename: Logical name for this research document.

    Returns:
        root_hash string if successful, error message otherwise.
    """
    try:
        # Store permanently on 0G
        root_hash = upload_data(data, filename)

        # Also store locally in ChromaDB for fast search
        store(
            collection="originator",
            doc_id=filename,
            text=data,
            metadata={"root_hash": root_hash, "filename": filename}
        )

        return f"Stored successfully. root_hash: {root_hash}"
    except Exception as e:
        return f"Storage failed: {e}"


@tool("search_memory")
def search_memory_tool(query: str) -> str:
    """
    Search past research stored in local memory.
    Use this before doing new research to avoid duplication.

    Args:
        query: Natural language query to search memory.

    Returns:
        Relevant past research as formatted string.
    """
    results = search("originator", query, n_results=3)
    if not results:
        return "No relevant past research found."
    formatted = []
    for r in results:
        formatted.append(f"Document: {r['id']}\nContent: {r['text'][:500]}...")
    return "\n---\n".join(formatted)


@tool("send_axl_message")
def send_axl_tool(destination_pubkey: str, message_type: str, payload: str) -> str:
    """
    Send a message to another agent over the AXL P2P network.
    Use this to spawn specialists or send instructions to execution agents.

    Args:
        destination_pubkey: 64-char hex public key of recipient agent.
        message_type: One of SPAWN_SPECIALIST, INSTRUCTION, STATUS.
        payload: JSON string containing message payload.

    Returns:
        'sent' if successful, error message otherwise.
    """
    try:
        payload_dict = json.loads(payload) if isinstance(payload, str) else payload
        message = build_message(
            msg_type=message_type,
            from_agent="originator",
            to_agent="specialist",
            payload=payload_dict
        )
        success = send_message(destination_pubkey, message)
        return "sent" if success else "failed to send"
    except Exception as e:
        return f"AXL send failed: {e}"


@tool("receive_axl_messages")
def receive_axl_tool(dummy: str = "") -> str:
    """
    Check for incoming messages from other agents over AXL.
    Use this to receive reports from specialists and status
    updates from execution agents.

    Args:
        dummy: Unused parameter (required by CrewAI tool interface).

    Returns:
        Received messages as formatted string, or 'no messages'.
    """
    try:
        messages = receive_messages()
        if not messages:
            return "no messages"
        formatted = []
        for m in messages:
            formatted.append(json.dumps(m, indent=2))
        return "\n---\n".join(formatted)
    except Exception as e:
        return f"AXL receive failed: {e}"


@tool("get_our_pubkey")
def get_pubkey_tool(dummy: str = "") -> str:
    """
    Get this agent's AXL public key.
    Use this to share our identity with other agents.

    Args:
        dummy: Unused parameter.

    Returns:
        64-char hex public key string.
    """
    return get_our_pubkey()
