"""
agents/research_specialist/tasks.py

CrewAI Tasks for the Research Specialist agent.
Tasks run sequentially: receive assignment → research → report.
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from crewai import Task
from agents.research_specialist.agent import create_specialist


def create_tasks(domain: str = "agentic trading") -> list:
    """
    Create and return all Specialist tasks in execution order.

    Args:
        domain: The industry domain to research. Passed in at
                runtime from the Originator's assignment message.

    Returns:
        List of CrewAI Task instances.
    """
    specialist = create_specialist()

    research_task = Task(
        description=(
            f"You have been assigned to research the '{domain}' domain. "
            f"\n\nYour mission: find out exactly how an autonomous AI agent "
            f"can generate consistent revenue in '{domain}'. "
            f"\n\nResearch these specific questions: "
            f"\n1. What are the specific revenue mechanisms available? "
            f"\n2. What capital or resources does an agent need to start? "
            f"\n3. What tools, APIs, or platforms are required? "
            f"\n4. What are the realistic risks and failure modes? "
            f"\n5. What does a realistic revenue estimate look like per day/week? "
            f"\n6. What is the fastest path to first revenue? "
            f"\n\nSearch the web extensively. Use multiple queries. "
            f"Go deep on specifics — not general overviews."
        ),
        expected_output=(
            f"A detailed research summary covering all 6 questions above "
            f"for the '{domain}' domain. Include specific tools, platforms, "
            f"APIs, capital requirements, and honest revenue estimates."
        ),
        agent=specialist
    )

    report_task = Task(
        description=(
            f"Structure your '{domain}' research into a final strategy report. "
            f"\n\nThe report must contain: "
            f"\n1. Executive Summary (3 sentences max) "
            f"\n2. Revenue Mechanisms (specific, numbered list) "
            f"\n3. Required Tools and APIs (with links where possible) "
            f"\n4. Capital Requirements (minimum to start) "
            f"\n5. Risk Factors (honest assessment) "
            f"\n6. Estimated Revenue (realistic daily/weekly range) "
            f"\n7. First Steps (what to do in the first 48 hours) "
            f"\n\nStore the complete report on 0G Storage using store_report tool. "
            f"The filename must be: '{domain.replace(' ', '_')}_strategy_report' "
            f"\n\nAfter storing, the root_hash will be returned. "
            f"Include it in your final answer."
        ),
        expected_output=(
            f"A structured strategy report for '{domain}' stored on 0G Storage. "
            f"Final answer must include the root_hash of the stored report."
        ),
        agent=specialist
    )

    return [research_task, report_task]
