# MiliGents

> An Autonomous Agent Organism that researches opportunities, builds a company,
> and mints its own intelligence as tradeable NFTs on-chain.

Built for the **ETHGlobal OpenAgents Hackathon** — April 24 – May 6, 2026.

---

## What It Does

Deploy MiliGents with a small treasury. It wakes up and runs itself.

1. The **Originator** agent researches money-making opportunities using live web search
2. It spawns a **Research Specialist** per opportunity — each one deep-dives one industry and stores its report permanently on 0G Storage
3. It spawns an **Execution Agent** per strategy — each one creates and executes KeeperHub workflows on-chain, measures results, and self-improves
4. Every strategy improvement is minted as a versioned **iNFT (ERC-7857)** — the agent's intelligence becomes a tradeable on-chain asset

No human intervention required after deployment.

---

## Demo

> **https://ham-guitar-southern-clearing.trycloudflare.com**

**Live testnet transactions:**

| Action | Transaction |
|--------|-------------|
| 0G Storage upload | [0x0493...832b](https://chainscan-galileo.0g.ai/tx/0x04936ebada3fc6ff01edb9357d45c5d8d6e0051eb3e08eb2f5e9f147f277832b) |
| iNFT mint (ERC-7857) | [0x3170...0b26c](https://chainscan-galileo.0g.ai/tx/0x317088ea29acdcdfd6d8f9f20a7a4e3e27616a969b5f209090dbf9155bc0b26c) |
| KeeperHub execution | [0x3722...b34d](https://sepolia.etherscan.io/tx/0x3722074f89b6159feb53dc1a2a88dd9a768300a90d0f466616b1aa0f06b2b34d) |

Networks: 0G Galileo Testnet, Sepolia

---

## Architecture

```
Originator Agent (Docker container 1)
      │
      ├── spawns ──► Research Specialist (Docker container 2)
      │                     │
      │              deep-researches one domain
      │              stores report to 0G Storage
      │              sends REPORT over AXL
      │
      └── spawns ──► Execution Agent (Docker container 3)
                            │
                     creates KeeperHub workflow
                     executes on-chain via KeeperHub MCP
                     improves strategy based on results
                     mints versioned iNFT on 0G Chain
                     reports STATUS back over AXL

TypeScript Bridge (Docker container 4) — 0G Storage + iNFT HTTP API
FastAPI Server   (Docker container 5) — real-time state API for frontend
```

All inter-agent communication is encrypted P2P over Gensyn AXL.
Each agent runs in its own Docker container with its own AXL node.
All intelligence is stored on 0G Storage and minted as ERC-7857 iNFTs.

---

## Partner Integrations

### Gensyn AXL
- Each agent container runs a separate AXL node (not in-process)
- Agents communicate via signed, encrypted P2P messages over the AXL mesh
- Message types: `SPAWN_SPECIALIST`, `INSTRUCTION`, `REPORT`, `STATUS`
- Client: `axl/client.py` — wraps AXL HTTP bridge for send/receive/topology

### 0G Storage
- All research reports and strategies are uploaded via `POST /storage/upload`
- Returns a permanent `root_hash` used as the content address
- Client: `bridge/src/storage.ts` + `integrations/bridge_client.py`
- Confirmed tx: [0x0493...832b](https://chainscan-galileo.0g.ai/tx/0x04936ebada3fc6ff01edb9357d45c5d8d6e0051eb3e08eb2f5e9f147f277832b)

### 0G iNFT (ERC-7857)
- Custom `MiliGentsINFT.sol` contract deployed to 0G Galileo testnet
- Execution agent mints a new iNFT per strategy version via `POST /inft/mint`
- Each iNFT contains: `root_hash` (strategy data), `metadata_hash`, `version`
- Contract: `contracts/contracts/MiliGentsINFT.sol`
- Confirmed mint: [0x3170...0b26c](https://chainscan-galileo.0g.ai/tx/0x317088ea29acdcdfd6d8f9f20a7a4e3e27616a969b5f209090dbf9155bc0b26c)

### 0G Compute
- Used for LLM inference in production demo
- OpenAI-compatible API endpoint configured via `OG_COMPUTE_URL` in `.env`
- Falls back to Cerebras API for development

### KeeperHub MCP
- Execution agent connects to KeeperHub MCP server via SSE transport
- Creates workflows via `ai_generate_workflow` (natural language → workflow)
- Executes workflows via `execute_workflow` and polls `get_execution_status`
- Executes policy-gated direct transfers via KeeperHub Direct Execution
- All on-chain agent actions go through KeeperHub for guaranteed execution
- Live transfer/contract-call writes are blocked by default by `integrations/execution_policy.py`
- Enable live writes only after setting network, value, contract, and function allowlists
- Confirmed Sepolia tx: [0x3722...b34d](https://sepolia.etherscan.io/tx/0x3722074f89b6159feb53dc1a2a88dd9a768300a90d0f466616b1aa0f06b2b34d)
- Integration: `integrations/keeperhub.py`
- Feedback: `FEEDBACK.md`

### Uniswap Trading API
- Treasury management and agent funding via Uniswap v3/v4
- Quote and swap via `integrations/uniswap.py`
- Sepolia testnet — WETH/USDC pair
- Feedback: `FEEDBACK.md`

---

## What We Built From Scratch

- `agents/` — three CrewAI agents (Originator, Specialist, Execution)
- `bridge/` — TypeScript HTTP bridge for 0G Storage and iNFT operations
- `integrations/` — Python clients for all partners (bridge, KeeperHub, Uniswap, ChromaDB)
- `axl/` — AXL P2P client and per-agent node configs
- `contracts/` — MiliGentsINFT ERC-7857 Solidity contract + Hardhat deploy scripts
- `api/` — FastAPI server exposing real agent state to the frontend
- `integrations/state_writer.py` — shared SQLite state persistence across all agents
- `frontend/MiliGents v2.html` — single-file frontend wired to the live API
- `docker/` — 5-container Docker Compose setup with shared state volume

**Libraries used:** CrewAI, ChromaDB, FastAPI, ethers.js, 0G TypeScript SDK, Hardhat

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Agent framework | CrewAI (Python 3.11) |
| LLM | Cerebras API (dev) / 0G Compute (demo) |
| Inter-agent comms | Gensyn AXL (separate Docker containers) |
| Memory | ChromaDB (local) + 0G Storage (permanent) |
| Intelligence NFTs | 0G iNFT ERC-7857 |
| On-chain execution | KeeperHub MCP |
| Web search | Tavily |
| Treasury | Uniswap Trading API |
| State persistence | SQLite (shared Docker volume) |
| API server | FastAPI + WebSocket |
| Runtime | Docker + Docker Compose (5 containers) |
| Testnet | Sepolia + 0G Galileo |

---

## Setup

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for bridge and contracts)
- A funded 0G Galileo testnet wallet
- API keys: Cerebras, Tavily, KeeperHub, Uniswap

### 1. Clone the repo

```bash
git clone https://github.com/thenameisdevair/miligents
cd miligents
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in `.env`:

```
LLM_API_KEY=              # Cerebras API key
LLM_MODEL=llama3.1-8b
TAVILY_API_KEY=           # Tavily search API key
OG_PRIVATE_KEY=           # 0G Galileo wallet private key (no 0x prefix)
OG_RPC_URL=https://evmrpc-testnet.0g.ai
OG_STORAGE_INDEXER=https://indexer-storage-testnet-turbo.0g.ai
OG_INFT_CONTRACT_ADDRESS= # Deployed MiliGentsINFT contract address
WALLET_ADDRESS=           # Your wallet address
KEEPERHUB_MCP_URL=        # KeeperHub MCP server URL
KEEPERHUB_MCP_API_KEY=    # KeeperHub API key
KEEPERHUB_LIVE_EXECUTION=false
KEEPERHUB_ALLOWED_NETWORKS=sepolia
KEEPERHUB_MAX_TX_ETH=0.001
KEEPERHUB_MAX_DAILY_SPEND_ETH=0.005
KEEPERHUB_ALLOWED_CONTRACTS=
KEEPERHUB_ALLOWED_FUNCTIONS=
KEEPERHUB_ALLOW_APPROVALS=false
KEEPERHUB_MAINNET_CONFIRMED=false
KEEPERHUB_TEST_TRANSFER_ETH=0.00001
KEEPERHUB_WALLET_POOL=     # sepolia:0xWallet:label,base:0xWallet:label
SEPOLIA_RPC_URL=           # Required for Sepolia organism funding checks
BASE_RPC_URL=              # Required before Base organism funding checks
ETHEREUM_RPC_URL=          # Optional mainnet balance checks
FRONTEND_ORIGIN=http://localhost:8081
CORS_ORIGINS=http://localhost:8081,http://localhost:5500,http://127.0.0.1:5500
AUTH_COOKIE_SECURE=false
AUTH_COOKIE_SAMESITE=lax
REOWN_PROJECT_ID=          # Optional AppKit project ID for wallet modal
UNISWAP_API_KEY=          # Uniswap Trading API key
```

KeeperHub safety defaults are deny-by-default. For a Sepolia write test, set
`KEEPERHUB_LIVE_EXECUTION=true` plus the exact contract/function allowlist.
For Base or other live networks, also set `KEEPERHUB_MAINNET_CONFIRMED=true`
after funding the KeeperHub wallet with a small capped amount.
In production, set these as platform/container secrets, not committed files.
Keep staging and production policies separate so mainnet is only armed in the
environment that is meant to run live.

### Deploy user-owned organisms

The Deploy page now creates real organism records. The owner wallet is only for
identity and permissions; agents spend only from the organism's assigned
KeeperHub execution wallet and only inside the policy limits.

For Reown AppKit, create a Reown project ID and expose it to the frontend with
one of:

```html
<script>window.MILIGENTS_REOWN_PROJECT_ID = "..."</script>
```

or:

```bash
localStorage.setItem("mg-reown-project-id", "...")
```

If no Reown project ID is present, the frontend falls back to the injected
browser wallet provider.

Before judges create organisms, seed at least one dedicated KeeperHub execution
wallet per network:

```bash
python3 scripts/seed_keeperhub_wallet_pool.py \
  --network sepolia \
  --wallet 0xYourKeeperHubExecutionWallet \
  --label judge-sepolia-1
```

For fastest judging, pre-fund those execution wallets and set:

```bash
KEEPERHUB_SPONSORED_START=true
```

The app will label this honestly as a sponsored start. The connected wallet
still owns the organism and controls policy; agents spend only from the assigned
execution wallet.

Then the flow is:

```text
1. Open the frontend.
2. Deploy page → connect wallet → switch/sign on Sepolia.
3. Confirm the owner wallet has at least 0.5 Sepolia ETH.
4. Configure treasury/domain/risk.
5. Create organism.
6. Use sponsored start, or fund only the displayed execution wallet address.
7. Click Check funding if manually funded.
8. Open Dashboard.
9. Click Run now to trigger an owner-scoped hosted agent cycle.
10. Dashboard, KeeperHub actions, storage roots, and iNFTs are filtered by that organism_id.
```

Judge-ready deploys are intentionally Sepolia-only for now. The API rejects
non-Sepolia organism creation and rejects owner wallets with less than
`MIN_OWNER_SEPOLIA_ETH` Sepolia ETH. Set that env var to adjust the threshold.

Run the deploy-organism verifier:

```bash
python3 scripts/verify_organism_deploy.py
```

### 3. Build and run

```bash
cd docker
docker compose build
docker compose up -d
```

### 4. Watch agents run

```bash
docker compose logs -f originator
docker compose logs -f specialist
docker compose logs -f execution
```

### 5. Open the dashboard

Open `frontend/MiliGents v2.html` in your browser.
The dashboard connects to the API server at `http://localhost:8081` and shows real agent status, AXL messages, KeeperHub tasks, and minted iNFTs.

### 6. Query the API directly

```bash
curl http://localhost:8081/api/agents   # Agent statuses
curl http://localhost:8081/api/infts    # Minted iNFTs
curl http://localhost:8081/api/stats    # Summary stats
curl http://localhost:8081/api/services # Service health
```

---

## Repository Structure

```
miligents/
├── agents/
│   ├── originator/           # CEO agent — research and spawn
│   ├── research_specialist/  # Domain research agent
│   └── execution/            # Strategy execution agent
├── bridge/                   # TypeScript bridge — 0G Storage and iNFT
├── integrations/             # Python clients — bridge, KeeperHub, Uniswap, state
├── axl/                      # Gensyn AXL configs and Python client
├── contracts/                # MiliGentsINFT ERC-7857 Solidity contract
├── api/                      # FastAPI server — state API for frontend
├── frontend/                 # Single-file HTML frontend
├── docker/                   # 5-container Docker Compose setup
├── docs/                     # Architecture and PRD
├── FEEDBACK.md               # Partner integration feedback
└── SETUP.md                  # Detailed setup guide
```

---

## Built for

**ETHGlobal OpenAgents Hackathon** — April 24 – May 6, 2026

https://ethglobal.com/events/openagents
