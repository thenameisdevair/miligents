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


def create_tasks(strategy: str = "agentic trading") -> list:
    """
    Create and return all Execution Agent tasks.

    Args:
        strategy: The business strategy to execute.

    Returns:
        List of CrewAI Task instances.
    """
    agent = create_execution_agent()

    execute_task = Task(
        description=(
            f"Execute the strategy '{strategy}' via KeeperHub.\n"
            f"Call run_keeperhub_action exactly once with:\n"
            f"  name: a short workflow name like '{strategy.replace(' ', '_')}_v1'\n"
            f"  description: one sentence describing what the workflow does.\n"
            f"The tool returns a JSON object with workflow_id, execution_id, "
            f"status, and tx_hash. Quote the JSON verbatim in your output."
        ),
        expected_output=(
            "The exact JSON returned by run_keeperhub_action."
        ),
        agent=agent
    )

    improve_task = Task(
        description=(
            f"Given the execution result above for '{strategy}', do exactly two tool "
            f"calls in order:\n"
            f"1. store_strategy with strategy='one short paragraph summarising what "
            f"   you learned', version=1, agent_name='execution_agent'.\n"
            f"2. report_status_to_originator with originator_pubkey='00000000', "
            f"   status='completed', metrics='{{}}'.\n"
            f"Output the token_id and root_hash returned by store_strategy."
        ),
        expected_output=(
            "token_id and root_hash of the minted iNFT."
        ),
        agent=agent
    )

    return [execute_task, improve_task]
