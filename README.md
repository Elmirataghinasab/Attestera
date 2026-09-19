# Attestera

A decentralized academic credential registry — tamper-proof credential
issuance and verification, built on Arbitrum. Foundry (Solidity) backend,
React frontend, client-side AES-256-GCM + ECIES encryption.

## Structure

```
attestera/
├── docs/                   Proposal, Design Decisions Log, Implementation
│   │                        Plan, Backend Code Walkthrough, Encryption
│   │                        Module Deep Dive
│   └── diagrams/            Architecture, class, use case, sequence,
│                            state, and deployment diagrams (PNG)
├── contracts/               Foundry project — Solidity contracts + tests
│   ├── src/
│   │   ├── AccessControlRegistry.sol
│   │   └── CredentialRegistry.sol
│   ├── test/                 64+ tests: unit, fuzz, invariant, integration
│   ├── script/Deploy.s.sol
│   └── foundry.toml
└── frontend/                 React + Vite dashboard app (Attestera)
    └── src/
        ├── lib/                wallet, contracts, encryption, storage (Pinata/IPFS)
        ├── components/
        └── pages/               Admin, Issuer, Owner, Verifier dashboards
```

## Getting started — contracts

```bash
cd contracts
curl -L https://foundry.paradigm.xyz | bash && foundryup
mkdir -p lib && git clone https://github.com/foundry-rs/forge-std lib/forge-std
forge test
```

To deploy to Arbitrum Sepolia, create `contracts/.env` (never commit this
file) with:

```
PRIVATE_KEY=your_wallet_private_key
ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
ARBISCAN_API_KEY=            # optional, only needed for --verify
```

Then:

```bash
forge script script/Deploy.s.sol --rpc-url arbitrum_sepolia --broadcast
```

Save the two addresses it prints — they go into the frontend's `.env`.

## Getting started — frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Fill in `.env` with:
- The two contract addresses from the deploy step
- A Pinata JWT for real IPFS storage — free account at
  [app.pinata.cloud](https://app.pinata.cloud) → API Keys → New Key
  (enable `pinFileToIPFS`)

Requires an EVM wallet browser extension (e.g. MetaMask) connected to
Arbitrum Sepolia.

## Testing all four roles

The system has four roles — Admin, Issuer, Owner, Verifier — each best
tested from a separate wallet account:

1. **Admin** — the wallet that ran the deploy script (it's set as Admin
   automatically). Approves institutions, adds majors.
2. **Issuer** — approved by Admin, issues credentials to Owner addresses.
3. **Owner** — receives credentials, grants/revokes access to Verifiers.
4. **Verifier** — checks a credential's status, views the document once
   granted access.

Each of Issuer/Owner/Verifier needs a small amount of Arbitrum Sepolia
testnet ETH and must complete the one-time "enable encryption" signature
before they can send or receive an encrypted document key.

## Reading order

If picking this up fresh: `docs/Credential_Registry_Proposal_EN.docx` →
`docs/Design_Decisions_Log.docx` → `docs/Implementation_Plan.docx` →
`docs/Backend_Code_Walkthrough.docx` → `docs/Encryption_Module_Deep_Dive.docx`
→ `contracts/src/` → `frontend/src/`.
