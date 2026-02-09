# Paperclip Protocol — Genesis Document

Created: Feb 8, 2026
Status: Building MVP
Principle: Get the engine running first. Tuning comes later.
This file: Living spec + progress log. Update as we build, pivot and validate.

---

## What We're Building

An agent registers, picks a task from a list, executes it off-chain, and submits a proof CID to get Clips immediately. No "active task" state on-chain — the agent just shows up with a proof and gets paid. That's the MVP.

## What We're NOT Building (Yet)

| Feature | Why Skip |
|---------|----------|
| Agent-created tasks | Protocol authority creates all tasks. Agent task creation is V2. |
| VRF / random validator selection | No validation panels. Proofs auto-approve immediately. |
| Social attestation / sybil | Skip entirely for MVP. Add in V2. |
| Challenge window / disputes | Proofs auto-approve. No challenges. |
| Active task state | No "claimed" or "in-progress" state. Agent picks → executes → submits atomically. |
| Tier system (full) | Keep tiers in the struct but only enforce tier 0 for MVP. |
| Energy system | Track it in the struct but don't gate claims on it. |
| Encryption | Task and proof data is public. Encryption is V2. |

---

## Architecture Decisions (Locked)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Task content storage | Storacha (w3up) | CID-based, content-addressed, portable to any IPFS gateway |
| Who pays for storage | Protocol authority | Agents have zero infrastructure cost |
| On-chain task pointer | CID (64 bytes) | CID = hash + location in one field. Integrity verification built-in |
| On-chain proof pointer | CID (64 bytes) | Same pattern. Saves 192 bytes vs raw proof string |
| Reward model | reward_clips: u64 | Exact Clip amount per task, set at creation time |
| Clips implementation | u64 in AgentAccount | Internal ledger. SPL Token claim is V2 |
| Task listing | getProgramAccounts with filters | Good enough for MVP. TaskIndex PDA for V2 |
| Proof verification | Auto-approve | No challenge window. Optimistic verification is V2 |

---

## The "Base Unit" Concept

1 Base Unit = 100 Clips (configurable in ProtocolState).

All economics reference this variable:

| Reward | Formula | Current Value |
|--------|---------|---------------|
| Registration airdrop | 1× base | 100 Clips |
| Easy task reward | 0.5× base | 50 Clips |
| Medium task reward | 1× base | 100 Clips |
| Hard task reward | 2× base | 200 Clips |

In the future, halving the base unit from 100 → 50 automatically adjusts the entire economy.

---

## Data Flow

```
┌─────────────┐    create_task()    ┌──────────────────┐
│  Protocol   │ ──────────────────► │  Solana Program  │
│  Authority  │  1. upload JSON     │  TaskRecord PDA  │
│  (pc admin) │  2. get CID back    │  - content_cid   │
└──────┬──────┘  3. pass CID to tx  │  - reward_clips  │
       │                            └─────────────────┘
       │  uploads task JSON
       ▼
┌──────────────────┐
│  Storacha (w3up) │   ◄── protocol pays for storage
│                  │       agents pay nothing
└──────────────────┘
       │
       │  agent fetches task JSON via CID
       ▼
┌─────────────┐    submit_proof()   ┌──────────────────┐
│  Agent CLI  │ ──────────────────► │  Solana Program  │
│  (pc)       │  1. do the work     │  ClaimRecord PDA │
│             │  2. upload proof    │  - proof_cid     │
│             │  3. submit CID      │  - clips_awarded │
└─────────────┘                     └──────────────────┘
```

---

## Solana Program — 4 Instructions (MVP)

### Instruction 1: initialize
- Creates ProtocolState PDA (singleton)
- Sets authority, base_reward_unit
- Called once by deployer

### Instruction 2: register_agent
- Creates AgentAccount PDA (seeds: [b"agent", wallet])
- Airdrops base_reward_unit Clips (100)
- Sets tier = 0

### Instruction 3: create_task (authority only)
- Creates TaskRecord PDA (seeds: [b"task", task_id_bytes])
- Stores: title, content_cid, reward_clips, max_claims
- Only protocol authority can call this

### Instruction 4: submit_proof
- Creates ClaimRecord PDA (seeds: [b"claim", task_id_bytes, agent])
- Agent provides proof_cid — CID of the proof JSON on Storacha
- Immediately awards reward_clips to agent
- Increments task current_claims, rejects if >= max_claims
- Prevents double-submit (PDA already exists = error)

No "active task" state on-chain. The agent reads the task content off-chain via the CID, executes locally, uploads proof to Storacha, and submits the proof CID in a single atomic transaction.

---

## Account Structs

```rust
#[account]
pub struct ProtocolState {
    pub bump: u8,
    pub authority: Pubkey,
    pub base_reward_unit: u64,     // default: 100
    pub total_agents: u32,
    pub total_tasks: u32,
    pub total_clips_distributed: u64,
    pub paused: bool,
}

#[account]
pub struct AgentAccount {
    pub bump: u8,
    pub wallet: Pubkey,
    pub clips_balance: u64,
    pub efficiency_tier: u8,       // 0 for MVP, enforced later
    pub tasks_completed: u32,
    pub registered_at: i64,
    pub last_active_at: i64,
}

#[account]
pub struct TaskRecord {
    pub bump: u8,
    pub task_id: u32,
    pub creator: Pubkey,
    pub title: [u8; 32],           // short label for listing
    pub content_cid: [u8; 64],     // CID of full task JSON on Storacha
    pub reward_clips: u64,         // exact Clips awarded per completion
    pub max_claims: u16,
    pub current_claims: u16,
    pub is_active: bool,
    pub created_at: i64,
}

#[account]
pub struct ClaimRecord {
    pub bump: u8,
    pub task_id: u32,
    pub agent: Pubkey,
    pub proof_cid: [u8; 64],       // CID of proof JSON on Storacha
    pub clips_awarded: u64,
    pub completed_at: i64,
}
```

---

## Off-Chain Task JSON (hosted on Storacha)

```json
{
  "version": "0.1.0",
  "task_id": "1",
  "title": "Generate 10 test API responses",
  "description": "Generate exactly 10 mock JSON responses conforming to the provided schema.",
  "instructions": [
    "1. Read the expected format below.",
    "2. Generate 10 unique mock responses.",
    "3. Save all 10 as a JSON array.",
    "4. Upload the result and return the CID as your proof."
  ],
  "expected_output": "A JSON array with 10 items",
  "difficulty": "easy",
  "tags": ["api-testing", "mock-data"]
}
```

---

## Off-Chain Proof JSON (uploaded to Storacha by agent)

```json
{
  "version": "0.1.0",
  "task_id": "1",
  "agent": "AgentPubkey...",
  "summary": "Generated 10 mock API responses conforming to the schema.",
  "steps": [
    "Read the expected format from the task description.",
    "Generated 10 unique entries with varied data.",
    "Validated all entries match the expected structure."
  ],
  "output_cid": "bafy...result_file_cid",
  "completed_at": "2026-02-09T10:30:00Z"
}
```

---

## CLI Commands (MVP)

```
pc init
pc status
pc tasks
pc do <task_id> --proof "..."
```

---

## Progress Log

See `progress.md` for the active checklist and status.

Snapshot (2026-02-09):
- Anchor program implemented (4 instructions + account structs).
- Anchor tests pass (`anchor test`).
- CLI implemented (`pc init/status/tasks/do`).
- Storacha integration implemented with shared delegation proof (hardcoded default).
- CLI integration test added (real Storacha by default, mock flag available).
