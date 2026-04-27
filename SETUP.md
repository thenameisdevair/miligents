# MiliGents — Setup Guide

## Prerequisites

- Python 3.11+
- Node.js 22+
- Docker + Docker Compose
- Git

---

## 1. Clone the repo

```bash
git clone https://github.com/thenameisdevair/miligents.git
cd miligents
```

---

## 2. Set up Python environment

```bash
python3 -m venv venv
source venv/bin/activate        # Linux/Mac
# venv\Scripts\activate         # Windows

pip install -r requirements.txt
```

---

## 3. Set up the TypeScript bridge

```bash
cd bridge
npm install
cd ..
```

---

## 4. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in these values before running anything:

| Key | Where to get it |
|-----|----------------|
| `LLM_API_KEY` | https://cloud.cerebras.ai (free) |
| `TAVILY_API_KEY` | https://app.tavily.com |
| `KEEPERHUB_API_KEY` | https://app.keeperhub.com → Settings → API Keys |
| `OG_PRIVATE_KEY` | Your funded 0G testnet wallet private key |
| `OG_COMPUTE_PROVIDER_ADDRESS` | Run provider discovery — see 0G docs |
| `WALLET_PRIVATE_KEY` | Your Sepolia testnet wallet private key |
| `WALLET_ADDRESS` | Your Sepolia testnet wallet address |

---

## 5. Generate AXL node keys

Download the AXL binary from https://github.com/gensyn-ai/axl/releases

```bash
# Generate three separate identity keys — one per agent container
./axl keygen --output axl/configs/private-a.pem
./axl keygen --output axl/configs/private-b.pem
./axl keygen --output axl/configs/private-c.pem
```

These files are in .gitignore — never commit them.

---

## 6. Get testnet tokens

- **0G testnet tokens:** https://faucet.0g.ai
- **Sepolia ETH:** https://sepoliafaucet.com

---

## 7. Run the full stack

```bash
cd docker
docker compose up --build
```

This starts four containers:
- `bridge` — TypeScript 0G bridge service on port 3100
- `originator` — Originator agent + AXL node A
- `specialist` — Research Specialist agent + AXL node B
- `execution` — Execution agent + AXL node C

---

## 8. Verify everything is running

```bash
# Check bridge health
curl http://localhost:3100/health

# Check container logs
docker compose logs originator
docker compose logs bridge
```
