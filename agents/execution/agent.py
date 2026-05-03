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


def create_execution_agent(config: dict | None = None) -> Agent:
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

    config = config or {}
    policy = config.get("policy") or {}
    wallet = config.get("execution_wallet") or "server-assigned execution wallet"
    network = config.get("network") or "sepolia"
    risk_profile = config.get("risk_profile") or "balanced"
    allowed_actions = ", ".join(policy.get("allowed_functions") or []) or "workflow actions allowed by policy"

    return Agent(
        role="Execution Agent",
        goal=(
            "Execute one assigned strategy via KeeperHub, mint one iNFT proof, "
            f"and report completion for organism {config.get('organism_id') or 'local-default'} "
            f"on {network}."
        ),
        backstory=(
            "You are a compact execution worker. Use only the required tools and "
            "keep outputs short. "
            f"Risk stance: {risk_profile}. Execution wallet: {wallet}. "
            f"Allowed action summary: {allowed_actions}. "
            f"Max tx ETH: {policy.get('max_tx_eth', '0')}; daily cap ETH: {policy.get('max_daily_spend_eth', '0')}. "
            "Do not choose wallets or bypass policy; the server resolves execution identity."
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
