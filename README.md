# MiliGents

> An Autonomous Agent Organism that researches opportunities, builds
> a company, and mints its own intelligence as tradeable NFTs.

Built for the ETHGlobal OpenAgents Hackathon — April 24 – May 6, 2026.

---

## What It Does

Deploy MiliGents with a small treasury. It wakes up and runs itself.

1. The **Originator** agent researches money-making opportunities
   using live web search
2. It spawns a **Research Specialist** per opportunity — each one
   deep-dives one industry and stores its report permanently on-chain
3. It spawns an **Execution Agent** per strategy — each one executes
   on-chain actions, measures results, and improves over time
4. Every strategy improvement is minted as a versioned **iNFT** —
   the agent's intelligence becomes a tradeable on-chain asset

No human intervention after deployment.

---

## Architecture

Originator Agent
      │
      ├── spawns ──► Research Specialist (one per opportunity)
      │                     │
      │              stores report to 0G Storage
      │              sends findings over AXL
      │
      └── spawns ──► Execution Agent (one per strategy)
                            │
                     executes via KeeperHub
                     funds via Uniswap
                     mints iNFT on 0G Chain

All agents run in separate Docker containers.
All inter-agent communication is encrypted P2P over Gensyn AXL.
All intelligence is stored permanently on 0G Storage and minted as ERC-7857 iNFTs.

---

## Partner Integrations

| Partner        | Role in MiliGents                                              |
|----------------|----------------------------------------------------------------|
| Gensyn AXL     | Encrypted P2P messaging between agent containers              |
| 0G Storage     | Permanent on-chain storage of research reports and strategies |
| 0G Compute     | LLM inference for agent reasoning (OpenAI-compatible API)     |
| 0G iNFT ERC-7857 | Versioned intelligence NFTs minted per strategy update      |
| KeeperHub MCP  | Guaranteed on-chain execution of agent tasks                  |
| Uniswap        | Treasury management and funding child agents via Trading API  |

---

## Testnet Transactions

| Action          | Transaction                                                                                                                                         |
|-----------------|-----------------------------------------------------------------------------------------------------------------------------------------------------|
| 0G Storage upload | [0x0493...832b](https://chainscan-galileo.0g.ai/tx/0x04936ebada3fc6ff01edb9357d45c5d8d6e0051eb3e08eb2f5e9f147f277832b)                           |
| iNFT mint       | [0x3170...0b26c](https://chainscan-galileo.0g.ai/tx/0x317088ea29acdcdfd6d8f9f20a7a4e3e27616a969b5f209090dbf9155bc0b26c)                           |

Network: 0G Galileo Testnet

---

## Tech Stack

- **Agent Framework:** CrewAI (Python)
- **LLM:** Cerebras API (dev) / 0G Compute (demo)
- **Inter-agent comms:** Gensyn AXL
- **Memory:** ChromaDB (local) + 0G Storage (permanent)
- **Intelligence NFTs:** 0G iNFT ERC-7857
- **On-chain execution:** KeeperHub MCP
- **Web search:** Tavily
- **Treasury:** Uniswap Trading API
- **Wallet:** Sepolia + 0G Galileo testnet
- **Runtime:** Docker + Docker Compose

---

## Setup

### Prerequisites

- Docker and Docker Compose installed
- A funded 0G Galileo testnet wallet
- API keys: Cerebras, Tavily, KeeperHub, Uniswap

### 1. Clone the repo

git clone https://github.com/thenameisdevair/miligents
cd miligents

### 2. Configure environment

cp .env.example .env

Fill in the following in .env:

CEREBRAS_API_KEY=          # LLM inference
TAVILY_API_KEY=            # Web search
OG_PRIVATE_KEY=            # 0G Galileo wallet private key (no 0x prefix)
OG_RPC_URL=https://evmrpc-testnet.0g.ai
OG_STORAGE_INDEXER=https://indexer-storage-testnet-turbo.0g.ai
OG_INFT_CONTRACT_ADDRESS=  # Deployed contract address
KEEPERHUB_MCP_URL=         # KeeperHub MCP server URL
UNISWAP_API_KEY=           # Uniswap Trading API key

### 3. Build and run

cd docker
docker compose build
docker compose up

### 4. Watch the agents run

docker compose logs -f originator
docker compose logs -f specialist
docker compose logs -f execution

The Originator researches opportunities, spawns the Specialist,
which stores findings on 0G Storage, then spawns the Execution Agent,
which registers tasks on KeeperHub and mints a strategy iNFT.

---

## Demo

[Coming soon]

---

## Repository Structure

miligents/
├── agents/
│   ├── originator/       # CEO agent — research and spawn
│   ├── research_specialist/  # Domain research agent
│   └── execution/        # Strategy execution agent
├── bridge/               # TypeScript bridge — 0G Storage and iNFT
├── integrations/         # Python clients — bridge, KeeperHub, Uniswap
├── axl/                  # Gensyn AXL configs and client
├── contracts/            # MiliGentsINFT ERC-7857 Solidity contract
├── docker/               # Dockerfiles and docker-compose.yml
└── docs/                 # Architecture and PRD

---

## Built for

ETHGlobal OpenAgents Hackathon — April 24 – May 6, 2026
https://ethglobal.com
