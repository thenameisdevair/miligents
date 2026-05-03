# Judge-Ready Runbook

Use this before sharing the public MiliGents URL with judges.

## Host Checklist

1. Provision one Docker-capable host with persistent storage for `state-data`.
2. Point HTTPS at the API container so `/` serves `frontend/MiliGents v2.html`.
3. Set production secrets on the host, not in the repo.
4. Set `FRONTEND_ORIGIN` and `CORS_ORIGINS` to the public HTTPS origin.
5. Set `AUTH_COOKIE_SECURE=true` and `AUTH_COOKIE_SAMESITE=lax`.
6. Set `REOWN_PROJECT_ID` for wallet connection, or confirm injected wallet fallback.
7. Set `SEPOLIA_RPC_URL`; deploy gating reads the connected owner's Sepolia balance.
8. Keep `KEEPERHUB_ALLOWED_NETWORKS=sepolia` for judging unless Base has been dry-run.
9. Keep `KEEPERHUB_MAINNET_CONFIRMED=false` unless intentionally enabling Base/mainnet writes.
10. Keep `MIN_OWNER_SEPOLIA_ETH=0.5` unless you intentionally change the owner-wallet threshold.

## Sponsored Judge Start

Recommended for hackathon judging:

1. Create one dedicated KeeperHub execution wallet per expected concurrent judge organism.
2. Fund each wallet with a small capped Sepolia balance.
3. Seed the pool:

```bash
python3 scripts/seed_keeperhub_wallet_pool.py \
  --network sepolia \
  --wallet 0xYourExecutionWallet \
  --label judge-sepolia-1
```

4. Set:

```bash
KEEPERHUB_SPONSORED_START=true
KEEPERHUB_WALLET_POOL=sepolia:0xYourExecutionWallet:judge-sepolia-1
```

The UI will show "Sponsored start" and make clear that the owner wallet is
separate from the execution wallet.

## Manual Funding Mode

If sponsored start is off, judges must fund the displayed execution wallet.
The frontend sends a real `eth_sendTransaction`, records the transaction hash,
and the backend checks the deposit address through the network RPC.

Required RPC envs:

```bash
SEPOLIA_RPC_URL=...
BASE_RPC_URL=...
ETHEREUM_RPC_URL=...
```

## Dry Run

Use a fresh browser profile and a wallet with no existing organism:

1. Open the public URL.
2. Connect wallet.
3. Switch/sign on Sepolia.
4. Confirm the deploy panel shows mainnet ETH and Sepolia ETH.
5. Confirm deploy is blocked below `MIN_OWNER_SEPOLIA_ETH`.
6. Confirm the dashboard does not show the operator/default organism.
7. Create organism.
8. Confirm execution wallet or sponsored-start state is visible.
9. Open Dashboard.
10. Click Run now.
11. Confirm activity, storage records, iNFTs, KeeperHub rows, and treasury are scoped to the new organism.
12. Switch wallet and confirm old organism state clears.

## Ship Blockers To Check Manually

- Public HTTPS URL is live.
- Valid Reown project ID is configured.
- 0G service wallet is funded and labeled as platform-managed infrastructure.
- KeeperHub API keys are valid inside the container.
- At least one execution wallet is available in `KEEPERHUB_WALLET_POOL`.
- Connected owner wallet has at least `MIN_OWNER_SEPOLIA_ETH` Sepolia ETH.
- `KEEPERHUB_LIVE_EXECUTION` and spend caps match the intended demo risk.
- Sepolia explorer links open Sepolia transactions, and 0G links open 0G records.
