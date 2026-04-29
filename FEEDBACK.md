
## Gensyn AXL

### What worked
- Binary builds cleanly with Go 1.25.5
- TLS peering between two local nodes establishes correctly
- HTTP API (/topology, /recv) responds correctly
- Key generation with openssl works on Linux

### What doesn't work on bare metal
- Message delivery between two nodes on the same machine fails
- Error: "connect tcp [IPv6]:tcp_port: connection was refused"
- Root cause: gVisor userspace IPv6 overlay cannot route between
  two processes on the same host — needs separate network interfaces
- Solution: use Docker containers (each gets its own network interface)

### What is missing from docs
- The "Quick Two-Node Test" in official docs does not mention that
  message delivery requires internet connectivity or separate network
  interfaces. It appears to only work with Docker or two real machines.


## KeeperHub

### What worked
- MCP server builds and runs cleanly with pnpm
- SSE transport works correctly
- Tool calls succeed once session lifecycle is understood
- Workflow listing and AI generation both work
- Health endpoint responds correctly

### What was confusing
- The /message endpoint returns "Accepted" not the tool result
- Tool response comes back through the SSE stream, not the POST response
- This SSE response pattern is not documented clearly in the repo README
- The sessionId must be used while the SSE connection is still open
  — closing the connection before sending the message causes 404

### What is missing from docs
- No clear example of the full SSE → POST → SSE response cycle
- No Python client example — only Claude Code config shown
- The session lifecycle (session dies when SSE closes) is not mentioned

### Suggested improvement
- Add a Python example showing the correct SSE session flow
- Document that tool responses arrive via SSE stream, not HTTP response


## Uniswap

### What we built
- Quote endpoint wrapper via Trading API REST
- Swap execution flow (quote → order)
- Token balance checker
- WETH/USDC Sepolia testnet constants
- Wrapper wired into Originator for treasury management

### What worked
- Trading API REST interface is clean and well-documented
- Quote flow is straightforward

### What requires more work
- execute_swap requires wallet signing — needs ethers.js or web3.py
  integration to sign the transaction before submitting to /order
- Full mainnet swap requires proper signature — current implementation
  uses placeholder "0x" signature for demo purposes

### Suggested improvement
- Add a signing helper that uses WALLET_PRIVATE_KEY to sign the
  Uniswap permit2 calldata before submitting the order
- Better error messages when API key is missing or invalid


## 0G Storage

### What we built
- TypeScript bridge service wrapping the 0G Storage SDK
- Upload endpoint: POST /storage/upload → returns root_hash
- Download endpoint: GET /storage/download → returns data
- Python bridge client (integrations/bridge_client.py) so agents
  never touch TypeScript directly
- Full smoke test: upload → download → verify content matches

### What worked
- Once the correct SDK was installed, upload and download both work cleanly
- Root hash is returned immediately and is a reliable permanent address
- Galileo testnet storage network was active and healthy throughout development
- StorageScan explorer (storagescan-galileo.0g.ai) was useful for verifying
  that uploads were reaching the network

### Critical issue — two SDKs with similar names
- npm has two packages: @0glabs/0g-ts-sdk (old) and @0gfoundation/0g-ts-sdk (new)
- The correct package for Galileo testnet is @0gfoundation/0g-ts-sdk v1.2.1
- Installing the wrong one produces a silent mismatch — the SDK loads,
  the bridge starts, but every upload fails with:
  "execution reverted: require(false)"
- The error gives no indication that the SDK version is the cause
- We lost significant debugging time checking fees, wallet balance,
  key format, and contract state before identifying the root cause
- The official docs do not clearly distinguish between these two packages

### What was confusing
- MemData requires a minimum payload size of 256 bytes
  Payloads below this threshold fail silently — no error is thrown,
  but the upload either reverts or returns an invalid root hash
  The minimum size requirement is not documented
- The require(false) revert error carries no useful message
  It does not indicate whether the failure is: wrong SDK, wrong fee,
  wrong key format, wrong contract address, or insufficient balance
  We had to eliminate each possibility manually
- No Python SDK exists — this is not stated clearly in the docs
  Developers building Python agents must either use subprocess to call
  the CLI or build a TypeScript bridge service themselves
  We chose the bridge approach — it is cleaner but adds a service
- The correct storage indexer URL for Galileo testnet is not clearly
  stated in the main docs. Multiple endpoints are listed and the turbo
  indexer (indexer-storage-testnet-turbo.0g.ai) is the correct one
  for reliable uploads — this required trial and error to confirm

### What is missing from docs
- A clear statement that @0gfoundation/0g-ts-sdk is the correct package
  for Galileo testnet, and that @0glabs/0g-ts-sdk is outdated
- Minimum MemData payload size requirement (256 bytes)
- A Python integration example — even a minimal REST wrapper would help
- A troubleshooting section for the require(false) revert error

### Suggested improvement
- Rename or deprecate the old npm package to prevent confusion
- Add a version compatibility table: SDK version → testnet/mainnet
- Add a Python code example showing the bridge pattern
- Improve the require(false) error to include a reason string


## 0G iNFT (ERC-7857)

### What we built
- Solidity contract (contracts/INFT.sol) implementing ERC-7857
- Deployed to 0G Chain Galileo testnet
- Bridge endpoints: POST /inft/mint and GET /inft/get
- Versioned intelligence NFTs — each agent strategy is a minted iNFT
  referencing a root_hash stored on 0G Storage
- Full smoke test: mint → get → verify root_hash and owner match

### What worked
- Contract compiled and deployed cleanly with Hardhat on 0G testnet
- ethers v6 integration inside the bridge was straightforward
- Mint returns a token_id immediately
- Get retrieves root_hash, version, and owner address correctly
- Versioning model works — each strategy improvement mints a new token
  with an incremented version number, full lineage preserved on-chain

### What was confusing
- No official ERC-7857 contract deployment exists on Galileo testnet
  We had to write and deploy our own contract from scratch
  The standard only defines the interface — no reference implementation
  is provided or deployed for developers to test against
- The relationship between 0G Storage root_hash and iNFT metadata
  is not documented with a concrete example
  We had to design the data model ourselves:
  iNFT stores root_hash as the pointer to the actual intelligence data
  The intelligence lives on 0G Storage, the ownership lives on-chain

### What is missing from docs
- A reference ERC-7857 contract deployed on Galileo testnet
  that developers can use without deploying their own
- A concrete example showing the full flow:
  data → 0G Storage → root_hash → iNFT mint → token_id
- Contract ABI published somewhere developers can reference

### Suggested improvement
- Deploy and publish an official ERC-7857 reference contract on Galileo
- Document the intended data model: what should live in storage
  vs what should live in the NFT metadata on-chain

## 0G Compute

### What we built
- integrations/og_compute.py — OpenAI-compatible LLM wrapper
- get_client() — returns configured client from environment variables
- chat() — multi-turn conversation with optional system prompt
- chat_simple() — single prompt convenience wrapper
- test_connection() — verifies LLM endpoint is reachable
- Two-phase strategy: Cerebras for development, 0G Compute for demo
  — switching between them requires changing only three env vars:
  LLM_BASE_URL, LLM_API_KEY, LLM_MODEL — zero code change

### What worked
- OpenAI-compatible interface is clean and well designed
- The env-var swap pattern worked perfectly — same code runs against
  both Cerebras and 0G Compute without modification
- Cerebras was fast and reliable for all development and testing
- 0G Compute endpoint responded correctly once provider was configured

### What was confusing
- 0G Compute requires depositing tokens to a provider sub-account
  before the first inference call — this is not the same as having
  a wallet balance. A developer can have 0G tokens and still get
  auth errors because the provider sub-account has not been funded
  This flow is buried in the docs and easy to miss
- Model names are not listed in one clear place
  Testnet model (qwen-2.5-7b-instruct) and mainnet models
  (deepseek-chat-v3-0324, gpt-oss-120b) are mentioned in different
  sections — we had to search across multiple pages to confirm them
- The local proxy option (0g-compute-cli inference serve) is mentioned
  briefly but not explained well — it is actually the cleanest path
  for Python developers but requires additional CLI setup steps
  that are not documented end-to-end

### What is missing from docs
- A clear quickstart showing the full flow:
  deposit → select provider → get API key → first inference call
- A single page listing all available models per environment
  (testnet vs mainnet) with their exact model string identifiers
- A Python example using the OpenAI client with 0G base_url
  The docs show curl examples but Python agents need the SDK pattern

### Suggested improvement
- Add a provider sub-account funding guide at the top of the
  compute quickstart — this is the most common first failure point
- Publish a maintained model list with availability per network
- Add a Python code example alongside the existing curl examples
