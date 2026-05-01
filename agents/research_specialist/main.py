"""
agents/research_specialist/main.py

Entry point for the Research Specialist agent.
Accepts a domain assignment via environment variable or
waits for an AXL assignment from the Originator.
"""

import sys
import os
import signal
import threading
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))
from integrations.state_writer import write_agent_status

from crewai import Crew, Process
from agents.research_specialist.agent import create_specialist
from agents.research_specialist.tasks import create_tasks
from integrations.bridge_client import health_check
from dotenv import load_dotenv

load_dotenv()


def check_dependencies():
    """Verify required services are running."""
    print("[Specialist] Checking dependencies...")
    if not health_check():
        print("[Specialist] WARNING: Bridge not reachable")
    else:
        print("[Specialist] Bridge: OK")


def run():
    """
    Main entry point for the Research Specialist.
    Domain is read from SPECIALIST_DOMAIN env var.
    Defaults to 'agentic trading' if not set.
    """
    domain = os.getenv("SPECIALIST_DOMAIN", "agentic trading")

    print("[Specialist] MiliGents Research Specialist starting...")
    print(f"[Specialist] Assigned domain: {domain}")

    check_dependencies()

    specialist = create_specialist()
    tasks = create_tasks(domain=domain)

    crew = Crew(
        agents=[specialist],
        tasks=tasks,
        process=Process.sequential,
        verbose=True
    )

    def handle_shutdown(sig, frame):
        print("\n[Specialist] Shutting down gracefully...")
        sys.exit(0)

    if threading.current_thread() is threading.main_thread():
        signal.signal(signal.SIGINT, handle_shutdown)
        signal.signal(signal.SIGTERM, handle_shutdown)

    print(f"[Specialist] Starting research on '{domain}'...")
    write_agent_status("specialist", "running", current_task=f"Researching domain: {domain}")
    print("[Specialist] Press Ctrl+C to stop\n")

    try:
        result = crew.kickoff()
        print("\n[Specialist] Research complete.")
        print("[Specialist] Result:", result)
        write_agent_status("specialist", "complete", result=str(result))
    except KeyboardInterrupt:
        print("\n[Specialist] Stopped by user.")
        write_agent_status("specialist", "idle")


if __name__ == "__main__":
    run()
