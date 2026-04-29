"""
agents/originator/main.py

Entry point for the Originator agent.
Run this to start the MiliGents autonomous agent organism.
"""

import sys
import os
import signal
import time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from crewai import Crew, Process
from agents.originator.agent import create_originator
from agents.originator.tasks import create_tasks
from integrations.bridge_client import health_check
from dotenv import load_dotenv

load_dotenv()

def check_dependencies():
    """
    Verify all required services are running before starting.
    """
    print("[Originator] Checking dependencies...")

    # Check bridge
    if not health_check():
        print("[Originator] WARNING: Bridge service not reachable at BRIDGE_URL")
        print("[Originator] Start the bridge: cd bridge && npm start")
    else:
        print("[Originator] Bridge: OK")

    print("[Originator] Dependencies checked.")


def run():
    """
    Main entry point — start the Originator research loop.
    """
    print("[Originator] MiliGents Autonomous Agent Organism starting...")
    print("[Originator] Role: Chief Executive Agent")

    check_dependencies()

    originator = create_originator()
    tasks = create_tasks()

    crew = Crew(
        agents=[originator],
        tasks=tasks,
        process=Process.sequential,
        verbose=True
    )

    print("[Originator] Starting research loop...")
    print("[Originator] Press Ctrl+C to stop gracefully\n")

    def handle_shutdown(sig, frame):
        print("\n[Originator] Shutting down gracefully...")
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)

    try:
        result = crew.kickoff()
        print("\n[Originator] Research loop complete.")
        print("[Originator] Result:", result)
    except KeyboardInterrupt:
        print("\n[Originator] Stopped by user.")


if __name__ == "__main__":
    run()
