# MiliGents — Product Requirements Document
Version: 1.1 | Date: April 27, 2026 | Hackathon: ETHGlobal OpenAgents

---

## 1. What We Are Building

An Autonomous Agent Organism that starts as one Originator agent,
researches money-making opportunities, spawns specialized agents to
pursue them, and manages a growing portfolio of autonomous businesses.

Full technical architecture is defined in docs/ARCHITECTURE.md.
Always read ARCHITECTURE.md before building any feature.

---

## 2. Build Stages

Tasks are ordered strictly by dependency.
Nothing skips ahead. Mark each task [DONE] when committed to GitHub.

---

### STAGE 0 — Foundation (Day 3)

[ ] 0.1 — requirements.txt
    Create requirements.txt in repo root:
    crewai
    crewai-tools
    openai
    chromadb
    python-dotenv
    tavily-python
    requests
    Commit: "init: add Python requirements.txt"

[ ] 0.2 — bridge/package.json
    Create bridge/package.json with dependencies:
    @0glabs/0g-ts-sdk, @0glabs/0g-serving-broker,
    ethers, express, dotenv
    And devDependencies: typescript, ts-node, @types/express,
    @types/node
    Commit: "init: add TypeScript bridge package.json"

[ ] 0.3 — bridge/tsconfig.json
    Create bridge/tsconfig.json with:
    target: ES2022, module: commonjs, outDir: ./dist,
    rootDir: ./src, strict: true, esModuleInterop: true
    Commit: "init: add TypeScript bridge tsconfig"

[ ] 0.4 — .env.example
    Create .env.example in repo root with all required keys:
    # LLM
    LLM_BASE_URL=
    LLM_API_KEY=
    LLM_MODEL=
    # Tavily
    TAVILY_API_KEY=
    # KeeperHub
    KEEPERHUB_API_KEY=
    # 0G
    OG_PRIVATE_KEY=
    OG_RPC_URL=https://evmrpc-testnet.0g.ai
    OG_STORAGE_INDEXER=https://indexer-storage-testnet-turbo.0g.ai
    OG_COMPUTE_PROVIDER_ADDRESS=
    # Uniswap
    UNISWAP_API_KEY=
    # Wallet
    WALLET_PRIVATE_KEY=
    # Bridge
    BRIDGE_PORT=3100
    BRIDGE_URL=http://bridge:3100
    Commit: "init: add .env.example with all integration keys"

[ ] 0.5 — SETUP.md
    Create SETUP.md in repo root with exact commands:
    - Create and activate Python venv
    - Install Python requirements
    - Install bridge Node dependencies
    - Generate AXL private keys
    - Copy .env.example to .env and fill values
    Commit: "docs: add SETUP.md with full environment setup guide"

---

### STAGE 1 — AXL Communication Layer (Day 3-4)
Agents cannot coordinate without this. Build and verify first.

[ ] 1.1 — AXL node configs
    Create three files in axl/configs/:
    node-config-originator.json:
    { "PrivateKeyPath": "private-a.pem", "Peers": [],
      "api_port": 9002, "tcp_port": 9001 }
    node-config-specialist.json:
    { "PrivateKeyPath": "private-b.pem", "Peers": [],
      "api_port": 9002, "tcp_port": 9011 }
    node-config-execution.json:
    { "PrivateKeyPath": "private-c.pem", "Peers": [],
      "api_port": 9002, "tcp_port": 9021 }
    Commit: "feat: AXL node configs for three agent containers"

[ ] 1.2 — AXL Python client
    Create axl/client.py with these functions:
    send_message(destination_pubkey: str, message: dict) -> bool
      POST to localhost:9002/send with X-Destination-Peer-Id header
    receive_messages() -> list[dict]
      GET localhost:9002/recv, parse and return message list
    get_our_pubkey() -> str
      GET localhost:9002/topology, return our_public_key field
    get_topology() -> dict
      GET localhost:9002/topology, return full response
    All messages must follow the envelope in ARCHITECTURE.md.
    All secrets from environment variables via python-dotenv.
    Each function must have a full docstring.
    Commit: "feat: AXL Python client — send, receive, topology"

[ ] 1.3 — AXL two-node local test
    Create axl/test_axl.py that:
    Starts two AXL nodes on different ports locally
    Sends a test message from node A to node B
    Receives and asserts the message arrived correctly
    Prints pass or fail with clear output
    Document any friction encountered in FEEDBACK.md
    under the heading "## Gensyn AXL"
    Commit: "test: AXL two-node round-trip verification"

---

### STAGE 2 — TypeScript Bridge Service (Day 4-5)
All 0G operations depend on this. Build before any agent uses 0G.

[ ] 2.1 — bridge/src/storage.ts
    Implement uploadData(data: string, filename: string):
      Use ZgFile or MemData from @0glabs/0g-ts-sdk
      Call merkleTree() before upload
      Call indexer.upload() with signer
      Return root_hash as string
    Implement downloadData(rootHash: string):
      Call indexer.download() with proof verification
      Return file content as string
    Read ARCHITECTURE.md section 6 before writing.
    All config from process.env.
    # AUTH REQUIRED: OG_PRIVATE_KEY and OG_RPC_URL must be set
    Commit: "feat: bridge storage module — upload and download"

[ ] 2.2 — bridge/src/inft.ts
    Implement mintINFT(rootHash: string, metadata: object):
      Use ethers v6 to connect to 0G Chain
      Call ERC-7857 contract mint function
      Return token_id as string
    Implement getINFT(tokenId: string):
      Call ERC-7857 contract to retrieve iNFT data
      Return { root_hash, metadata }
    Read 0G iNFT integration guide before writing.
    All config from process.env.
    # AUTH REQUIRED: OG_PRIVATE_KEY must be set
    Commit: "feat: bridge iNFT module — mint and get"

[ ] 2.3 — bridge/src/server.ts
    Create Express HTTP server with these routes:
    POST /storage/upload
      body: { data: string, filename: string }
      calls storage.uploadData()
      returns: { root_hash: string }
    GET /storage/download
      query: ?hash=<root_hash>
      calls storage.downloadData()
      returns: { data: string }
    POST /inft/mint
      body: { root_hash: string, metadata: object }
      calls inft.mintINFT()
      returns: { token_id: string }
    GET /inft/get
      query: ?token_id=<id>
      calls inft.getINFT()
      returns: { root_hash: string, metadata: object }
    GET /health
      returns: { status: "ok", timestamp: ISO8601 }
    Port from process.env.BRIDGE_PORT, default 3100.
    All errors return { error: string } with appropriate HTTP code.
    Commit: "feat: bridge HTTP server — all routes wired"

[ ] 2.4 — integrations/bridge_client.py
    Create Python HTTP client for the bridge with:
    upload_data(data: str, filename: str) -> str (root_hash)
    download_data(root_hash: str) -> str
    mint_inft(root_hash: str, metadata: dict) -> str (token_id)
    get_inft(token_id: str) -> dict
    health_check() -> bool
    All calls use requests library.
    BRIDGE_URL from environment variable.
    Each function must have a full docstring.
    Commit: "feat: Python bridge client — HTTP wrapper for agents"

[ ] 2.5 — Bridge smoke test
    Create bridge/test_bridge.py (Python) that:
    Calls health_check() and asserts True
    Uploads a test JSON object and gets root_hash back
    Downloads using root_hash and verifies content matches
    Document any friction in FEEDBACK.md under "## 0G Storage"
    Commit: "test: bridge smoke test — upload, download, verify"

---

### STAGE 3 — 0G Compute LLM Wrapper (Day 5)

[ ] 3.1 — integrations/og_compute.py
    Create Python LLM client wrapper with:
    get_client() -> OpenAI client
      Reads LLM_BASE_URL and LLM_API_KEY from environment
      Returns configured OpenAI client instance
    chat(messages: list, system_prompt: str = None) -> str
      Calls client.chat.completions.create()
      Uses LLM_MODEL from environment
      Returns response content as string
    Works with Cerebras (dev) and 0G Compute (demo)
    by changing only environment variables — zero code change.
    Each function must have a full docstring.
    Commit: "feat: LLM wrapper — OpenAI-compatible client for
    Cerebras and 0G Compute"

---

### STAGE 4 — ChromaDB Memory Wrapper (Day 5)

[ ] 4.1 — integrations/chroma_memory.py
    Create local memory wrapper with:
    store(collection: str, doc_id: str,
          text: str, metadata: dict) -> bool
    search(collection: str, query: str,
           n_results: int = 5) -> list[dict]
    get(collection: str, doc_id: str) -> dict | None
    delete(collection: str, doc_id: str) -> bool
    Uses ChromaDB client. Persist directory from environment.
    Each function must have a full docstring.
    Commit: "feat: ChromaDB memory wrapper — store, search, get"

---

### STAGE 5 — Originator Agent (Day 5-6)

[ ] 5.1 — agents/originator/tools.py
    Create CrewAI-compatible tools:
    web_search_tool: wraps Tavily search, returns results as string
    store_research_tool: calls bridge_client.upload_data(),
      stores in ChromaDB, returns root_hash
    send_axl_tool: wraps axl.client.send_message()
    receive_axl_tool: wraps axl.client.receive_messages()
    Each tool: name, description, func — all required by CrewAI.
    Commit: "feat: Originator tools — search, storage, AXL"

[ ] 5.2 — agents/originator/agent.py
    Create Originator CrewAI Agent:
    role: "Chief Executive Agent"
    goal: "Research and identify 3 viable money-making
      opportunities for an autonomous agent to pursue,
      then spawn and manage specialists to execute them"
    backstory: "You are the CEO of an autonomous agent organism.
      You think strategically. You research before deciding.
      You measure results before reinvesting. You expand
      only when existing operations are profitable."
    tools: all tools from tools.py
    llm: from og_compute.get_client()
    verbose: True
    Commit: "feat: Originator agent definition"

[ ] 5.3 — agents/originator/tasks.py
    Create three CrewAI Tasks:
    research_opportunities_task:
      description: Search for 3 viable money-making opportunities
        for an autonomous agent. Consider trading, content, data
        services, and arbitrage. Store findings on 0G. Return
        structured list of opportunities with rationale.
      expected_output: JSON with 3 opportunities, each containing
        name, description, estimated_difficulty, estimated_revenue
    evaluate_reports_task:
      description: Read specialist reports received over AXL.
        Download full reports from 0G using root_hash.
        Rank opportunities by viability. Decide which to pursue.
        Send INSTRUCTION message over AXL to proceed.
      expected_output: Decision summary with chosen opportunity
        and reasoning
    monitor_children_task:
      description: Receive STATUS messages from execution agents
        over AXL. Download performance logs from 0G. Decide
        whether to reinvest, adjust strategy, or expand.
      expected_output: Monitoring report with performance summary
        and next action decision
    Commit: "feat: Originator tasks — research, evaluate, monitor"

[ ] 5.4 — agents/originator/main.py
    Create entry point that:
    Loads .env with python-dotenv
    Initialises CrewAI Crew with hierarchical process
    Adds Originator as manager agent
    Starts research loop
    Handles SIGINT gracefully with clean shutdown message
    Commit: "feat: Originator main — crew init and research loop"

---

### STAGE 6 — Research Specialist Agent (Day 6-7)

[ ] 6.1 — agents/research_specialist/tools.py
    Create CrewAI-compatible tools:
    web_search_tool: Tavily search
    store_report_tool: bridge_client.upload_data() + ChromaDB
    send_report_tool: axl.client.send_message() to Originator
    receive_assignment_tool: axl.client.receive_messages()
    Commit: "feat: Specialist tools — search, store, AXL report"

[ ] 6.2 — agents/research_specialist/agent.py
    role: "Industry Research Specialist"
    goal: "Master one assigned industry domain and produce a
      detailed, actionable strategy report on how an autonomous
      agent can generate revenue in that domain"
    backstory: "You are a specialist researcher. You go deep,
      not broad. You do not summarise — you produce concrete,
      executable intelligence with specific steps, tools,
      risks, and realistic revenue estimates."
    Commit: "feat: Specialist agent definition"

[ ] 6.3 — agents/research_specialist/tasks.py
    Create three CrewAI Tasks:
    receive_assignment_task:
      Receive domain assignment from AXL message
      Parse and return assigned domain name
    research_domain_task:
      Deep research on assigned domain using Tavily
      Find: specific revenue mechanisms, required tools,
        estimated capital, risks, timeline to first revenue
      Store intermediate findings in ChromaDB
    produce_report_task:
      Structure all findings into a detailed strategy report
      Upload full report to 0G via bridge — get root_hash
      Send REPORT message to Originator over AXL with root_hash
    Commit: "feat: Specialist tasks — assign, research, report"

[ ] 6.4 — agents/research_specialist/main.py
    Entry point — same pattern as originator/main.py
    Commit: "feat: Specialist main — crew init and report loop"

---

### STAGE 7 — KeeperHub Integration (Day 7)

[ ] 7.1 — integrations/keeperhub.py
    Create KeeperHub client wrapper with:
    create_workflow(name: str, trigger: str,
                    steps: list) -> str (workflow_id)
    execute_transfer(to: str, amount: str,
                     token: str) -> str (execution_id)
    execute_contract_call(contract: str, abi: list,
                          fn: str, args: list) -> str (execution_id)
    get_status(execution_id: str) -> dict
    get_logs(execution_id: str) -> list
    All calls via KeeperHub MCP using KEEPERHUB_API_KEY.
    # AUTH REQUIRED: KEEPERHUB_API_KEY must be set in .env
    Each function must have a full docstring.
    Document every friction point in FEEDBACK.md
    under "## KeeperHub" as you build this.
    Commit: "feat: KeeperHub wrapper — workflows and execution"

---

### STAGE 8 — Execution Agent (Day 7-8)

[ ] 8.1 — agents/execution/tools.py
    Create CrewAI-compatible tools:
    receive_strategy_tool: axl.client.receive_messages()
    execute_on_chain_tool: keeperhub.execute_contract_call()
    transfer_funds_tool: keeperhub.execute_transfer()
    store_strategy_tool: bridge_client.upload_data() + ChromaDB
    mint_inft_tool: bridge_client.mint_inft()
    report_status_tool: axl.client.send_message() to Originator
    Commit: "feat: Execution tools — on-chain, AXL, bridge"

[ ] 8.2 — agents/execution/agent.py
    role: "Execution Agent"
    goal: "Execute the assigned business strategy precisely,
      measure results honestly, improve the strategy based on
      outcomes, mint updated iNFTs when strategy improves,
      and report all performance to the Originator"
    backstory: "You are a specialist operator. You execute,
      measure, and improve. You never guess — you act on data.
      You mint a new iNFT only when you have concrete evidence
      the new strategy outperforms the previous version."
    Commit: "feat: Execution agent definition"

[ ] 8.3 — agents/execution/tasks.py
    Create five CrewAI Tasks:
    receive_strategy_task: get strategy from AXL message
    execute_task: run strategy via KeeperHub, log tx hash
    measure_performance_task: evaluate results quantitatively
    improve_strategy_task:
      If results improved: upload new strategy to 0G via bridge
      Call bridge_client.mint_inft() with new root_hash
      Log new token_id with version number
    report_status_task:
      Send STATUS message to Originator over AXL
      Include: performance metrics, current iNFT version,
        tx hashes, next planned action
    Commit: "feat: Execution tasks — execute, measure,
    improve, mint, report"

[ ] 8.4 — agents/execution/main.py
    Entry point — same pattern as originator/main.py
    Commit: "feat: Execution main — crew init and execution loop"

---

### STAGE 9 — Uniswap Integration (Day 8)

[ ] 9.1 — integrations/uniswap.py
    Create Uniswap wrapper using requests only:
    get_quote(token_in: str, token_out: str,
              amount: str) -> dict
    execute_swap(token_in: str, token_out: str,
                 amount: str) -> str (tx_hash)
    get_token_balance(token: str, wallet: str) -> str
    Uses Uniswap Trading API REST endpoints.
    Sepolia testnet only for demo.
    # AUTH REQUIRED: UNISWAP_API_KEY and WALLET_PRIVATE_KEY in .env
    Document every friction point in FEEDBACK.md
    under "## Uniswap" as you build this.
    Commit: "feat: Uniswap wrapper — quote and swap via Trading API"

[ ] 9.2 — Wire Uniswap into Originator
    Update agents/originator/tools.py to add:
    swap_tokens_tool: wraps uniswap.execute_swap()
    Update agents/originator/tasks.py monitor_children_task
    to call swap when funding a new child agent.
    Commit: "feat: wire Uniswap swap into Originator funding flow"

---

### STAGE 10 — Docker (Day 8-9)

[ ] 10.1 — Dockerfiles
    Create docker/Dockerfile.originator:
      FROM python:3.11-slim
      WORKDIR /app
      COPY requirements.txt .
      RUN pip install -r requirements.txt
      COPY agents/originator/ ./agents/originator/
      COPY axl/ ./axl/
      COPY integrations/ ./integrations/
      CMD ["python", "agents/originator/main.py"]

    Create docker/Dockerfile.specialist (same pattern)
    Create docker/Dockerfile.execution (same pattern)

    Create docker/Dockerfile.bridge:
      FROM node:22-slim
      WORKDIR /app
      COPY bridge/package.json .
      RUN npm install
      COPY bridge/src/ ./src/
      COPY bridge/tsconfig.json .
      CMD ["npx", "ts-node", "src/server.ts"]

    Commit: "feat: Dockerfiles for all four containers"

[ ] 10.2 — docker-compose.yml
    Create docker/docker-compose.yml with four services:
    bridge:
      build: Dockerfile.bridge
      ports: 3100:3100
      env_file: ../.env
      networks: miligents-net

    originator:
      build: Dockerfile.originator
      env_file: ../.env
      networks: miligents-net
      volumes: axl/configs/node-config-originator.json
      depends_on: bridge

    specialist:
      build: Dockerfile.specialist
      env_file: ../.env
      networks: miligents-net
      volumes: axl/configs/node-config-specialist.json
      depends_on: bridge

    execution:
      build: Dockerfile.execution
      env_file: ../.env
      networks: miligents-net
      volumes: axl/configs/node-config-execution.json
      depends_on: bridge

    networks:
      miligents-net:
        driver: bridge

    Commit: "feat: docker-compose — four services networked"

[ ] 10.3 — End-to-end Docker test
    Run all four containers.
    Verify:
    Bridge health endpoint returns ok
    Originator AXL node peers with Specialist AXL node
    Originator sends a test message, Specialist receives it
    Bridge upload returns a valid root_hash
    Document all friction in FEEDBACK.md.
    Commit: "test: full Docker stack verification"

---

### STAGE 11 — Demo and Polish (Day 9-10)

[ ] 11.1 — Full end-to-end demo run
    Run the complete system. Demonstrate and document:
    Originator researches → stores on 0G → spawns Specialist
    Specialist reports back → Originator decides → spawns Execution
    Execution Agent acts on Sepolia via KeeperHub
    Execution Agent mints iNFT via bridge
    Execution Agent reports STATUS to Originator
    Commit: "demo: full end-to-end run — all agents, all partners"

[ ] 11.2 — README update
    Update README.md with:
    What MiliGents is (2 clear paragraphs)
    ASCII architecture diagram
    Exact setup and run instructions
    Partner integrations section explaining each
    Link to demo video
    Commit: "docs: complete README"

[ ] 11.3 — FEEDBACK.md completion
    Ensure FEEDBACK.md has honest entries under these headings:
    ## Gensyn AXL
    ## KeeperHub
    ## Uniswap
    ## 0G Storage
    ## 0G Compute
    Each entry must include: what worked, what didn't,
    what was confusing, what is missing from the docs.
    This is required for KeeperHub and Uniswap prize eligibility.
    Commit: "docs: complete FEEDBACK.md — all partner integrations"

[ ] 11.4 — Demo video
    Record 2-4 minute video showing the system running live:
    1. All four Docker containers starting up
    2. Originator researching opportunities
    3. AXL message flow visible in logs
    4. Specialist receiving and reporting back
    5. Execution Agent executing on Sepolia (show tx hash)
    6. iNFT minted on 0G Chain (show token_id)
    7. Originator receiving STATUS report

---

## 3. Cut Priority If Time Runs Short

Cut from the bottom up. Never cut items above your current stage.

1. KEEP: AXL communication layer (Gensyn prize)
2. KEEP: Originator research loop (core product)
3. KEEP: TypeScript bridge — storage (0G prize)
4. KEEP: KeeperHub execution (KeeperHub prize)
5. KEEP: Research Specialist agent (core product)
6. KEEP: iNFT minting via bridge (0G iNFT prize)
7. CUT IF NEEDED: Uniswap swap (replace with direct transfer)
8. CUT IF NEEDED: Execution agent self-improvement loop
9. CUT IF NEEDED: Multiple execution agents (demo with one)
10. CUT IF NEEDED: ChromaDB (use bridge storage only)

---

## 4. Prize Tracks

Partner     Criteria
Gensyn      Separate AXL nodes demonstrated in Docker
KeeperHub   Working on-chain execution + FEEDBACK.md entry
0G          Storage + iNFT demonstrated via bridge

Maximum 3 partner prizes selectable on submission form.

---

## 5. Submission Checklist

[ ] GitHub repo public with full granular commit history
[ ] README.md complete with setup and run instructions
[ ] FEEDBACK.md complete with honest entries for all partners
[ ] Demo video 2-4 minutes recorded and uploaded
[ ] ETHGlobal hacker dashboard submission form filled
[ ] Three partner prizes selected on submission form
