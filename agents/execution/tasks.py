"""
agents/execution/tasks.py

CrewAI Tasks for the Execution Agent.
Tasks: receive strategy → plan execution → execute → measure → improve → report
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from crewai import Task
from agents.execution.agent import create_execution_agent


def create_tasks(strategy: str = "agentic trading", agent=None) -> list:
    """
    Create and return all Execution Agent tasks.

    Args:
        strategy: The business strategy to execute.

    Returns:
        List of CrewAI Task instances.
    """
    agent = agent or create_execution_agent()

    execute_task = Task(
        description=(
            f"Call run_keeperhub_action once for '{strategy}'. "
            f"Use name='{strategy.replace(' ', '_')}_v1' and a one-sentence description. "
            f"Return only the tool JSON."
        ),
        expected_output=(
            "The exact JSON returned by run_keeperhub_action."
        ),
        agent=agent
    )

    improve_task = Task(
        description=(
            "Call store_strategy once with strategy='Executed agentic trading; "
            "stored proof and minted iNFT.', version=1, agent_name='execution_agent'. "
            "Then call report_status_to_originator with originator_pubkey='00000000', "
            "status='completed', metrics='{}'. Return only token_id, root_hash, mint_tx."
        ),
        expected_output=(
            "token_id, root_hash, and mint_tx of the minted iNFT."
        ),
        agent=agent
    )

    return [execute_task, improve_task]
