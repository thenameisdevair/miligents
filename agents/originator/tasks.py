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


def create_tasks(originator=None, config: dict | None = None) -> list:
    """
    Create and return all Originator tasks in execution order.

    Returns:
        List of CrewAI Task instances.
    """
    config = config or {}
    originator = originator or create_originator(config=config)
    domains = config.get("domains") or ["agentic trading", "data services"]
    domain_text = ", ".join(domains)
    risk_profile = config.get("risk_profile") or "balanced"
    max_child_agents = int(config.get("max_child_agents") or 3)
    network = config.get("network") or "sepolia"
    treasury = f"{config.get('treasury_target_amount') or '0'} {config.get('treasury_asset') or 'ETH'}"

    research_task = Task(
        description=(
            f"Research and identify exactly {min(max_child_agents, 3)} viable money-making "
            f"opportunities for this organism. Stay inside these owner-selected "
            f"domains unless a directly related adjacent opportunity is necessary: {domain_text}. "
            f"\n\nRisk profile: {risk_profile}. Network: {network}. Treasury target: {treasury}. "
            "\n\nRespect the backend policy as a hard constraint. Do not propose actions "
            "that require networks, approvals, contracts, or spend beyond policy. "
            "\n\nFor each opportunity: "
            "\n1. Search the web for current viability and market conditions "
            "\n2. Assess whether an AI agent can pursue it autonomously "
            "\n3. Estimate difficulty (low/medium/high) and time to first revenue "
            "\n4. Store a concise research note on 0G Storage using store_research tool. "
            "Keep the stored note under 1,200 words. "
            f"\n\nReturn a JSON list of exactly {min(max_child_agents, 3)} opportunities with these fields: "
            "name, description, difficulty, estimated_revenue, rationale. "
            "Keep each field short enough for an 8k context model."
        ),
        expected_output=(
            "A compact JSON list of exactly 3 opportunities. Example format: "
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
            "\n1. Read only the report summary and root_hash fields "
            "\n2. Evaluate the viability of the proposed strategy "
            "\n3. Rank opportunities by: revenue potential, execution difficulty, "
            "time to first revenue "
            "\n\nDecide which opportunities to pursue. "
            "Send INSTRUCTION messages over AXL to proceed with chosen opportunities. "
            "\n\nIf no reports received yet, document your current opportunity "
            "rankings based on your own research."
        ),
        expected_output=(
            "A compact decision summary stating which opportunities to pursue, "
            "ranked by priority, with one-sentence reasoning for each decision."
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
            "Store a concise monitoring report using store_research tool."
        ),
        expected_output=(
            "A monitoring report with: current agent statuses, "
            "performance assessment, and next action decisions."
        ),
        agent=originator
    )

    return [research_task, evaluate_task, monitor_task]
