"""
agents/execution/agent.py

The Execution Agent — specialist operator for MiliGents.
Receives a strategy from the Originator, executes it via
KeeperHub, measures results, improves the strategy, mints
updated iNFTs, and reports performance back.
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from crewai import Agent
from dotenv import load_dotenv

load_dotenv()

os.environ["CEREBRAS_API_KEY"] = os.getenv("LLM_API_KEY", "")


def create_execution_agent() -> Agent:
    """
    Create and return the Execution Agent.

    Returns:
        Configured CrewAI Agent instance.
    """
    from agents.execution.tools import (
        run_keeperhub_action_tool,
        store_strategy_tool,
        report_status_tool,
    )

    return Agent(
        role="Execution Agent",
        goal=(
            "Execute one assigned strategy via KeeperHub, mint one iNFT proof, "
            "and report completion."
        ),
        backstory=(
            "You are a compact execution worker. Use only the required tools and "
            "keep outputs short."
        ),
        tools=[
            run_keeperhub_action_tool,
            store_strategy_tool,
            report_status_tool,
        ],
        llm=f"cerebras/{os.getenv('LLM_MODEL', 'llama3.1-8b')}",
        verbose=False,
        allow_delegation=False,
        max_iter=3
    )
