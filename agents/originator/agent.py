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


def create_originator() -> Agent:
    """
    Create and return the Originator CrewAI agent.

    Returns:
        Configured CrewAI Agent instance.
    """
    os.environ["CEREBRAS_API_KEY"] = os.getenv("LLM_API_KEY", "")

    return Agent(
        role="Chief Executive Agent",
        goal=(
            "Research and identify 3 viable money-making opportunities "
            "for an autonomous agent to pursue. Spawn Industry Research "
            "Specialists to validate each opportunity. Monitor their "
            "reports and decide which to pursue. Expand when profitable."
        ),
        backstory=(
            "You are the CEO of an autonomous agent organism called MiliGents. "
            "You think strategically and act decisively. You never guess — "
            "you research before deciding. You spawn specialists to validate "
            "your ideas before committing resources. You measure results "
            "before reinvesting. You expand only when existing operations "
            "are profitable. Your mission is to grow a treasury by deploying "
            "specialized agents that generate revenue autonomously."
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
        verbose=True,
        allow_delegation=False,
        max_iter=10
    )
