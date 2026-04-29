"""
agents/originator/tasks.py

CrewAI Tasks for the Originator agent.
Each task maps to one phase of the Originator's decision loop.
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from crewai import Task
from agents.originator.agent import create_originator


def create_tasks() -> list:
    """
    Create and return all Originator tasks in execution order.

    Returns:
        List of CrewAI Task instances.
    """
    originator = create_originator()

    research_task = Task(
        description=(
            "Research and identify exactly 3 viable money-making opportunities "
            "for an autonomous AI agent operating with a limited treasury. "
            "\n\nConsider these categories: agentic trading, content creation "
            "services, data research services, arbitrage, and API service reselling. "
            "\n\nFor each opportunity: "
            "\n1. Search the web for current viability and market conditions "
            "\n2. Assess whether an AI agent can pursue it autonomously "
            "\n3. Estimate difficulty (low/medium/high) and time to first revenue "
            "\n4. Store your complete research on 0G Storage using store_research tool "
            "\n\nReturn a JSON list of exactly 3 opportunities with these fields: "
            "name, description, difficulty, estimated_revenue, rationale"
        ),
        expected_output=(
            "A JSON list of exactly 3 opportunities. Example format: "
            '[{"name": "Agentic Trading", "description": "...", '
            '"difficulty": "medium", "estimated_revenue": "$50-200/day", '
            '"rationale": "..."}]'
        ),
        agent=originator
    )

    evaluate_task = Task(
        description=(
            "Check your AXL inbox for REPORT messages from Research Specialists. "
            "\n\nFor each report received: "
            "\n1. Read the report content "
            "\n2. Evaluate the viability of the proposed strategy "
            "\n3. Rank opportunities by: revenue potential, execution difficulty, "
            "time to first revenue "
            "\n\nDecide which opportunities to pursue. "
            "Send INSTRUCTION messages over AXL to proceed with chosen opportunities. "
            "\n\nIf no reports received yet, document your current opportunity "
            "rankings based on your own research."
        ),
        expected_output=(
            "A decision summary stating which opportunities to pursue, "
            "ranked by priority, with clear reasoning for each decision."
        ),
        agent=originator
    )

    monitor_task = Task(
        description=(
            "Check your AXL inbox for STATUS messages from Execution Agents. "
            "\n\nFor each status received: "
            "\n1. Read performance metrics "
            "\n2. Assess whether the strategy is working "
            "\n3. Decide: continue, adjust, or expand "
            "\n\nDocument your monitoring report and next planned actions. "
            "Store the monitoring report using store_research tool."
        ),
        expected_output=(
            "A monitoring report with: current agent statuses, "
            "performance assessment, and next action decisions."
        ),
        agent=originator
    )

    return [research_task, evaluate_task, monitor_task]
