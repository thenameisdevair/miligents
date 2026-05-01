"""
agents/execution/main.py

Entry point for the Execution Agent.
Strategy is read from EXECUTION_STRATEGY env var.
"""

import sys
import os
import signal
import threading
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))
from integrations.state_writer import write_agent_status

from crewai import Crew, Process
from agents.execution.agent import create_execution_agent
from agents.execution.tasks import create_tasks
from integrations.bridge_client import health_check
from integrations.keeperhub import health_check as keeperhub_health
from dotenv import load_dotenv

load_dotenv()


def check_dependencies():
    """Verify required services are running."""
    print("[Execution] Checking dependencies...")

    if not health_check():
        print("[Execution] WARNING: Bridge not reachable")
    else:
        print("[Execution] Bridge: OK")

    if not keeperhub_health():
        print("[Execution] WARNING: KeeperHub MCP not reachable")
    else:
        print("[Execution] KeeperHub: OK")


def run():
    """Main entry point for the Execution Agent."""
    strategy = os.getenv("EXECUTION_STRATEGY", "agentic trading research")

    print("[Execution] MiliGents Execution Agent starting...")
    print(f"[Execution] Assigned strategy: {strategy}")

    check_dependencies()

    agent = create_execution_agent()
    tasks = create_tasks(strategy=strategy)

    crew = Crew(
        agents=[agent],
        tasks=tasks,
        process=Process.sequential,
        verbose=True
    )

    def handle_shutdown(sig, frame):
        print("\n[Execution] Shutting down gracefully...")
        sys.exit(0)

    if threading.current_thread() is threading.main_thread():
        signal.signal(signal.SIGINT, handle_shutdown)
        signal.signal(signal.SIGTERM, handle_shutdown)

    print(f"[Execution] Starting execution of '{strategy}'...")
    write_agent_status("execution", "running", current_task=f"Executing strategy: {strategy}")
    print("[Execution] Press Ctrl+C to stop\n")

    try:
        result = crew.kickoff()
        print("\n[Execution] Execution complete.")
        print("[Execution] Result:", result)
        write_agent_status("execution", "complete", result=str(result))
    except KeyboardInterrupt:
        print("\n[Execution] Stopped by user.")
        write_agent_status("execution", "idle")


if __name__ == "__main__":
    run()
