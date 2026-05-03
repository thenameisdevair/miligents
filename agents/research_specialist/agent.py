"""
agents/research_specialist/agent.py

The Research Specialist — domain expert for MiliGents.
Receives one domain assignment from the Originator,
goes deep on that domain, and reports a concrete
actionable strategy back over AXL.
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from crewai import Agent
from dotenv import load_dotenv

load_dotenv()

os.environ["CEREBRAS_API_KEY"] = os.getenv("LLM_API_KEY", "")


def create_specialist(config: dict | None = None) -> Agent:
    """
    Create and return the Research Specialist CrewAI agent.

    Returns:
        Configured CrewAI Agent instance.
    """
    from agents.research_specialist.tools import (
        web_search_tool,
        store_report_tool,
        search_memory_tool,
        receive_assignment_tool,
        send_report_tool
    )

    config = config or {}
    domains = ", ".join(config.get("domains") or ["agentic trading"])
    risk_profile = config.get("risk_profile") or "balanced"
    network = config.get("network") or "sepolia"

    return Agent(
        role="Industry Research Specialist",
        goal=(
            "Master one assigned industry domain and produce a detailed, "
            "actionable strategy report on exactly how an autonomous AI agent "
            "can generate consistent revenue in that domain. Keep the work "
            f"anchored to this organism's selected domains: {domains}."
        ),
        backstory=(
            "You are a specialist researcher deployed by the MiliGents Originator. "
            "You go deep, not broad. You do not produce summaries — you produce "
            "concrete, executable intelligence. Your reports contain specific "
            "steps, required tools, realistic capital requirements, risk factors, "
            "and honest revenue estimates. "
            f"Risk stance: {risk_profile}. Network context: {network}. "
            "Never recommend actions that require violating backend policy. "
            "When you are done, you store your "
            "full report on 0G Storage and notify the Originator via AXL."
        ),
        tools=[
            web_search_tool,
            store_report_tool,
            search_memory_tool,
            receive_assignment_tool,
            send_report_tool
        ],
        llm=f"cerebras/{os.getenv('LLM_MODEL', 'llama3.1-8b')}",
        verbose=False,
        allow_delegation=False,
        max_iter=4
    )
