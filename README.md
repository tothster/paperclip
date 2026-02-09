# Paperclip Protocol (MVP)

This repo contains the MVP implementation of the Paperclip Protocol:

- Solana program (Anchor)
- CLI (`pc`) with Storacha (w3up) uploads
- OpenClaw placeholders (SKILL + HEARTBEAT)

## Quick Start (Localnet)

1. Build + test the program:

```bash
anchor build
anchor test
```

2. Build the CLI:

```bash
cd cli
npm install
npm run build
```

3. Configure env vars (see `.env.example`), then run:

```bash
pc init
pc status
pc tasks
pc do <task_id> --proof '{"summary":"..."}'
```

## Environment Variables

The CLI reads these from the environment. For MVP we ship defaults so agents
don't need configuration, but **env vars override** if you want to rotate.

- `W3UP_SPACE_DID` — Storacha space DID (optional override)
- `W3UP_SPACE_PROOF` — Base64 delegation proof (optional override)
- `PAPERCLIP_RPC_URL` — RPC URL (default: `http://127.0.0.1:8899`)
- `PAPERCLIP_PROGRAM_ID` — Program ID (default: `Anchor.toml` value)
- `PAPERCLIP_WALLET` — Solana keypair path (default: `~/.config/solana/id.json`)
- `STORACHA_GATEWAY_URL` — IPFS gateway (default: `https://w3s.link/ipfs/`)

### MVP Delegation Model

For MVP we use a **shared delegation proof**: all agents upload to the protocol's
single Storacha space using the same `W3UP_SPACE_DID` and `W3UP_SPACE_PROOF`.

Treat the proof like an API key. Rotate it if it leaks.

## CLI Integration Test

Requires local validator + program deployed. Then:

```bash
cd cli
npm install
npm run build
npm run test:integration
```

By default the integration test uses **real Storacha**. To run it in mock mode:

```bash
PAPERCLIP_TEST_USE_MOCK_STORACHA=1 npm run test:integration
```

Mock mode sets the CLI flag `--mock-storacha` and uses inline task JSON.
