# MiliGents — Architecture Document
Version: 1.1 | Date: April 27, 2026 | Hackathon: ETHGlobal OpenAgents

---

## 1. What MiliGents Is

An Autonomous Agent Organism. It starts as a single Originator agent
that thinks like a CEO — researches money-making opportunities, spawns
specialized agents to pursue them, and manages a growing portfolio of
autonomous businesses. Every agent self-improves over time, stores its
versioned intelligence as iNFTs on 0G, coordinates with other agents
over Gensyn AXL, executes on-chain via KeeperHub, and funds itself
via Uniswap.

Target user: a developer who deploys MiliGents with a small treasury
and earns from the agent company it builds autonomously.

---

## 2. System Overview

MiliGents has two distinct layers:

PYTHON LAYER — Agent reasoning, research, decisions, coordination
TYPESCRIPT LAYER — All blockchain and 0G interactions (bridge service)

Python agents never touch the blockchain directly.
Every 0G interaction goes through the TypeScript bridge via HTTP.
Every other on-chain action goes through KeeperHub MCP.

---

## 3. Agent Hierarchy

Originator (CEO)
├── Research Specialist — one per opportunity domain
│   └── Execution Agent — one per business activity

### 3.1 Originator Agent
- Role: CEO. Researches opportunities. Decides what to pursue.
  Spawns Research Specialists. Monitors all children. Reinvests
  profits. Expands when ready.
- Triggers: Starts on deployment. Loops indefinitely.
- Outputs: Opportunity reports stored on 0G via bridge.
  Spawn instructions sent over AXL.
  Performance reviews of child agents.

### 3.2 Research Specialist Agent
- Role: Masters one industry domain. Researches how an agent
  can make money in that domain. Reports findings to Originator.
- One instance per opportunity.
- Outputs: Industry report stored on 0G via bridge.
  Strategy document. Recommendation to Originator over AXL.

### 3.3 Execution Agent
- Role: Pursues one specific business activity. Executes strategy.
  Measures results. Improves strategy over time.
  Mints updated iNFTs via bridge when strategy improves.
- One instance per business.
- Outputs: On-chain transactions via KeeperHub.
  Performance logs on 0G via bridge.
  Updated iNFT versions via bridge.

---

## 4. Communication Layer — Gensyn AXL

### Verified from official Gensyn docs:
- Each agent runs in its own Docker container
- Each container runs its own AXL node binary (Go binary)
- Each AXL node has a unique ed25519 private key (private.pem)
- AXL exposes a local HTTP bridge at localhost:9002 inside container
- Send: POST localhost:9002/send
  Header: X-Destination-Peer-Id: <recipient_public_key>
  Body: raw bytes or JSON string
- Receive: GET localhost:9002/recv
- All traffic is end-to-end encrypted (TLS + Yggdrasil overlay)
- No central server — pure P2P mesh
- Nodes discover each other via public key exchange at startup

### Message Envelope — all inter-agent messages use this format:
{
  "type": "SPAWN_SPECIALIST | REPORT | STATUS | INSTRUCTION",
  "from": "<agent_name>",
  "to": "<agent_name>",
  "payload": {},
  "timestamp": "<ISO8601>"
}

### Container to AXL Node Mapping:
Container: originator
  AXL Node A — private-a.pem, api_port 9002, tcp_port 9001
  Originator Agent calls localhost:9002

Container: research_specialist
  AXL Node B — private-b.pem, api_port 9002, tcp_port 9011
  Specialist Agent calls localhost:9002

Container: execution_agent
  AXL Node C — private-c.pem, api_port 9002, tcp_port 9021
  Execution Agent calls localhost:9002

Container: bridge
  TypeScript bridge service — port 3100
  All agents call http://bridge:3100 for 0G operations

---

## 5. LLM Layer — 0G Compute

### Verified from official 0G docs:
- 0G Compute exposes an OpenAI-compatible API
- Python agents use the OpenAI Python client with a custom base_url
- Auth: Bearer token in format app-sk-<SECRET>
- Testnet model: qwen-2.5-7b-instruct
- Mainnet models: deepseek-chat-v3-0324, gpt-oss-120b
- Rate limit: 30 requests/minute, 5 concurrent per user
- Requires: deposit 0G tokens, transfer minimum 1 0G to provider
  sub-account before first inference call

### Two-phase LLM strategy:
- Development: Cerebras API (free, OpenAI-compatible, fast)
- Demo: Switch base_url to 0G Compute — zero code change

### Python call pattern (verified from 0G docs):
from openai import OpenAI

client = OpenAI(
    base_url=os.getenv("LLM_BASE_URL"),
    api_key=os.getenv("LLM_API_KEY")
)

response = client.chat.completions.create(
    model=os.getenv("LLM_MODEL"),
    messages=[{"role": "user", "content": prompt}]
)

---

## 6. TypeScript Bridge Service

### Why it exists:
The 0G Storage SDK and iNFT interactions are TypeScript-only.
No Python SDK exists. The bridge wraps all 0G TypeScript SDKs
and exposes a simple HTTP API that Python agents call via requests.

### SDKs used inside the bridge (verified from 0G docs):
- @0glabs/0g-ts-sdk — Storage upload/download/verify
- @0glabs/0g-serving-broker — Compute inference (if needed)
- ethers v6 — iNFT contract interactions on 0G Chain

### Bridge HTTP API — what Python agents call:
POST   /storage/upload      body: { data: string, filename: string }
                            returns: { root_hash: string }

GET    /storage/download    query: ?hash=<root_hash>
                            returns: { data: string }

POST   /inft/mint           body: { root_hash: string, metadata: object }
                            returns: { token_id: string }

GET    /inft/get            query: ?token_id=<id>
                            returns: { root_hash: string, metadata: object }

GET    /health              returns: { status: "ok" }

### Bridge runs as its own Docker container on port 3100.
All agent containers reach it at http://bridge:3100 via
the Docker internal network defined in docker-compose.yml.

---

## 7. Memory Layer — ChromaDB + 0G Storage

### Two-tier design:

Tier 1 — ChromaDB (fast, local, in-session)
- Stores embeddings of research outputs, strategies, decisions
- Semantic search within an agent's active session
- Lives inside the agent's Docker container
- Volume-mounted to persist across container restarts

Tier 2 — 0G Storage via bridge (permanent, cross-session)
- Stores final research reports, strategy documents, logs
- Python agent calls POST http://bridge:3100/storage/upload
- Receives root_hash — permanent retrieval address
- root_hash stored on 0G Chain via bridge iNFT operations

### Memory flow:
Agent produces output
        ↓
Store in ChromaDB (fast local retrieval)
        ↓
POST to bridge /storage/upload → get root_hash
        ↓
POST to bridge /inft/mint with root_hash → get token_id
        ↓
Log token_id as permanent on-chain reference

---

## 8. Intelligence NFTs — 0G iNFT ERC-7857

### What an iNFT represents in MiliGents:
Each Execution Agent's strategy is an iNFT. When the agent
improves its strategy, it mints a new version via the bridge.
Full versioned lineage lives on 0G Chain.

### Versioning model:
Trading Agent — Strategy iNFT v1.0 (root_hash_A, token_id_1)
      ↓ strategy improves after N execution cycles
Trading Agent — Strategy iNFT v2.0 (root_hash_B, token_id_2)
      ↓ strategy improves again
Trading Agent — Strategy iNFT v3.0 (root_hash_C, token_id_3)

Each version references previous — full lineage on-chain.
Developer owns all versions. Profitable iNFTs can be sold.

---

## 9. Execution Layer — KeeperHub MCP

### Verified from official KeeperHub docs:
- KeeperHub exposes an MCP server
- Auth: KEEPERHUB_API_KEY environment variable
- Key tools:
  - create_workflow: define a reusable on-chain automation
  - execute_workflow: trigger a workflow by ID
  - execute_transfer: send ETH or ERC-20 tokens directly
  - execute_contract_call: call any smart contract function
  - get_execution_status: poll for result by execution_id
  - get_execution_logs: full audit trail per execution
- Supports Sepolia testnet
- Handles: gas estimation, retries, MEV protection, nonces
- Every execution logged: trigger, tx hash, gas, outcome, timestamp

### What MiliGents uses KeeperHub for:
- Originator: fund child agents via execute_transfer
- Trading Agent: execute trades via execute_contract_call
- All agents: any on-chain action that must not fail

---

## 10. Treasury Layer — Uniswap

### What MiliGents uses Uniswap for:
- Originator swaps treasury tokens to fund child agents
- Execution agents swap earned tokens to base token (ETH/USDC)

### Integration method:
- Uniswap Trading API (REST) called via Python requests library
- No additional Python package needed
- Sepolia testnet for all demo transactions
- Document all integration friction in FEEDBACK.md

---

## 11. Full Data Flow

1.  Developer deploys all containers with funded treasury wallet
2.  Originator researches opportunities (Tavily web search)
3.  Originator uploads research to 0G via bridge → gets root_hash
4.  Originator sends SPAWN_SPECIALIST message over AXL
5.  Specialist receives domain assignment over AXL
6.  Specialist deep-researches domain using Tavily
7.  Specialist uploads findings to 0G via bridge → gets root_hash
8.  Specialist sends REPORT to Originator over AXL with root_hash
9.  Originator downloads and reads report via bridge
10. Originator decides to pursue → sends INSTRUCTION over AXL
11. Originator funds Execution Agent via KeeperHub execute_transfer
12. Originator swaps treasury tokens if needed via Uniswap API
13. Execution Agent receives strategy via AXL
14. Execution Agent executes on-chain actions via KeeperHub
15. Execution Agent measures performance results
16. Execution Agent uploads improved strategy to 0G via bridge
17. Execution Agent mints new iNFT version via bridge → token_id
18. Execution Agent sends STATUS report to Originator over AXL
19. Originator monitors all children → reinvests → expands
20. Loop back to step 2 when treasury allows expansion

---

## 12. File Structure

miligents/
├── agents/
│   ├── originator/
│   │   ├── agent.py          # CrewAI agent definition
│   │   ├── tasks.py          # Research and spawn tasks
│   │   ├── tools.py          # Tavily, AXL, bridge HTTP tools
│   │   └── main.py           # Entry point and crew init
│   ├── research_specialist/
│   │   ├── agent.py
│   │   ├── tasks.py
│   │   ├── tools.py
│   │   └── main.py
│   └── execution/
│       ├── agent.py
│       ├── tasks.py
│       ├── tools.py
│       └── main.py
├── axl/
│   ├── configs/
│   │   ├── node-config-originator.json
│   │   ├── node-config-specialist.json
│   │   └── node-config-execution.json
│   └── client.py             # Python HTTP wrapper for AXL
├── bridge/                   # TypeScript bridge service
│   ├── src/
│   │   ├── server.ts         # Express HTTP server — all routes
│   │   ├── storage.ts        # 0G Storage upload/download
│   │   └── inft.ts           # iNFT mint/get via ethers v6
│   ├── package.json
│   └── tsconfig.json
├── integrations/
│   ├── bridge_client.py      # Python HTTP client for bridge
│   ├── og_compute.py         # 0G Compute LLM client
│   ├── keeperhub.py          # KeeperHub MCP client
│   └── uniswap.py            # Uniswap Trading API via requests
├── docker/
│   ├── Dockerfile.originator
│   ├── Dockerfile.specialist
│   ├── Dockerfile.execution
│   ├── Dockerfile.bridge
│   └── docker-compose.yml
├── contracts/
├── docs/
│   ├── ARCHITECTURE.md       # This document
│   └── PRD.md
├── FEEDBACK.md
├── README.md
├── .env.example
├── .gitignore
├── requirements.txt          # Python dependencies only
└── SETUP.md

---

## 13. Tech Stack

Component            Tool
Language (agents)    Python 3.11+
Language (bridge)    TypeScript (Node.js 22+)
Agent Framework      CrewAI
LLM dev              Cerebras API
LLM demo             0G Compute (qwen-2.5-7b testnet)
Inter-agent comms    Gensyn AXL
Local memory         ChromaDB
0G Storage           @0glabs/0g-ts-sdk (inside bridge)
iNFT ERC-7857        ethers v6 (inside bridge)
0G Chain             ethers v6 (inside bridge)
On-chain execution   KeeperHub MCP
Web search           Tavily
Token swaps          Uniswap Trading API REST
Containerisation     Docker + Compose
Network              Sepolia testnet

---

## 14. Python Dependencies

crewai
crewai-tools
openai
chromadb
python-dotenv
tavily-python
requests

Note: No web3.py needed. All blockchain interactions go through
the TypeScript bridge or KeeperHub. Python stays pure logic.

---

## 15. TypeScript Bridge Dependencies

@0glabs/0g-ts-sdk
@0glabs/0g-serving-broker
ethers
express
dotenv

---

## 16. Hard Constraints

1.  AXL must run as separate nodes — never simulated in-process
2.  All on-chain actions go through KeeperHub — never raw tx from Python
3.  All 0G storage and iNFT operations go through the bridge
4.  Python agents call bridge via HTTP only — never import TS directly
5.  All important outputs stored on 0G before being referenced
6.  Every git commit is granular and descriptive
7.  FEEDBACK.md updated after every partner integration
8.  .env file never committed — .env.example only
9.  private.pem keys never committed — in .gitignore
10. No code written without a matching task in PRD.md
