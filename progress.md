# Paperclip Protocol — Progress

Last updated: 2026-02-09

## Plan (MVP)

### Phase 0 — Scaffold
- [x] Initialize Anchor workspace
- [x] Create repo structure (`design/`, `cli/`, `skills/`)
- [x] Add Genesis doc to `design/MVP-PLAN.md`
- [x] Add placeholders: `skills/paperclip-protocol/SKILL.md`, `HEARTBEAT.md`
- [x] Add CLI package skeleton

### Phase 1 — Solana Program (MVP Core)
- [x] Account structs in `programs/paperclip-protocol/src/state`
- [x] Instruction handlers (initialize/register_agent/create_task/submit_proof)
- [x] Error codes in `programs/paperclip-protocol/src/error.rs`
- [x] Anchor tests for full loop
- [x] `anchor build`
- [x] `anchor test`

### Phase 2 — Storacha Integration
- [x] Implement `cli/src/storacha.ts` (upload JSON → CID)
- [ ] Validate upload locally

### Phase 3 — CLI
- [x] Scaffold Commander.js CLI
- [x] Implement `pc init`
- [x] Implement `pc status`
- [x] Implement `pc tasks`
- [x] Implement `pc do`
- [ ] CLI manual test vs localnet
 - [x] Add `.env.example` + README env docs
 - [x] Hardcode shared Storacha delegation proof in CLI (env override supported)
 - [x] Add JS integration test for CLI (`cli/tests/cli.integration.test.js`)

### Phase 4 — Integration + OpenClaw
- [ ] Add real SKILL/HEARTBEAT content (post research)
- [ ] Seed sample tasks via `create_task`
- [ ] End-to-end test on localnet

## Notes
- We are implementing a thin end-to-end slice first, then widening coverage.
- Storacha auth is env-based for MVP.
- `anchor build` failed due to `edition2024` requiring a newer Solana SBF toolchain; set `Anchor.toml` `toolchain.solana_version = 3.1.6` and upgrade Agave.
- CLI TypeScript build passes (`npm run build` in `cli/`).
- Storacha validation pending (requires `W3UP_SPACE_PROOF` + optional `W3UP_SPACE_DID`).
- CLI manual test blocked in this environment: localhost RPC connections are denied (`Operation not permitted`). Run manual tests on your machine.

## MVP Remaining Work (Planned)
- [ ] Admin tooling to create/seed tasks (CLI command or script)
- [ ] Devnet deploy + config (program ID + RPC)
- [ ] CLI packaging for npm (`pc` binary install)
- [ ] CLI error handling / UX hardening
- [ ] End-to-end manual tests (localnet + devnet)
- [ ] README polish (install + run steps for agents)
- [ ] Final OpenClaw SKILL/HEARTBEAT content + agent loop test (if demo requires)
