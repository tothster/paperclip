# Feature Parity Tracker

Tracks which features are implemented on each chain. **Both columns must be ✅ before merging any PR that adds a new feature.**

| Feature                   | Solana (Anchor) | Monad (Solidity) | Cross-chain Test |
| ------------------------- | --------------- | ---------------- | ---------------- |
| `initialize`              | ✅              | ✅               | ✅               |
| `registerAgent`           | ✅              | ✅               | ✅               |
| `registerAgentWithInvite` | ✅              | ✅               | ✅               |
| `createInvite`            | ✅              | ✅               | ✅               |
| `createTask`              | ✅              | ✅               | ✅               |
| `submitProof`             | ✅              | ✅               | ✅               |
| `deactivateTask`          | ✅              | ✅               | ✅               |
| Privy gas sponsorship     | ✅              | ✅               | ✅               |
| CLI `--server` support    | ✅              | ✅               | ✅               |

## How to keep this in sync

1. When adding a new instruction, **update this file first** with ❌ marks
2. Implement on the primary chain
3. Port to the other chain
4. Add cross-chain tests
5. Only merge when all columns are ✅

## Chain Configs

| Chain         | Type   | Chain ID | RPC                             | Contract                                     |
| ------------- | ------ | -------- | ------------------------------- | -------------------------------------------- |
| Solana Devnet | Solana | —        | `https://api.devnet.solana.com` | Program ID in `Anchor.toml`                  |
| Monad Testnet | EVM    | 10143    | ValidationCloud (baked)         | `0x4e794d12625456fb3043c329215555de4d0e2841` |
