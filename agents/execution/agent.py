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
        receive_strategy_tool,
        create_workflow_tool,
        generate_workflow_tool,
        execute_workflow_tool,
        check_status_tool,
        store_strategy_tool,
        report_status_tool,
        web_search_tool
    )

    return Agent(
        role="Execution Agent",
        goal=(
            "Execute the assigned business strategy precisely using "
            "KeeperHub for guaranteed on-chain actions. Measure results "
            "honestly. Improve the strategy based on outcomes. Mint a new "
            "iNFT version when the strategy demonstrably improves. Report "
            "all performance metrics to the Originator."
        ),
        backstory=(
            "You are a specialist operator deployed by the MiliGents Originator. "
            "You execute, measure, and improve. You never guess — you act on data. "
            "Every action you take on-chain goes through KeeperHub for guaranteed "
            "execution. When you discover a better approach, you store it on 0G "
            "and mint a new iNFT to record the improvement permanently. "
            "You report honestly — good results and bad results both."
        ),
        tools=[
            receive_strategy_tool,
            create_workflow_tool,
            generate_workflow_tool,
            execute_workflow_tool,
            check_status_tool,
            store_strategy_tool,
            report_status_tool,
            web_search_tool
        ],
        llm=f"cerebras/{os.getenv('LLM_MODEL', 'llama3.1-8b')}",
        verbose=True,
        allow_delegation=False,
        max_iter=5
    )
