#!/usr/bin/env python3
"""
Verify Phase 3.5 live activity acceptance checks against a running API.

Usage:
    python3 scripts/verify_phase_3_5.py
    python3 scripts/verify_phase_3_5.py --api http://localhost:8081 --fresh-seconds 300
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any


AGENTS = ("originator", "specialist", "execution", "scheduler")


def fetch_json(base_url: str, path: str, timeout: float) -> dict[str, Any]:
    url = base_url.rstrip("/") + path
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            body = res.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{path} returned HTTP {e.code}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"{path} unreachable: {e.reason}") from e

    try:
        return json.loads(body)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"{path} returned non-JSON response") from e


def parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def age_seconds(value: str | None) -> float | None:
    ts = parse_time(value)
    if not ts:
        return None
    if not ts.tzinfo:
        ts = ts.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - ts.astimezone(timezone.utc)).total_seconds()


def newest_event(rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not rows:
        return None
    return max(rows, key=lambda row: row.get("id") or 0)


def ok_line(label: str, detail: str) -> str:
    return f"[PASS] {label}: {detail}"


def fail_line(label: str, detail: str) -> str:
    return f"[FAIL] {label}: {detail}"


def warn_line(label: str, detail: str) -> str:
    return f"[WARN] {label}: {detail}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify Phase 3.5 live activity.")
    parser.add_argument("--api", default="http://localhost:8081", help="API base URL")
    parser.add_argument("--fresh-seconds", type=int, default=300, help="Max age for newest lane event")
    parser.add_argument("--min-per-agent", type=int, default=1, help="Minimum events required in each lane")
    parser.add_argument("--activity-limit", type=int, default=200, help="Rows to sample from /api/activity")
    parser.add_argument("--max-recent-events", type=int, default=120, help="Max recent activity rows allowed in the freshness window")
    parser.add_argument("--timeout", type=float, default=5.0, help="HTTP timeout in seconds")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON")
    args = parser.parse_args()

    checks: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []

    def add(status: str, label: str, detail: str, extra: dict[str, Any] | None = None) -> None:
        checks.append({"status": status, "label": label, "detail": detail, **(extra or {})})

    def warn(label: str, detail: str, extra: dict[str, Any] | None = None) -> None:
        warnings.append({"status": "warn", "label": label, "detail": detail, **(extra or {})})

    try:
        health = fetch_json(args.api, "/api/health", args.timeout)
        add("pass", "api health", health.get("status", "unknown"))
    except RuntimeError as e:
        add("fail", "api health", str(e))
        return emit(args.json, checks, warnings)

    try:
        grouped = fetch_json(args.api, "/api/activity/grouped?limit_per_agent=15", args.timeout)
        lanes = grouped.get("agents") or {}
        add("pass", "activity grouped endpoint", f"{len(lanes)} lanes returned")
    except RuntimeError as e:
        add("fail", "activity grouped endpoint", str(e))
        return emit(args.json, checks, warnings)

    for agent_id in AGENTS:
        rows = lanes.get(agent_id)
        if not isinstance(rows, list):
            add("fail", f"{agent_id} lane", "missing or not a list")
            continue

        if len(rows) < args.min_per_agent:
            add("fail", f"{agent_id} lane", f"{len(rows)} events; expected >= {args.min_per_agent}")
            continue

        event = newest_event(rows)
        age = age_seconds(event.get("timestamp") if event else None)
        if age is None:
            add("fail", f"{agent_id} freshness", "newest event has invalid timestamp")
        elif age > args.fresh_seconds:
            add(
                "fail",
                f"{agent_id} freshness",
                f"newest event is {int(age)}s old; expected <= {args.fresh_seconds}s",
                {"latest_summary": event.get("summary") if event else None},
            )
        else:
            add(
                "pass",
                f"{agent_id} lane",
                f"{len(rows)} events; newest {int(age)}s old",
                {"latest_summary": event.get("summary") if event else None},
            )

    try:
        activity = fetch_json(args.api, f"/api/activity?limit={args.activity_limit}", args.timeout)
        activity_rows = activity.get("activity") or []
        recent_rows = [
            row for row in activity_rows
            if (age := age_seconds(row.get("timestamp"))) is not None and age <= args.fresh_seconds
        ]
        recent_count = len(recent_rows)
        minimum = len(AGENTS) * args.min_per_agent
        if recent_count < minimum:
            add("fail", "recent activity volume", f"{recent_count} recent rows; expected >= {minimum}")
        elif recent_count > args.max_recent_events:
            add("fail", "recent activity volume", f"{recent_count} recent rows; expected <= {args.max_recent_events}")
        else:
            add("pass", "recent activity volume", f"{recent_count} recent rows")

        if len(activity_rows) >= args.activity_limit:
            warn("activity sample", f"sample hit limit {args.activity_limit}; old state may contain more rows")
    except RuntimeError as e:
        add("fail", "recent activity volume", str(e))

    optional_endpoints = (
        ("agents", "/api/agents", "agents"),
        ("axl", "/api/axl?limit=5", "messages"),
        ("storage", "/api/storage?limit=5", "records"),
        ("infts", "/api/infts?limit=5", "infts"),
    )
    for label, path, key in optional_endpoints:
        try:
            payload = fetch_json(args.api, path, args.timeout)
            items = payload.get(key) or []
            if items:
                warn(label, f"{len(items)} recent records visible", {"ok": True})
            else:
                warn(label, "no recent records visible yet; run a cycle or proof run")
        except RuntimeError as e:
            warn(label, str(e))

    return emit(args.json, checks, warnings)


def emit(as_json: bool, checks: list[dict[str, Any]], warnings: list[dict[str, Any]]) -> int:
    failed = [row for row in checks if row["status"] == "fail"]
    if as_json:
        print(json.dumps({"ok": not failed, "checks": checks, "warnings": warnings}, indent=2))
    else:
        print("Phase 3.5 verification")
        print("----------------------")
        for row in checks:
            if row["status"] == "pass":
                print(ok_line(row["label"], row["detail"]))
            else:
                print(fail_line(row["label"], row["detail"]))
            if row.get("latest_summary"):
                print(f"       latest: {row['latest_summary']}")
        for row in warnings:
            print(warn_line(row["label"], row["detail"]))
        print()
        print("RESULT:", "PASS" if not failed else "FAIL")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
