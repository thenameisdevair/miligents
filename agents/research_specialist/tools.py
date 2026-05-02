"""
agents/research_specialist/tools.py

CrewAI-compatible tools for the Research Specialist agent.
The Specialist uses these to receive assignments, research
domains deeply, and report findings back to the Originator.
"""

import json
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))
from integrations.state_writer import write_agent_status, write_axl_message, write_storage_record

from crewai.tools import tool
from integrations.bridge_client import upload_data
from integrations.chroma_memory import store, search
from integrations.activity import emit
from axl.client import send_message, receive_messages, build_message
from dotenv import load_dotenv
import requests

load_dotenv()

AGENT = "specialist"
MAX_TOOL_OUTPUT_CHARS = 1800
MAX_STORED_TEXT_CHARS = 6000

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
TAVILY_URL = "https://api.tavily.com/search"


def _clip(text: str, limit: int = MAX_TOOL_OUTPUT_CHARS) -> str:
    text = str(text or "")
    return text if len(text) <= limit else text[:limit].rstrip() + "\n...[truncated]"


@tool("web_search")
@emit(agent_id=AGENT, summary_fn=lambda a, k: f"searching: {(a[0] if a else k.get('query', '?'))[:80]}")
def web_search_tool(query: str) -> str:
    """
    Search the web for deep domain-specific information.
    Use this to research how an autonomous agent can generate
    revenue in a specific industry or domain.

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
                "max_results": 3
            },
            timeout=30
        )
        response.raise_for_status()
        results = response.json().get("results", [])
        formatted = []
        for r in results:
            content = _clip(r.get("content", ""), 450)
            formatted.append(
                f"Title: {r.get('title')}\n"
                f"URL: {r.get('url')}\n"
                f"Content: {content}\n"
            )
        return _clip("\n---\n".join(formatted)) if formatted else "No results found."
    except Exception as e:
        return f"Search failed: {e}"


@tool("store_report")
@emit(agent_id=AGENT, summary_fn=lambda a, k: f"storing on 0G: {(a[1] if len(a) > 1 else k.get('filename', '?'))[:60]}")
def store_report_tool(data: str, filename: str) -> str:
    """
    Store research report permanently on 0G Storage
    and locally in ChromaDB.
    Call this when your domain research is complete.

    Args:
        data: Report content as string or JSON string.
        filename: Logical name for this report document.

    Returns:
        root_hash string if successful, error message otherwise.
    """
    try:
        data = _clip(data, MAX_STORED_TEXT_CHARS)
        root_hash = upload_data(data, filename)
        store(
            collection="specialist",
            doc_id=filename,
            text=data,
            metadata={"root_hash": root_hash, "filename": filename}
        )
        write_storage_record("specialist", filename, root_hash)
        write_agent_status("specialist", "running", current_task=f"Stored report: {filename}")
        return f"Stored successfully. root_hash: {root_hash}"
    except Exception as e:
        return f"Storage failed: {e}"


@tool("search_memory")
@emit(agent_id=AGENT, summary_fn=lambda a, k: f"searching memory: {(a[0] if a else k.get('query', '?'))[:80]}")
def search_memory_tool(query: str) -> str:
    """
    Search past research stored in local specialist memory.

    Args:
        query: Natural language query.

    Returns:
        Relevant past research as formatted string.
    """
    results = search("specialist", query, n_results=3)
    if not results:
        return "No relevant past research found."
    formatted = []
    for r in results:
        formatted.append(f"Document: {r['id']}\nContent: {_clip(r['text'], 300)}")
    return _clip("\n---\n".join(formatted))


@tool("receive_assignment")
@emit(agent_id=AGENT, summary_fn=lambda a, k: "checking AXL inbox")
def receive_assignment_tool(dummy: str = "") -> str:
    """
    Check AXL inbox for assignment messages from the Originator.
    The assignment tells this specialist which domain to research.

    Args:
        dummy: Unused parameter required by CrewAI tool interface.

    Returns:
        Assignment message as JSON string, or 'no assignment yet'.
    """
    try:
        messages = receive_messages()
        if not messages:
            return "no assignment yet"
        for msg in messages:
            if msg.get("type") == "SPAWN_SPECIALIST":
                return _clip(json.dumps(msg), 900)
        return "no assignment yet"
    except Exception as e:
        return f"AXL receive failed: {e}"


@tool("send_report_to_originator")
@emit(agent_id=AGENT, summary_fn=lambda a, k: "sending REPORT to originator via AXL")
def send_report_tool(
    originator_pubkey: str,
    report_summary: str,
    root_hash: str
) -> str:
    """
    Send completed research report to the Originator over AXL.
    Call this after storing the full report on 0G Storage.

    Args:
        originator_pubkey: 64-char hex public key of Originator node.
        report_summary: Brief summary of findings (max 500 chars).
        root_hash: 0G Storage root hash of the full report.

    Returns:
        'sent' if successful, error message otherwise.
    """
    try:
        message = build_message(
            msg_type="REPORT",
            from_agent="specialist",
            to_agent="originator",
            payload={
                "summary": report_summary,
                "root_hash": root_hash,
                "status": "complete"
            }
        )
        success = send_message(originator_pubkey, message)
        write_axl_message("specialist", "originator", "REPORT", {
            "summary": report_summary,
            "root_hash": root_hash,
            "status": "complete"
        })
        return "sent" if success else "attempted"
    except Exception as e:
        return f"AXL send failed: {e}"
