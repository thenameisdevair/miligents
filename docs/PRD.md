# MiliGents — Product Requirements Document
Version: 1.0 | Date: April 27, 2026 | Hackathon: ETHGlobal OpenAgents

---

## 1. What We Are Building

An Autonomous Agent Organism that starts as one Originator agent,
researches money-making opportunities, spawns specialized agents to
pursue them, and manages a growing portfolio of autonomous businesses.

Full architecture is defined in docs/ARCHITECTURE.md.
Always read ARCHITECTURE.md before building any feature.

---

## 2. Build Stages

Tasks are ordered by dependency — nothing skips ahead.
Mark each task [DONE] when committed to GitHub.

---

### STAGE 0 — Foundation (Day 3)
Everything the agents need to exist before they can think or act.

[ ] 0.1 — requirements.txt
    Create requirements.txt with these exact packages:
    crewai
    crewai-tools
    openai
    chromadb
    python-dotenv
    tavily-python
    requests
    Commit: "init: add requirements.txt with core dependencies"

[ ] 0.2 — .env.example
    Verify .env.example exists and contains all keys:
    LLM_BASE_URL, LLM_API_KEY, LLM_MODEL,
    TAVILY_API_KEY, KEEPERHUB_API_KEY,
    OG_PRIVATE_KEY, OG_RPC_URL, OG_STORAGE_INDEXER,
    OG_COMPUTE_API_KEY, OG_COMPUTE_BASE_URL,
    UNISWAP_API_KEY, WALLET_PRIVATE_KEY
    Commit: "init: verify env example covers all integrations"

[ ] 0.3 — Python venv setup instructions
    Add SETUP.md in repo root with exact commands to:
    create venv, activate it, install requirements.txt
    Commit: "docs: add SETUP.md with venv and install instructions"

---

### STAGE 1 — AXL Communication Layer (Day 3-4)
Agents cannot coordinate without this. Build it first.

[ ] 1.1 — AXL node configs
    Create three config files in axl/configs/:
    - node-config-originator.json
    - node-config-specialist.json  
    - node-config-execution.json
    Each with unique PrivateKeyPath and different api_port/tcp_port.
    Originator: api_port 9002, tcp_port 9001
    Specialist: api_port 9012, tcp_port 9011
    Execution: api_port 9022, tcp_port 9021
    Commit: "feat: add AXL node configs for all three agent containers"

[ ] 1.2 — AXL Python client
    Create axl/client.py with these functions:
    - send_message(destination_pubkey, message_dict) → bool
    - receive_messages() → list[dict]
    - get_our_pubkey() → str
    - get_topology() → dict
    All functions use requests to call localhost AXL HTTP bridge.
    Message dict must follow the envelope in ARCHITECTURE.md.
    Commit: "feat: AXL Python client — send, receive, topology"

[ ] 1.3 — AXL two-node test
    Create axl/test_axl.py that:
    - Sends a test message from node A to node B
    - Receives and prints the message on node B
    - Confirms round-trip works
    Document any friction in FEEDBACK.md under "Gensyn AXL".
    Commit: "test: AXL two-node round-trip verification"

---

### STAGE 2 — 0G Storage Integration (Day 4-5)
Agents need permanent memory before they can store intelligence.

[ ] 2.1 — 0G Storage wrapper
    Create integrations/og_storage.py with:
    - upload_file(file_path) → root_hash
    - upload_json(data_dict) → root_hash
    - download_file(root_hash, output_path) → bool
    Use the 0G Storage SDK. Read official docs before writing.
    # AUTH REQUIRED: developer must fund 0G wallet before this runs
    Commit: "feat: 0G Storage wrapper — upload and download"

[ ] 2.2 — 0G Compute LLM wrapper
    Create integrations/og_compute.py with:
    - get_llm_client() → OpenAI client pointed at LLM_BASE_URL
    - chat(messages: list, system_prompt: str) → str
    Must work with both Cerebras (dev) and 0G Compute (demo)
    by reading LLM_BASE_URL and LLM_API_KEY from environment.
    Commit: "feat: 0G Compute LLM wrapper — OpenAI-compatible client"

[ ] 2.3 — ChromaDB local memory wrapper
    Create integrations/chroma_memory.py with:
    - store(collection, doc_id, text, metadata) → bool
    - search(collection, query, n_results) → list[dict]
    - get(collection, doc_id) → dict
    Commit: "feat: ChromaDB local memory wrapper"

---

### STAGE 3 — Originator Agent (Day 5-6)
The CEO. The heart of MiliGents. Everything else follows from it.

[ ] 3.1 — Originator tools
    Create agents/originator/tools.py with:
    - web_search_tool: wraps Tavily search
    - store_research_tool: wraps og_storage.upload_json
    - send_axl_tool: wraps axl.client.send_message
    - receive_axl_tool: wraps axl.client.receive_messages
    Each tool must be a CrewAI-compatible Tool with name,
    description, and func.
    Commit: "feat: Originator tools — search, storage, AXL comms"

[ ] 3.2 — Originator agent definition
    Create agents/originator/agent.py with:
    - Originator CrewAI Agent
    - Role: Chief Executive Agent
    - Goal: Research and identify 3 viable money-making opportunities
      for an autonomous agent to pursue
    - Backstory: You are the CEO of an autonomous agent organism.
      You think strategically. You research before deciding.
      You spawn specialists to validate your ideas.
    - Tools: all tools from tools.py
    - LLM: from og_compute.get_llm_client()
    Commit: "feat: Originator agent definition — CEO role and goal"

[ ] 3.3 — Originator tasks
    Create agents/originator/tasks.py with:
    - research_opportunities_task: search for 3 opportunities,
      store findings on 0G, return opportunity list
    - evaluate_reports_task: read specialist reports from 0G,
      decide which to pursue, send INSTRUCTION over AXL
    - monitor_children_task: receive STATUS messages from
      execution agents, log performance, decide next action
    Commit: "feat: Originator tasks — research, evaluate, monitor"

[ ] 3.4 — Originator main entry point
    Create agents/originator/main.py that:
    - Loads .env
    - Initialises CrewAI crew with hierarchical process
    - Starts the Originator research loop
    - Handles graceful shutdown on SIGINT
    Commit: "feat: Originator main — crew init and research loop"

---

### STAGE 4 — Research Specialist Agent (Day 6-7)

[ ] 4.1 — Specialist tools
    Create agents/research_specialist/tools.py with:
    - web_search_tool: Tavily search
    - store_report_tool: og_storage.upload_json
    - send_report_tool: axl.client.send_message to Originator
    - receive_assignment_tool: axl.client.receive_messages
    Commit: "feat: Specialist tools — search, store, AXL report"

[ ] 4.2 — Specialist agent definition
    Create agents/research_specialist/agent.py with:
    - Role: Industry Research Specialist
    - Goal: Master one assigned domain and produce a detailed
      strategy report on how an agent can make money in it
    - Backstory: You are a specialist researcher. You go deep,
      not broad. You produce actionable intelligence, not summaries.
    Commit: "feat: Specialist agent definition"

[ ] 4.3 — Specialist tasks
    Create agents/research_specialist/tasks.py with:
    - receive_assignment_task: get domain from AXL message
    - research_domain_task: deep research on assigned domain
    - produce_report_task: structure findings, store on 0G,
      send REPORT to Originator over AXL
    Commit: "feat: Specialist tasks — assign, research, report"

[ ] 4.4 — Specialist main entry point
    Create agents/research_specialist/main.py
    Commit: "feat: Specialist main — crew init and report loop"

---

### STAGE 5 — KeeperHub Integration (Day 7)

[ ] 5.1 — KeeperHub wrapper
    Create integrations/keeperhub.py with:
    - create_workflow(name, trigger, steps) → workflow_id
    - execute_transfer(to, amount, token) → execution_id
    - execute_contract_call(contract, abi, fn, args) → execution_id
    - get_status(execution_id) → dict
    - get_logs(execution_id) → list
    # AUTH REQUIRED: KEEPERHUB_API_KEY must be set in .env
    Document integration experience in FEEDBACK.md.
    Commit: "feat: KeeperHub wrapper — workflows and execution"

---

### STAGE 6 — Execution Agent (Day 7-8)

[ ] 6.1 — Execution tools
    Create agents/execution/tools.py with:
    - receive_assignment_tool: AXL receive
    - execute_on_chain_tool: wraps keeperhub.execute_contract_call
    - report_performance_tool: AXL send STATUS to Originator
    - store_strategy_tool: og_storage.upload_json
    Commit: "feat: Execution tools — on-chain, AXL, storage"

[ ] 6.2 — Execution agent definition
    Create agents/execution/agent.py with:
    - Role: Execution Agent
    - Goal: Execute the assigned business strategy, measure results,
      improve the strategy, and report performance to Originator
    Commit: "feat: Execution agent definition"

[ ] 6.3 — Execution tasks
    Create agents/execution/tasks.py with:
    - receive_strategy_task: get strategy from AXL
    - execute_task: run business activity via KeeperHub
    - measure_performance_task: evaluate results
    - improve_strategy_task: refine strategy, store new version on 0G
    - report_status_task: send STATUS to Originator over AXL
    Commit: "feat: Execution tasks — execute, measure, improve, report"

[ ] 6.4 — Execution main entry point
    Create agents/execution/main.py
    Commit: "feat: Execution main — crew init and execution loop"

---

### STAGE 7 — iNFT Minting (Day 8)

[ ] 7.1 — iNFT wrapper
    Create integrations/og_inft.py with:
    - mint_inft(root_hash, metadata) → token_id
    - get_inft(token_id) → dict
    - update_inft(token_id, new_root_hash) → bool
    Read 0G iNFT ERC-7857 official docs before writing.
    # AUTH REQUIRED: OG_PRIVATE_KEY must be set in .env
    Commit: "feat: 0G iNFT wrapper — mint, get, update"

[ ] 7.2 — Wire iNFT into Execution Agent
    Update agents/execution/tasks.py improve_strategy_task to:
    - Store improved strategy on 0G Storage → get root_hash
    - Mint new iNFT version referencing root_hash
    - Log new token_id with version number
    Commit: "feat: wire iNFT minting into execution agent strategy loop"

---

### STAGE 8 — Docker (Day 8-9)

[ ] 8.1 — Dockerfiles
    Create docker/Dockerfile.originator
    Create docker/Dockerfile.specialist
    Create docker/Dockerfile.execution
    Each must: use python:3.11-slim, install requirements.txt,
    copy the relevant agent folder, set correct CMD.
    Commit: "feat: Dockerfiles for all three agent containers"

[ ] 8.2 — docker-compose.yml
    Create docker/docker-compose.yml that:
    - Defines three services: originator, specialist, execution
    - Each mounts its own AXL config
    - Each passes environment variables from .env
    - Networks them together so AXL nodes can peer
    Commit: "feat: docker-compose — three agent services networked"

[ ] 8.3 — End-to-end docker test
    Run all three containers. Verify:
    - AXL nodes peer to each other
    - Originator sends a message, Specialist receives it
    - Confirm in logs
    Document any friction in FEEDBACK.md.
    Commit: "test: end-to-end docker AXL peer verification"

---

### STAGE 9 — Uniswap Integration (Day 9)

[ ] 9.1 — Uniswap wrapper
    Create integrations/uniswap.py with:
    - swap(token_in, token_out, amount) → tx_hash
    Use Uniswap Trading API. Sepolia testnet only.
    Document integration in FEEDBACK.md under "Uniswap".
    # AUTH REQUIRED: UNISWAP_API_KEY and WALLET_PRIVATE_KEY in .env
    Commit: "feat: Uniswap swap wrapper — token swap on Sepolia"

[ ] 9.2 — Wire Uniswap into Originator
    Update Originator to fund child agents using Uniswap swap
    before transferring via KeeperHub.
    Commit: "feat: wire Uniswap funding into Originator spawn flow"

---

### STAGE 10 — Demo and Polish (Day 9-10)

[ ] 10.1 — End-to-end demo run
    Run full system. Document the exact flow:
    Originator researches → spawns Specialist → Specialist reports
    → Originator spawns Execution Agent → Agent executes on Sepolia
    → Agent mints iNFT → Agent reports back to Originator
    Commit: "demo: full end-to-end run documented in README"

[ ] 10.2 — README update
    Update README.md with:
    - What MiliGents is (2 paragraphs)
    - Architecture diagram (ASCII)
    - Setup instructions
    - How to run the demo
    - Partner integrations explained
    Commit: "docs: complete README with setup and demo instructions"

[ ] 10.3 — FEEDBACK.md completion
    Ensure FEEDBACK.md has honest entries for:
    - Gensyn AXL
    - KeeperHub (required for prize)
    - Uniswap (required for prize)
    - 0G Storage
    - 0G Compute
    Commit: "docs: complete FEEDBACK.md for all partner integrations"

[ ] 10.4 — Demo video
    Record 2-4 minute video showing:
    1. Originator starts and researches
    2. Specialist receives assignment and reports back
    3. Execution agent executes on Sepolia via KeeperHub
    4. iNFT minted on 0G Chain
    5. Originator receives performance report
    Not a code walkthrough — show the system working.

---

## 3. What We Cut If Time Runs Short

Priority order — cut from the bottom up:

1. KEEP: AXL communication (prize requirement)
2. KEEP: Originator research loop (core product)
3. KEEP: KeeperHub execution (prize requirement)
4. KEEP: 0G Storage (prize requirement)
5. KEEP: Research Specialist agent (core product)
6. CUT IF NEEDED: Uniswap swap (replace with direct transfer)
7. CUT IF NEEDED: iNFT minting (replace with storage only)
8. CUT IF NEEDED: Execution agent improvement loop
9. CUT IF NEEDED: Multiple execution agents (demo with one)

---

## 4. Prize Tracks We Are Targeting

| Partner   | Prize Criteria                              |
|-----------|---------------------------------------------|
| Gensyn    | Demonstrate AXL on separate nodes           |
| KeeperHub | Working on-chain execution + FEEDBACK.md    |
| 0G        | Storage + Compute + iNFT demonstrated       |

Maximum 3 partner prizes can be selected on submission form.

---

## 5. Submission Checklist

[ ] GitHub repo public with full commit history
[ ] README.md complete with setup instructions
[ ] FEEDBACK.md complete for all partners
[ ] Demo video 2-4 minutes uploaded
[ ] ETHGlobal hacker dashboard submission form filled
[ ] Three partner prizes selected on submission form
