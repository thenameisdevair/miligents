# Deploy Organism PRD

## Goal

Turn the current single hardcoded MiliGents organism into a real user-owned organism deployment flow.

The Deploy page already promises that a user can connect a wallet, configure treasury/risk/domains, and deploy an organism. The backend does not yet have the ownership, funding, per-organism wallet, or policy model needed to make that true. This PRD defines the real implementation.

No fake deploys. If a piece is not actually live, the UI must say what is missing.

---

## Core Decision

Use this model:

```text
Owner wallet = identity, ownership, permissions, withdrawals
KeeperHub wallet = per-organism autonomous execution wallet
0G service wallet = platform-managed storage and iNFT infrastructure
Organism record = binding/accounting/policy layer
```

Important:

- A connected user wallet does not let agents spend user funds.
- A KeeperHub wallet is the wallet that can actually execute autonomous transactions.
- Each organism must have its own KeeperHub execution wallet/address or wallet reference.
- Agents must never choose which wallet to spend from.
- Agents only act through `organism_id`; backend resolves the correct wallet and policy.

---

## Wallet/Auth Choice

### First implementation: Reown AppKit

Use Reown AppKit for wallet connection and SIWX/SIWE-style owner authentication.

Why:

- It fits the current need: prove owner wallet control with a signed message.
- It supports wallet connections through WalletConnect/AppKit.
- It supports email/social onboarding if we decide to expose it, while keeping wallet ownership central.
- It has JavaScript support, which fits the current single-file frontend better than a full React auth migration.
- Reown docs recommend SIWX for new multichain auth, while SIWE remains available for EVM-only.

### Optional later: Privy

Use Privy later only if we decide MiliGents should be Google/email-first with embedded wallets and more managed user auth.

Privy is strong for:

- embedded wallets
- social/email login
- server wallet infrastructure
- user account management

But the first live deploy problem is not "make a wallet for the user." It is "prove who owns the organism and bind that owner to an execution wallet and policy." Reown is enough for that first version.

---

## Non-Negotiable Safety Rules

1. No shared pooled user funds for production organisms.
2. No organism can spend from another organism's execution wallet.
3. `organism_id` is required for every live KeeperHub write.
4. Backend resolves `organism_id -> keeperhub_wallet_address`.
5. Agents never receive arbitrary wallet/private-key control.
6. User wallet signatures create/control organisms; they do not automatically grant agent spending rights.
7. 0G service wallet can be platform-managed initially, but this must be explicit in the UI/docs.
8. All live execution remains behind the KeeperHub policy gate.
9. Mainnet/Base execution requires both allowed network and explicit mainnet confirmation.

---

## What The Current Frontend Promises

In `frontend/MiliGents v2.html`, the Deploy page currently shows:

- Treasury allocation input
- ETH/USDC/0G selector
- Operator wallet connected through WalletConnect
- Research domain chips
- Max child agents slider
- Risk profile selector
- Treasury allocation bars
- Deploy organism button
- System preflight panel
- Bridge, AXL, KeeperHub, 0G Storage checks

Backend gap:

- No real wallet connect session.
- No signed ownership message.
- No `organisms` table.
- No deploy API.
- No per-organism policy.
- No per-organism KeeperHub execution wallet.
- No funding record.
- No organism-specific dashboard query.
- No start/pause/resume per organism.

---

## Architecture

### Ownership flow

```text
1. User opens Deploy page
2. User connects owner wallet with Reown AppKit
3. Frontend requests nonce from backend
4. User signs "Create MiliGents organism" message
5. Backend verifies signature
6. Backend creates/updates owner session
7. User submits organism config
8. Backend creates organism record
9. Backend returns organism_id and funding/execution-wallet instructions
```

### Funding flow

First production-ready target:

```text
1. Organism has a dedicated KeeperHub wallet/address
2. Frontend shows "Fund this organism execution wallet"
3. User sends funds to that wallet
4. Backend verifies balance/tx on selected network RPC
5. Organism status becomes funded
6. Scheduler/agents can run only within that organism's policy
```

Do not use a shared platform execution wallet for user deposits except for internal testing.

### Execution flow

```text
1. Scheduler selects active organism
2. Agent proposes action for organism_id
3. Backend loads organism policy
4. Backend loads organism KeeperHub wallet reference
5. Backend validates network, amount, contract, function, daily cap
6. Backend calls KeeperHub
7. KeeperHub signs/sends from the organism execution wallet
8. Backend writes tx/execution record against organism_id
9. Frontend shows result under that organism only
```

### 0G flow

First version:

```text
Platform 0G service wallet pays storage/iNFT infra.
Organism records still store owner_wallet and organism_id.
Every storage record and iNFT record must include organism_id.
```

Later:

```text
Per-organism 0G wallet or account abstraction wallet.
User funds 0G costs per organism.
```

---

## Backend Implementation

### New tables

Add to `integrations/state_writer.py`.

#### `organisms`

```sql
CREATE TABLE IF NOT EXISTS organisms (
    organism_id              TEXT PRIMARY KEY,
    owner_wallet             TEXT NOT NULL,
    owner_chain_id           INTEGER,
    status                   TEXT NOT NULL DEFAULT 'created',
    name                     TEXT,
    risk_profile             TEXT NOT NULL DEFAULT 'balanced',
    max_child_agents         INTEGER NOT NULL DEFAULT 3,
    domains                  TEXT,
    treasury_target_amount   TEXT,
    treasury_asset           TEXT,
    keeperhub_wallet_address TEXT,
    keeperhub_wallet_label   TEXT,
    og_wallet_mode           TEXT NOT NULL DEFAULT 'platform',
    created_at               TEXT NOT NULL,
    updated_at               TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS organisms_owner_idx
    ON organisms(owner_wallet);
```

Status values:

- `created`
- `needs_execution_wallet`
- `needs_funding`
- `funded`
- `active`
- `paused`
- `error`

#### `organism_policy`

```sql
CREATE TABLE IF NOT EXISTS organism_policy (
    organism_id             TEXT PRIMARY KEY,
    live_execution          INTEGER NOT NULL DEFAULT 0,
    allowed_networks        TEXT NOT NULL DEFAULT 'sepolia',
    allowed_contracts       TEXT,
    allowed_functions       TEXT,
    max_tx_eth              TEXT NOT NULL DEFAULT '0.001',
    max_daily_spend_eth     TEXT NOT NULL DEFAULT '0.005',
    allow_approvals         INTEGER NOT NULL DEFAULT 0,
    mainnet_confirmed       INTEGER NOT NULL DEFAULT 0,
    created_at              TEXT NOT NULL,
    updated_at              TEXT NOT NULL,
    FOREIGN KEY (organism_id) REFERENCES organisms(organism_id)
);
```

#### `organism_funding`

```sql
CREATE TABLE IF NOT EXISTS organism_funding (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    organism_id         TEXT NOT NULL,
    network             TEXT NOT NULL,
    asset               TEXT NOT NULL,
    deposit_address     TEXT NOT NULL,
    expected_amount     TEXT,
    received_amount     TEXT,
    funding_tx          TEXT,
    status              TEXT NOT NULL DEFAULT 'pending',
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    FOREIGN KEY (organism_id) REFERENCES organisms(organism_id)
);
CREATE INDEX IF NOT EXISTS organism_funding_org_idx
    ON organism_funding(organism_id);
```

#### `organism_execution`

```sql
CREATE TABLE IF NOT EXISTS organism_execution (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    organism_id      TEXT NOT NULL,
    agent_id         TEXT NOT NULL,
    network          TEXT,
    action_type      TEXT,
    execution_id     TEXT,
    tx_hash          TEXT,
    status           TEXT,
    amount_eth       TEXT,
    details          TEXT,
    timestamp        TEXT NOT NULL,
    FOREIGN KEY (organism_id) REFERENCES organisms(organism_id)
);
CREATE INDEX IF NOT EXISTS organism_execution_org_ts
    ON organism_execution(organism_id, timestamp DESC);
```

#### `keeperhub_wallet_pool`

Use this until KeeperHub wallet creation is automated through API.

```sql
CREATE TABLE IF NOT EXISTS keeperhub_wallet_pool (
    wallet_address        TEXT PRIMARY KEY,
    wallet_label          TEXT,
    network               TEXT NOT NULL,
    status                TEXT NOT NULL DEFAULT 'available',
    assigned_organism_id  TEXT,
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL,
    FOREIGN KEY (assigned_organism_id) REFERENCES organisms(organism_id)
);
CREATE INDEX IF NOT EXISTS keeperhub_wallet_pool_status_idx
    ON keeperhub_wallet_pool(status, network);
```

Status values:

- `available`
- `assigned`
- `disabled`

### Add `organism_id` to existing tables

Add nullable `organism_id` columns to:

- `agents`
- `axl_messages`
- `storage_records`
- `keeperhub_tasks`
- `infts`
- `treasury_snapshots`
- `cycles`
- `activity`

Migration rule:

- Existing records can be assigned to a default organism: `local-default`.
- Do not break current dashboard queries.

---

## API Implementation

### Auth/session

Use signed wallet messages; do not trust a raw wallet address from the frontend.

Endpoints:

```text
GET  /api/auth/nonce?address=0x...
POST /api/auth/verify
GET  /api/auth/session
POST /api/auth/logout
```

`POST /api/auth/verify` body:

```json
{
  "address": "0x...",
  "chain_id": 11155111,
  "message": "...",
  "signature": "0x..."
}
```

Backend checks:

- nonce exists and is unused
- domain/uri matches configured frontend
- message statement is expected
- signature recovers wallet address
- nonce is consumed

Session can be simple for now:

- `HttpOnly` cookie if hosted behind same domain
- or bearer session token for local/dev

### Organism APIs

```text
POST /api/organisms
GET  /api/organisms
GET  /api/organisms/{organism_id}
PATCH /api/organisms/{organism_id}
POST /api/organisms/{organism_id}/pause
POST /api/organisms/{organism_id}/resume
```

`POST /api/organisms` requires verified owner session.

Request:

```json
{
  "name": "My First Organism",
  "domains": ["DeFi Trading", "Data Services"],
  "risk_profile": "balanced",
  "max_child_agents": 3,
  "treasury_target_amount": "0.01",
  "treasury_asset": "ETH",
  "network": "sepolia",
  "keeperhub_wallet_address": "0x..."
}
```

Response:

```json
{
  "organism_id": "org_...",
  "status": "needs_funding",
  "owner_wallet": "0x...",
  "keeperhub_wallet_address": "0x...",
  "funding": {
    "network": "sepolia",
    "asset": "ETH",
    "deposit_address": "0x...",
    "expected_amount": "0.01"
  },
  "policy": {
    "live_execution": false,
    "allowed_networks": ["sepolia"],
    "max_tx_eth": "0.001",
    "max_daily_spend_eth": "0.005"
  }
}
```

### Funding APIs

```text
GET  /api/organisms/{organism_id}/funding
POST /api/organisms/{organism_id}/funding/check
POST /api/organisms/{organism_id}/funding/tx
```

`funding/check` reads network balance or tx status and updates funding state.

Required RPC support:

```text
OG_RPC_URL
SEPOLIA_RPC_URL
BASE_RPC_URL
ETHEREUM_RPC_URL optional
```

Do not use only `OG_RPC_URL` for all balances. Balance reading must be network-aware.

### Policy APIs

```text
GET   /api/organisms/{organism_id}/policy
PATCH /api/organisms/{organism_id}/policy
```

Only the owner wallet can update policy.

Mainnet rule:

- `allowed_networks` may include `base`.
- But live Base/mainnet execution requires `mainnet_confirmed=true`.
- UI must show this as an explicit arming step.

### Execution APIs

Replace global KeeperHub test endpoint with organism-scoped endpoint:

```text
POST /api/organisms/{organism_id}/keeperhub/test-transfer
```

All KeeperHub write endpoints must:

1. verify owner/session if manually triggered
2. load organism
3. load organism policy
4. resolve organism KeeperHub wallet
5. enforce policy
6. call KeeperHub
7. write `organism_execution` and `keeperhub_tasks` with `organism_id`

---

## Frontend Implementation

### Deploy page must become real

Current Deploy page fields map as:

| Frontend field | Backend field |
|---|---|
| Treasury allocation | `treasury_target_amount`, `treasury_asset` |
| Operator wallet | `owner_wallet` from Reown session |
| Research domains | `domains` JSON |
| Max child agents | `max_child_agents` |
| Risk profile | `risk_profile` |
| Deploy organism | `POST /api/organisms` |
| Preflight | `/api/services`, `/api/auth/session`, `/api/organisms/{id}/funding`, `/api/organisms/{id}/policy` |

### Required frontend states

- `not_connected`
- `connected_not_signed`
- `signed_ready_to_deploy`
- `creating_organism`
- `needs_execution_wallet`
- `needs_funding`
- `funding_detected`
- `active`
- `paused`
- `error`

### Deploy button behavior

Button text should change by state:

- `Connect wallet`
- `Sign to create organism`
- `Create organism`
- `Fund execution wallet`
- `Check funding`
- `Activate organism`
- `Open dashboard`

Do not show "Deploy organism" if the wallet is not connected and signed.

### Dashboard filtering

Dashboard must read active organism:

```text
/api/organisms/{organism_id}
/api/activity/grouped?organism_id=...
/api/infts?organism_id=...
/api/storage?organism_id=...
/api/tasks?organism_id=...
/api/treasury?organism_id=...
```

If no `organism_id` is selected, show "Select or deploy an organism."

---

## Backend/Frontend Contract

The frontend must never infer ownership from localStorage alone.

Allowed:

- localStorage stores last selected `organism_id`
- backend session proves the wallet
- backend checks that session owner owns the organism

Disallowed:

- frontend sends `owner_wallet` and backend trusts it
- frontend chooses KeeperHub wallet at execution time
- agent tool accepts arbitrary `from_wallet`
- shared wallet pool with only frontend labels

---

## KeeperHub Wallet Model

First implementation should abstract KeeperHub from the user.

The user should not need to create a KeeperHub account or understand KeeperHub wallet internals. They should see one concrete thing:

```text
This is the execution wallet address for your organism. Fund only this address.
```

Backend/admin responsibility:

- create or assign a dedicated KeeperHub execution wallet for each organism
- store that wallet address/reference on the organism record
- expose only the deposit address and execution status to the frontend
- never allow one organism to reuse another organism's execution wallet

If KeeperHub does not expose wallet creation through API yet, use an admin-preprovisioned wallet pool:

```text
keeperhub_wallet_pool
- wallet_address
- wallet_label
- status: available | assigned | disabled
- assigned_organism_id
```

Deploy flow then becomes:

```text
1. User signs ownership message
2. User submits organism config
3. Backend assigns an available KeeperHub wallet from the pool
4. Backend creates organism + policy + funding row
5. Frontend shows the organism execution wallet deposit address
```

If no wallet is available, organism status is `needs_execution_wallet` and the UI must say that execution wallet provisioning is pending.

Required UI copy:

```text
This is the execution wallet for this organism. Agents can only spend from this wallet within your policy limits.
```

Later automation options:

- use KeeperHub API if wallet creation becomes available
- integrate Privy/server-wallet fleet for per-organism execution wallets
- add smart contract vault per organism

Do not block the first real organism deploy on fully automated wallet creation if KeeperHub requires manual wallet setup. Use the wallet pool as the bridge, but keep ownership, funding, and execution accounting real.

---

## 0G Wallet Model

First implementation uses platform-managed 0G service wallet:

- storage uploads
- iNFT mints
- 0G gas/storage fees

Every 0G record must still include `organism_id` and `owner_wallet`.

UI copy:

```text
0G storage and iNFT minting are handled by MiliGents infrastructure. Your execution funds remain in your organism's KeeperHub wallet.
```

Future version:

- per-organism 0G wallet
- user-funded 0G storage/minting
- withdrawal/refund accounting for 0G credits

---

## Scheduler Changes

Current scheduler runs one global organism. It must become organism-aware.

Behavior:

```text
1. Query active organisms
2. For each organism:
   - set current organism context
   - set current cycle_id
   - trigger originator/specialist/execution with organism_id
3. Write all activity/cycles with organism_id
```

Agent server `/run` endpoints should accept:

```json
{
  "organism_id": "org_...",
  "cycle_id": "cycle_..."
}
```

If omitted, use `local-default` for backward compatibility.

---

## Security Checks

Always check:

- owner wallet signature is verified server-side
- nonce cannot be reused
- organism belongs to session owner before returning private state
- KeeperHub wallet belongs to organism record
- policy is loaded by organism_id, not global env only
- daily spend ledger is per organism and per network
- mainnet execution requires explicit arming
- approvals are blocked by default
- contract/function allowlists are enforced
- no private keys are returned to frontend
- no `.env` secrets are committed

---

## Acceptance Criteria

1. User can connect wallet through Reown.
2. User signs an ownership message.
3. Backend verifies signature and creates owner session.
4. Deploy page creates a real organism record.
5. Organism has owner wallet, domains, risk profile, max child agents, treasury target.
6. Organism has a dedicated KeeperHub execution wallet/address.
7. Funding page/check maps funds to the correct organism.
8. KeeperHub execution can only run for an organism if policy allows it.
9. Storage, iNFT, AXL, activity, cycles, KeeperHub tasks all include organism_id.
10. Dashboard can filter to one organism.
11. Existing local-default organism still works.
12. No other organism can spend or display another organism's funds.

---

## Build Order

### 1. Schema

- add organism tables
- add `organism_id` nullable columns to existing tables
- create `local-default` organism migration

### 2. Auth

- Reown AppKit connect button
- nonce endpoint
- verify signed message endpoint
- owner session endpoint

### 3. Create Organism

- `POST /api/organisms`
- create organism policy
- create funding row
- return funding instructions

### 4. Deploy Frontend Wiring

- connect wallet button real
- deploy form submits to backend
- deploy state machine
- preflight uses backend signals

### 5. Network-Aware Balances

- add `SEPOLIA_RPC_URL`, `BASE_RPC_URL`
- add balance helper by network
- funding check endpoint

### 6. Organism-Scoped KeeperHub

- require `organism_id` for direct execution
- policy per organism
- spend ledger per organism
- records with organism_id

### 7. Dashboard Filtering

- all key APIs accept `organism_id`
- frontend uses selected organism
- local-default fallback remains

### 8. Scheduler/Agent Context

- scheduler loops active organisms
- agent `/run` accepts organism_id
- write_activity and state writer attach organism_id

### 9. Production Hardening

- domain allowlist for signatures
- secure cookies/session storage
- rate limits on deploy/funding checks
- secret management docs
- backup/export story for state.db

---

## Open Questions

1. Does KeeperHub expose API support to create/list organization wallets, or must users configure wallets manually?
2. Can KeeperHub direct execution target a specific wallet if multiple org wallets exist?
3. Do we want each organism to run in one shared Docker stack with organism_id separation, or eventually one stack per organism?
4. Should platform-managed 0G cost be free, subscription-based, or deducted from organism funding later?
5. Do we want Privy embedded wallets for users without browser wallets in the next product phase?

---

## Sources Checked

- Reown AppKit SIWE/SIWX docs: https://docs.reown.com/appkit/react/core/siwe
- Reown AppKit JavaScript SIWE docs: https://docs.reown.com/appkit/javascript/core/siwe
- Reown AppKit email/social docs: https://docs.reown.com/appkit/react/core/socials
- Reown overview: https://docs.reown.com/appkit/overview
- Privy React quickstart: https://docs.privy.io/basics/react/quickstart
- Privy embedded/server wallet overview: https://docs.privy.io/guide/server-wallets
- Privy wallet SIWE docs: https://docs.privy.io/authentication/user-authentication/login-methods/wallet
- Privy connected wallets docs: https://docs.privy.io/wallets/wallets/get-a-wallet/get-connected-wallet
- Privy wallet export docs: https://docs.privy.io/wallets/wallets/export
