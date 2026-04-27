# MiliGents — Architecture Document
Version: 1.0 | Date: April 27, 2026 | Hackathon: ETHGlobal OpenAgents

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

## 2. Agent Hierarchy
Originator (CEO)
├── Research Specialist — Agentic Trading
│   └── Trading Execution Agent
├── Research Specialist — Content Creation
│   └── Content Execution Agent
└── Research Specialist — Data Services
└── Data Execution Agent

### 2.1 Originator Agent
- Role: CEO. Researches opportunities. Decides what to pursue.
  Spawns Research Specialists. Monitors all children. Reinvests
  profits. Expands when ready.
- Triggers: Starts on deployment. Loops indefinitely.
- Outputs: Opportunity reports stored on 0G. Spawn instructions
  sent over AXL. Performance reviews of child agents.

### 2.2 Research Specialist Agent
- Role: Masters one industry domain. Researches how to make money
  in that domain as an agent. Reports findings to Originator.
- One instance per opportunity.
- Outputs: Industry report stored on 0G. Strategy document.
  Recommendation to Originator over AXL.

### 2.3 Execution Agent
- Role: Pursues one specific business activity. Trades, creates
  content, or sells data. Improves its own strategy over time.
  Mints updated iNFTs when it gets better.
- One instance per business.
- Outputs: On-chain transactions via KeeperHub. Performance logs
  on 0G Storage. Updated iNFT versions on 0G Chain.

---

## 3. Communication Layer — Gensyn AXL

### Verified from official Gensyn docs:
- Each agent runs in its own Docker container
- Each container runs its own AXL node binary
- Each AXL node has a unique ed25519 private key (private.pem)
- AXL exposes a local HTTP bridge at localhost:9002
- Send: POST localhost:9002/send
  Header: X-Destination-Peer-Id: <recipient_public_key>
  Body: raw bytes or JSON string
- Receive: GET localhost:9002/recv
- All traffic is end-to-end encrypted (TLS + Yggdrasil)
- No central server — pure P2P mesh
- Nodes peer to each other via public key exchange

### Message Envelope (all inter-agent messages use this format):
```json
{
  "type": "SPAWN_SPECIALIST | REPORT | STATUS | INSTRUCTION",
  "from": "<agent_name>",
  "to": "<agent_name>",
  "payload": {},
  "timestamp": "<ISO8601>"
}
```

### Container to AXL Node Mapping:
Container: originator
AXL Node A (private-a.pem, api_port 9002, tcp_port 9001)
Originator Agent → talks to localhost:9002
Container: research_specialist
AXL Node B (private-b.pem, api_port 9012, tcp_port 9011)
Specialist Agent → talks to localhost:9002
Container: execution_agent
AXL Node C (private-c.pem, api_port 9022, tcp_port 9021)
Execution Agent → talks to localhost:9002

---

## 4. LLM Layer — 0G Compute

### Verified from official 0G docs:
- 0G Compute exposes an OpenAI-compatible API
- Python agents use the OpenAI client with a custom base_url
- Auth: Bearer token in format app-sk-<SECRET>
- Testnet model available: qwen-2.5-7b-instruct
- Mainnet models: deepseek-chat-v3-0324, gpt-oss-120b
- Rate limit: 30 requests/minute, 5 concurrent per user
- Requires: deposit 0G tokens, transfer minimum 1 0G to provider
  sub-account before first inference call
- Local proxy option: 0g-compute-cli inference serve
  --provider <PROVIDER_ADDRESS> exposes localhost:3000

### Two-phase LLM strategy:
- Development: Cerebras API (free, OpenAI-compatible, fast)
- Demo: Switch base_url to 0G Compute endpoint — zero code change

### Python call pattern (verified):
```python
from openai import OpenAI

client = OpenAI(
    base_url=os.getenv("LLM_BASE_URL"),  # swap between Cerebras/0G
    api_key=os.getenv("LLM_API_KEY")
)

response = client.chat.completions.create(
    model=os.getenv("LLM_MODEL"),
    messages=[{"role": "user", "content": prompt}]
)
```

---

## 5. Memory Layer — ChromaDB + 0G Storage

### Two-tier design:

**Tier 1 — ChromaDB (fast, local, in-session)**
- Stores embeddings of research outputs, strategies, decisions
- Used for semantic search within an agent's active session
- Lives inside the agent's Docker container
- Volume-mounted to persist across container restarts

**Tier 2 — 0G Storage (permanent, on-chain, cross-session)**
- Stores final research reports, strategy documents, performance logs
- Returns a root_hash on upload — permanent retrieval address
- Any agent can retrieve any document by root_hash from anywhere
- root_hash stored on 0G Chain as immutable reference

### Memory Flow:
Agent produces output
↓
Store in ChromaDB (fast local retrieval)
↓
Push important outputs to 0G Storage
↓
Receive root_hash
↓
Store root_hash on 0G Chain
↓
Mint iNFT referencing root_hash (ownership + versioning)

---

## 6. Intelligence NFTs — 0G iNFT (ERC-7857)

Each Execution Agent's strategy is an iNFT. When the agent improves
its strategy, it mints a new version. Full lineage lives on-chain.

### Versioning model:
Trading Agent — Strategy iNFT v1.0 (root_hash_A)
↓ (improves after N cycles)
Trading Agent — Strategy iNFT v2.0 (root_hash_B)
↓ (improves again)
Trading Agent — Strategy iNFT v3.0 (root_hash_C)

Each version references the previous. Developer owns all versions.
Profitable strategy iNFTs can be sold to other developers.

---

## 7. Execution Layer — KeeperHub MCP

### Verified from official KeeperHub docs:
- KeeperHub exposes an MCP server
- Auth: KEEPERHUB_API_KEY environment variable
- Key tools:
  - create_workflow: define a reusable on-chain automation
  - execute_workflow: trigger a workflow by ID
  - execute_transfer: send ETH or ERC-20 directly
  - execute_contract_call: call any smart contract function
  - get_execution_status: poll for result by execution_id
  - get_execution_logs: full audit trail
- Supports Sepolia testnet
- Handles: gas estimation, retries, MEV protection, nonce management
- Every execution logged: trigger, tx hash, gas, outcome, timestamp

### What MiliGents uses KeeperHub for:
- Originator: fund child agents via execute_transfer
- Trading Agent: execute trades via execute_contract_call
- All agents: any on-chain action — never raw transactions

---

## 8. Treasury Layer — Uniswap

### What MiliGents uses Uniswap for:
- Originator funds child agents by swapping treasury tokens
- Execution agents swap earned tokens back to base token
- Integration via Uniswap Trading API and uniswap-ai skills

---

## 9. Full Data Flow

Developer deploys Originator with treasury
Originator researches opportunities (Tavily web search)
Originator stores research on 0G Storage → gets root_hash
Originator sends SPAWN_SPECIALIST message over AXL
Specialist agent starts, receives domain assignment over AXL
Specialist deep-researches domain, stores findings on 0G
Specialist sends REPORT to Originator over AXL
Originator decides to pursue → sends SPAWN_EXECUTION over AXL
Originator funds Execution Agent via KeeperHub execute_transfer
Execution Agent starts business activity
Execution Agent executes on-chain actions via KeeperHub
Execution Agent measures performance, stores logs on 0G
Execution Agent improves strategy → stores on 0G → mints iNFT
Execution Agent sends STATUS report to Originator over AXL
Originator monitors all children → reinvests → expands
Loop back to step 2 when ready for new opportunity


---

## 10. File Structure
miligents/
├── agents/
│   ├── originator/
│   │   ├── agent.py        # CrewAI agent definition
│   │   ├── tasks.py        # Research and spawn tasks
│   │   ├── tools.py        # Tavily, AXL, 0G storage tools
│   │   └── main.py         # Entry point
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
│   └── client.py           # Python HTTP wrapper for AXL
├── integrations/
│   ├── og_storage.py       # 0G Storage upload/download
│   ├── og_compute.py       # 0G Compute LLM client
│   ├── og_inft.py          # iNFT minting
│   ├── keeperhub.py        # KeeperHub MCP client
│   └── uniswap.py          # Uniswap swap wrapper
├── docker/
│   ├── Dockerfile.originator
│   ├── Dockerfile.specialist
│   ├── Dockerfile.execution
│   └── docker-compose.yml
├── contracts/
├── docs/
│   ├── ARCHITECTURE.md     # This document
│   └── PRD.md
├── FEEDBACK.md
├── README.md
├── .env.example
├── .gitignore
└── requirements.txt

---

## 11. Tech Stack

| Component          | Tool                        |
|--------------------|-----------------------------|
| Language           | Python 3.11+                |
| Agent Framework    | CrewAI                      |
| LLM (dev)          | Cerebras API                |
| LLM (demo)         | 0G Compute                  |
| Inter-agent comms  | Gensyn AXL                  |
| Local memory       | ChromaDB                    |
| Permanent storage  | 0G Storage SDK              |
| Intelligence NFTs  | 0G iNFT ERC-7857            |
| On-chain execution | KeeperHub MCP               |
| Web search         | Tavily                      |
| Token swaps        | Uniswap Trading API         |
| Containerisation   | Docker + Compose            |
| Network            | Sepolia testnet             |

---

## 12. Hard Constraints

1. AXL must run as separate nodes — never simulated in-process
2. All on-chain actions go through KeeperHub — never raw tx
3. All important outputs stored on 0G Storage before being used
4. Every git commit is granular and descriptive
5. FEEDBACK.md updated after every partner integration
6. .env file never committed — .env.example only
7. private.pem keys never committed — covered by .gitignore
8. No code written without a matching task in PRD.md
