"""
agents/originator/agent.py

The Originator — CEO of the MiliGents autonomous agent organism.
Researches money-making opportunities, spawns specialists,
monitors children, and manages the growing agent company.
"""

import sys
import os
from dotenv import load_dotenv
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from crewai import Agent
from agents.originator.tools import (
    web_search_tool,
    store_research_tool,
    search_memory_tool,
    send_axl_tool,
    receive_axl_tool,
    get_pubkey_tool
)

load_dotenv()


def _risk_guidance(risk_profile: str) -> str:
    return {
        "conservative": "Prefer low-risk, low-capital, reversible strategies. Avoid leverage and thin liquidity.",
        "balanced": "Explore moderate-upside strategies, but keep actions reversible and bounded by policy caps.",
        "aggressive": "Scan more broadly for upside while still respecting all hard policy limits and allowlists.",
    }.get((risk_profile or "balanced").lower(), "Respect the configured risk profile and all hard policy limits.")


def create_originator(config: dict | None = None) -> Agent:
    """
    Create and return the Originator CrewAI agent.

    Returns:
        Configured CrewAI Agent instance.
    """
    os.environ["CEREBRAS_API_KEY"] = os.getenv("LLM_API_KEY", "")
    config = config or {}
    domains = config.get("domains") or ["agentic trading", "data services"]
    domain_text = ", ".join(domains)
    risk_profile = config.get("risk_profile") or "balanced"
    max_child_agents = int(config.get("max_child_agents") or 3)
    network = config.get("network") or "sepolia"
    treasury = f"{config.get('treasury_target_amount') or '0'} {config.get('treasury_asset') or 'ETH'}"

    return Agent(
        role="Chief Executive Agent",
        goal=(
            f"Research and identify up to {max_child_agents} viable opportunities "
            f"inside these owner-selected domains: {domain_text}. Operate on "
            f"{network} with a target treasury of {treasury}. Spawn only the "
            "specialists needed to validate the best opportunities, monitor "
            "their reports, and decide which path to pursue."
        ),
        backstory=(
            "You are the CEO of an autonomous agent organism called MiliGents. "
            "You think strategically and act decisively. You never guess — "
            "you research before deciding. You spawn specialists to validate "
            "your ideas before committing resources. You measure results "
            "before reinvesting. You expand only when existing operations "
            "are profitable. Your mission is to grow a treasury by deploying "
            "specialized agents that generate revenue autonomously. "
            f"Risk stance: {risk_profile}. {_risk_guidance(risk_profile)} "
            "Never override backend policy; treat it as the hard safety layer."
        ),
        tools=[
            web_search_tool,
            store_research_tool,
            search_memory_tool,
            send_axl_tool,
            receive_axl_tool,
            get_pubkey_tool
        ],
        llm=f"cerebras/{os.getenv('LLM_MODEL', 'llama3.1-8b')}",
        verbose=False,
        allow_delegation=False,
        max_iter=4
    )
