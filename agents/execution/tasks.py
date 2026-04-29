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

    plan_task = Task(
        description=(
            f"You have been assigned to execute this strategy: '{strategy}'. "
            f"\n\nFirst, plan your execution approach: "
            f"\n1. Search the web for current market conditions relevant to this strategy "
            f"\n2. Identify the specific on-chain actions required "
            f"\n3. Use generate_keeperhub_workflow to create an appropriate "
            f"   automation workflow for this strategy "
            f"\n4. Document your execution plan clearly "
            f"\n\nBe specific about what KeeperHub workflow you will create "
            f"and what it will do."
        ),
        expected_output=(
            "A clear execution plan including: current market conditions, "
            "specific actions to take, and a KeeperHub workflow ID ready to execute."
        ),
        agent=agent
    )

    execute_task = Task(
        description=(
            f"Execute your planned strategy for '{strategy}'. "
            f"\n\nSteps: "
            f"\n1. Execute the KeeperHub workflow you created in the planning step "
            f"\n2. Check execution status to confirm it was accepted "
            f"\n3. Document the execution result honestly — success or failure "
            f"\n4. Note any issues encountered during execution "
            f"\n\nIf execution fails, document why and what you would do differently."
        ),
        expected_output=(
            "Execution result with: workflow_id used, execution_id returned, "
            "status of execution, and honest assessment of outcome."
        ),
        agent=agent
    )

    improve_task = Task(
        description=(
            f"Based on your execution results for '{strategy}': "
            f"\n\n1. Assess whether the strategy worked as expected "
            f"\n2. Identify one specific improvement to the strategy "
            f"\n3. Document the improved strategy clearly "
            f"\n4. Store the improved strategy on 0G Storage and mint an iNFT "
            f"   using store_strategy tool with version=1 and agent_name='execution_agent' "
            f"\n5. Report your performance metrics to the Originator using "
            f"   report_status_to_originator tool "
            f"   (use originator_pubkey='00000000' as placeholder if AXL not connected) "
            f"\n\nThe iNFT you mint represents your intelligence — version 1.0 "
            f"of your execution strategy."
        ),
        expected_output=(
            "Improvement summary with: what changed, why it's better, "
            "root_hash and token_id of the minted iNFT strategy."
        ),
        agent=agent
    )

    return [plan_task, execute_task, improve_task]
