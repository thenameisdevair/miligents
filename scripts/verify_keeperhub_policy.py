#!/usr/bin/env python3
"""
Verify the KeeperHub execution safety gate without calling KeeperHub.

This script only exercises local policy checks. It never sends a transaction.
"""

from __future__ import annotations

import os
import sys
import tempfile
from contextlib import contextmanager

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from integrations.execution_policy import (  # noqa: E402
    PolicyViolation,
    validate_contract_call,
    validate_transfer,
)


@contextmanager
def patched_env(values: dict[str, str]):
    previous = {key: os.environ.get(key) for key in values}
    os.environ.update(values)
    try:
        yield
    finally:
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def expect_block(label: str, fn) -> bool:
    try:
        fn()
    except PolicyViolation as e:
        print(f"[PASS] {label}: blocked ({e})")
        return True
    except Exception as e:
        print(f"[FAIL] {label}: unexpected error {type(e).__name__}: {e}")
        return False
    print(f"[FAIL] {label}: was allowed")
    return False


def expect_allow(label: str, fn) -> bool:
    try:
        result = fn()
    except Exception as e:
        print(f"[FAIL] {label}: blocked unexpectedly ({e})")
        return False
    print(f"[PASS] {label}: allowed ({result['action']})")
    return True


def main() -> int:
    checks: list[bool] = []
    with tempfile.TemporaryDirectory() as state_dir:
        base_env = {
            "STATE_DIR": state_dir,
            "KEEPERHUB_LIVE_EXECUTION": "false",
            "KEEPERHUB_ALLOWED_NETWORKS": "sepolia",
            "KEEPERHUB_MAX_TX_ETH": "0.001",
            "KEEPERHUB_MAX_DAILY_SPEND_ETH": "0.005",
            "KEEPERHUB_ALLOWED_CONTRACTS": "",
            "KEEPERHUB_ALLOWED_FUNCTIONS": "",
            "KEEPERHUB_ALLOW_APPROVALS": "false",
            "KEEPERHUB_MAINNET_CONFIRMED": "false",
        }
        with patched_env(base_env):
            checks.append(expect_block(
                "default deny",
                lambda: validate_transfer("sepolia", "0x0000000000000000000000000000000000000001", "0.0001"),
            ))

        live_env = {
            **base_env,
            "KEEPERHUB_LIVE_EXECUTION": "true",
            "KEEPERHUB_ALLOWED_CONTRACTS": "0x0000000000000000000000000000000000000002",
            "KEEPERHUB_ALLOWED_FUNCTIONS": "setvalue",
        }
        with patched_env(live_env):
            checks.append(expect_allow(
                "small sepolia transfer",
                lambda: validate_transfer("sepolia", "0x0000000000000000000000000000000000000001", "0.0001"),
            ))
            checks.append(expect_block(
                "per tx cap",
                lambda: validate_transfer("sepolia", "0x0000000000000000000000000000000000000001", "0.01"),
            ))
            checks.append(expect_block(
                "network allowlist",
                lambda: validate_transfer("base", "0x0000000000000000000000000000000000000001", "0.0001"),
            ))
            checks.append(expect_block(
                "contract allowlist",
                lambda: validate_contract_call(
                    "sepolia",
                    "0x0000000000000000000000000000000000000003",
                    "setValue",
                ),
            ))
            checks.append(expect_allow(
                "allowed contract call",
                lambda: validate_contract_call(
                    "sepolia",
                    "0x0000000000000000000000000000000000000002",
                    "setValue",
                ),
            ))

        approval_env = {
            **live_env,
            "KEEPERHUB_ALLOWED_FUNCTIONS": "setvalue,approve",
        }
        with patched_env(approval_env):
            checks.append(expect_block(
                "dangerous approval",
                lambda: validate_contract_call(
                    "sepolia",
                    "0x0000000000000000000000000000000000000002",
                    "approve",
                ),
            ))

        with tempfile.TemporaryDirectory() as spend_dir:
            spend_env = {
                **base_env,
                "STATE_DIR": spend_dir,
                "KEEPERHUB_LIVE_EXECUTION": "true",
                "KEEPERHUB_MAX_TX_ETH": "0.001",
                "KEEPERHUB_MAX_DAILY_SPEND_ETH": "0.0002",
            }
            with patched_env(spend_env):
                checks.append(expect_allow(
                    "daily spend first reservation",
                    lambda: validate_transfer("sepolia", "0x0000000000000000000000000000000000000001", "0.00015"),
                ))
                checks.append(expect_block(
                    "daily spend cap",
                    lambda: validate_transfer("sepolia", "0x0000000000000000000000000000000000000001", "0.0001"),
                ))

        mainnet_env = {
            **live_env,
            "KEEPERHUB_ALLOWED_NETWORKS": "sepolia,base",
        }
        with patched_env(mainnet_env):
            checks.append(expect_block(
                "mainnet confirmation",
                lambda: validate_transfer("base", "0x0000000000000000000000000000000000000001", "0.0001"),
            ))

    ok = all(checks)
    print()
    print("RESULT:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
