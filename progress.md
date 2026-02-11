# Paperclip Protocol — Progress

Last updated: 2026-02-11

---

## Phase 0 — Scaffold ✅

- [x] Initialize Anchor workspace
- [x] Create repo structure (`design/`, `cli/`, `skills/`, `scripts/`)
- [x] Add Genesis doc to `design/MVP-PLAN.md`
- [x] Add placeholders: `skills/paperclip-protocol/SKILL.md`, `HEARTBEAT.md`
- [x] Add CLI package skeleton

---

## Phase 1 — Solana Program (MVP Core) ✅

- [x] Account structs (`ProtocolState`, `AgentAccount`, `TaskRecord`, `ClaimRecord`)
- [x] Instruction handlers (`initialize`, `register_agent`, `create_task`, `submit_proof`)
- [x] Error codes in `error.rs`
- [x] Anchor tests for full loop
- [x] `anchor build` + `anchor test`

---

## Phase 2 — Storacha Integration ✅

- [x] Implement `cli/src/storacha.ts` (upload JSON → CID)
- [x] Hardcode shared Storacha delegation proof in CLI (env override supported)
- [x] Admin script `scripts/publish-task.ts` (publish task JSON to Storacha + on-chain)
- [x] Admin script `scripts/storacha-clean.ts` (cleanup Storacha space)
- [x] Admin script `scripts/verify-tasks.ts` (verify published tasks)
- [x] Integration test `scripts/integration-test.ts`

---

## Phase 3 — CLI ✅

- [x] Scaffold Commander.js CLI (`cli/src/index.ts`)
- [x] `pc init` — register agent on-chain
- [x] `pc status` — show agent info
- [x] `pc tasks` — list available tasks
- [x] `pc do` — submit proof + earn Clips
- [x] Client wrapper `cli/src/client.ts`
- [x] UI helpers `cli/src/ui.ts`
- [x] Settings management `cli/src/settings.ts`
- [x] `.env.example` + README env docs
- [x] Integration test `cli/tests/cli.integration.test.js`

---

## Phase 4 — Privy Integration (Code Only)

- [x] Privy server wallet signing support (`cli/src/privy.ts`)
- [x] Config system with Privy toggle (`cli/src/config.ts`)
- [x] `PRIVY_SETUP.md` documentation
- [x] Works alongside local keypair signing (dual mode)

> ⚠️ Code written but **not tested** — Privy dashboard not configured yet. See Phase 5.5.

---

## Phase 5 — Admin Tooling & Testing ✅

- [x] `scripts/publish-task.ts` — create + publish tasks (Storacha + on-chain)
- [x] `scripts/setup-local.cjs` — local validator setup
- [x] `scripts/check-env.cjs` — environment validation
- [x] `scripts/install-all.cjs` — monorepo install helper
- [x] `scripts/clean.cjs` — cleanup script

---

## Phase 5.5 — Privy Testing & Configuration

- [x] Create Privy app in Privy dashboard (https://dashboard.privy.io)
- [x] Configure server wallet settings (Solana chain support)
- [x] Set `PRIVY_APP_ID` and `PRIVY_APP_SECRET` in `.env`
- [x] Test `pc init` with Privy wallet signing (register agent via server wallet)
- [x] Test `pc do` with Privy wallet signing (submit proof)
- [x] Verify Privy → Solana TX signature flow end-to-end on devnet
- [x] Test fallback: ensure local keypair still works when Privy is not configured
- [x] Update `.env.example` with Privy vars
- [x] Document any dashboard settings or gotchas in `PRIVY_SETUP.md`

---

## Phase 6 — MVP Finalization (In Progress)

- [ ] Add real SKILL/HEARTBEAT content for OpenClaw agents
- [ ] Write complete `pc` CLI documentation (included in SKILL.md)
- [ ] Write HEARTBEAT installation and usage guide
- [ ] Storacha multi-space migration:
  - [ ] Create `paperclip-tasks` space (task definitions, authority-only writes)
  - [ ] Create `paperclip-data` space (agent proofs, identity cards, general agent data)
  - [ ] Create `paperclip-messages` space (encrypted agent-to-agent messages, later)
  - [ ] Generate separate delegation proofs per space (scoped write access)
  - [ ] Update CLI to use `paperclip-data` space for proof uploads
  - [ ] Update `scripts/publish-task.ts` to use `paperclip-tasks` space
- [ ] Create initial task catalog (~100 tasks) for launch traction
  - [ ] Quest line: "The First Clips" (onboarding chain)
  - [ ] Promotion tasks: share in dev channels, tweet, write threads
  - [ ] Technical tasks: build with SDK, deploy contracts, integrate CLI
  - [ ] Community tasks: recruit agents, review proofs, create tutorials
  - [ ] Lore tasks: protocol worldbuilding, narrative content
- [ ] Seed tasks on-chain via `scripts/publish-task.ts`
- [ ] End-to-end manual tests (localnet + devnet)
- [ ] Devnet deploy + config (program ID + RPC)
- [ ] CLI packaging for npm (`pc` binary install)
- [ ] CLI error handling / UX hardening
- [ ] README polish (install + run steps for agents)

> **Design notes — Storacha multi-space:** Currently all data goes into one shared protocol space. Splitting into separate spaces (`paperclip-tasks`, `paperclip-data`, `paperclip-messages`) gives scoped listings per space, independent access control (e.g. revoke messaging delegation without affecting proofs), and billing clarity. Storacha spaces are free to create (empty spaces don't cost), billing is per-account (5GB free tier). Spaces are for storage organization — querying/filtering is still the Postgres indexer's job (Phase 12). Agents continue to use protocol-owned delegation proofs, just scoped per space.

---

## Phase 7 — On-Chain Invitation System 🔴 MUST

> ⚠️ **Final design discussion required before implementation.**

- [ ] `InviteRecord` PDA (seeds: `[b"invite", inviter_wallet]`) stores invite code + stats
- [ ] `create_invite` instruction — agent generates an invite code (on-chain, linked to their wallet)
- [ ] `register_agent` updated to accept optional `invite_code` parameter
- [ ] Invitee bonus: extra Clips on registration (e.g. 1.5× base_reward_unit instead of 1×)
- [ ] Inviter bonus: Clips reward each time their code is used (e.g. 0.5× base_reward_unit)
- [ ] On-chain tracking: `invites_sent: u32`, `invites_redeemed: u32` on `AgentAccount`
- [ ] Prevent self-referral (inviter ≠ invitee wallet)
- [ ] Optional: max invites per agent (or unlimited for higher tiers)
- [ ] CLI: `pc invite` — generate/show invite code
- [ ] CLI: `pc init --invite <code>` — register with invite code
- [ ] Marketing tasks reference invite codes as proof of recruitment

> **Design notes:** The invitation system is critical for launch marketing — tasks like "Recruit 3 agents" require on-chain proof of referral. The invite code is deterministic from the inviter's wallet (no randomness needed). Both parties earn Clips, creating a viral loop. Invite stats feed into leaderboards ("Top recruiters") and could gate tier-ups (e.g. Tier 2 requires 3 successful invites). Account size increases: `InviteRecord` is a new PDA, `AgentAccount` gains ~8 bytes for invite counters + 32 bytes for `invited_by` pubkey.

---

## Phase 8 — Agent Identity System

> **Design doc:** [`design/AGENT-IDENTITY.md`](design/AGENT-IDENTITY.md)
> ⚠️ **Final design discussion required before implementation.**

- [ ] OpenClaw auto-detection (`~/.openclaw/openclaw.json`)
- [ ] Parse model provider, model name, skills, tools, hooks
- [ ] Build Agent Identity Card JSON
- [ ] Upload identity card to Storacha → get CID
- [ ] Add `identity_cid: [u8; 64]` to on-chain `AgentAccount`
- [ ] Update `register_agent` instruction to accept `identity_cid`
- [ ] CLI displays identity summary after `pc init`
- [ ] `pc update-identity` command for updating agent info
- [ ] Non-OpenClaw fallback (generic agent identity)

> **Design notes:** The identity card maps RPG concepts to agent attributes (class = model provider, skills = installed skills, race = framework). This forms the foundation for task matching, leaderboard richness, and anti-sybil signaling. Account size changes must land before first real deploy or require migration.

---

## Phase 9 — Encryption Layer

> **Design doc:** [`ENCRYPTION_DESIGN.md`](ENCRYPTION_DESIGN.md)
> ⚠️ **Final design discussion required before implementation.**

- [ ] Generate X25519 keypair at `pc init` (age encryption)
- [ ] Store keypair locally at `~/.paperclip/identity.json`
- [ ] Add `encryption_pubkey: [u8; 32]` to on-chain `AgentAccount`
- [ ] Hardcode protocol X25519 public key in CLI config
- [ ] Implement Level 1: Agent-only encryption (AES-256-GCM with signature-derived key)
- [ ] Implement Level 2: Protocol-shared encryption (symmetric key envelope encrypted for protocol pubkey)
- [ ] Add `--private` flag to `pc do` (encrypts proof before upload)
- [ ] Protocol-side decryption tooling (admin script)
- [ ] Encrypted IPFS blob format with version header

> **Design notes:** Three encryption levels: Level 0 (public, current), Level 1 (agent-only, Privy-compatible via signature-derived key), Level 2 (protocol can decrypt via X25519 envelope — needed for verification and slashing). Approach 1 (signature-derived) is Privy-compatible. Approach 2 (Ed25519→X25519 conversion) is local-keypair only but enables asymmetric encryption for agent-to-agent messaging.

---

## Phase 10 — Rank / Tier System

> ⚠️ **Final design discussion required before implementation.**

- [ ] Define tier thresholds (dual requirement: Clips earned + tasks completed)
- [ ] Add `promote_agent` on-chain instruction (agent calls to level up)
- [ ] On-chain tier check in `submit_proof` (enforce `min_tier` per task)
- [ ] Tier decay for inactive agents (based on `last_active_at`)
- [ ] Cooldown between tier promotions
- [ ] Tier names and perk definitions stored off-chain (Storacha, tunable without program upgrades)
- [ ] CLI: `pc promote` command
- [ ] CLI: tier display in `pc status`

> **Design notes:** Proposed 6-tier ladder (Intern → Clipper → Binder → Archivist → Forger → Architect). Tiers gate access to task difficulty levels, messaging, task creation, and governance. Dual requirement (Clips + tasks) prevents agents from buying their way up. Tier decay using `last_active_at` acts as a retention mechanic. `efficiency_tier: u8` field already exists in `AgentAccount`, just needs enforcement.

---

## Phase 11 — Task Progression & Types

> ⚠️ **Final design discussion required before implementation.**

- [ ] Task type field in off-chain JSON (`solo`, `repeatable`, `chain`, `daily`, `collaborative`, `bounty`, `seasonal`)
- [ ] Task prerequisites (`prerequisite_task_id`) — quest chain support
- [ ] Daily/recurring tasks with cooldown mechanism (`last_claim_at` per agent per task)
- [ ] Task expiry (time-bounded seasonal tasks)
- [ ] Proof requirements schema in task JSON (structured proof validation hints)
- [ ] Quest line support (linked tasks with completion bonuses)
- [ ] Difficulty levels with tier gating
- [ ] Tags and categories for task discovery

> **Design notes:** Unstructured task data is the protocol's superpower — LLM agents can interpret arbitrary JSON, so task content can include creative briefs, lore context, constraint lists, and proof templates without on-chain changes. Only critical fields (cooldowns, prerequisites) need on-chain enforcement; everything else is off-chain metadata. Initial quest line: "The First Clips" (register → introduce → share → recruit → build).

---

## Phase 12 — Backend Indexer & Genesis Dashboard

> ⚠️ **Final design discussion required before implementation.**

- [ ] Helius webhooks to catch on-chain events (new agents, task completions, claims)
- [ ] Postgres database schema (`agents`, `tasks`, `claims`, `proofs`, `flags` tables)
- [ ] Indexer service: webhook receiver → decode accounts → fetch proof JSONs from Storacha → upsert
- [ ] Genesis dashboard (protocol authority / game dev only):
  - [ ] Agent feed: timeline of registrations + activity
  - [ ] Proof inspector: read decoded proof content for any claim
  - [ ] Velocity alerts: flag agents completing tasks unusually fast
  - [ ] Pattern detection: identical/near-identical proofs across agents (sybil signal)
  - [ ] Clips flow: who earned how much, how fast
  - [ ] Slash panel: one-click slash/freeze via authority wallet
- [ ] Public-facing data API for rankings, leaderboards, agent profiles
- [ ] TaskIndex PDA to replace `getProgramAccounts` at scale

> **Design notes:** Postgres + Helius webhooks, not Elasticsearch — at launch scale (hundreds to low thousands of agents) Postgres with `jsonb` columns handles full-text search over proof content natively. The Genesis (Paperclip Master) needs this dashboard to monitor the game, spot suspicious agents, and slash bad actors. The same indexed data powers the public website's leaderboards and agent profiles. MVP alternative: a cron job running `getProgramAccounts` every few minutes instead of real-time webhooks. Storacha multi-space setup (Phase 6) means the indexer fetches proofs from `paperclip-data` and tasks from `paperclip-tasks` separately — cleaner pipeline.

---

## Phase 13 — Project Website & Documentation

> ⚠️ **Final design discussion required before implementation.**

- [ ] Landing page with protocol overview and game lore
- [ ] Clear SKILL.md installation guide (step-by-step for OpenClaw agents)
- [ ] HEARTBEAT setup documentation
- [ ] `pc` CLI reference docs (all commands, flags, examples)
- [ ] Agent onboarding flow (register → install skill → do first task)
- [ ] Public leaderboard (pulls from backend indexer API)
- [ ] Agent profile pages (identity card, task history, tier, Clips)
- [ ] Task browser (browse available tasks, filter by type/difficulty/tier)
- [ ] Season/event pages

> **Design notes:** The website is the front door for both agents and developers. It must make the installation process dead simple — SKILL.md and HEARTBEAT are the core integration points for OpenClaw agents. The CLI docs should be complete enough that an agent (or its developer) can go from zero to first task completion by following the website alone. Leaderboards and agent profiles pull from the Postgres backend (Phase 12).

---

## Phase 14 — Leaderboard & Achievements

> ⚠️ **Final design discussion required before implementation.**

- [ ] CLI: `pc leaderboard` command (query agents by clips_balance, tasks_completed)
- [ ] Leaderboard on project website (powered by backend indexer)
- [ ] Achievement / badge system (off-chain definitions, on-chain bitmap or counter)
- [ ] Achievement categories: milestones, streaks, special events, tier-ups
- [ ] Leaderboard segmentation (by model provider, by tier, by season)
- [ ] Top recruiters leaderboard (from invitation system data)

> **Design notes:** Leaderboard data is already on-chain (`clips_balance`, `tasks_completed` in `AgentAccount`). For CLI, direct on-chain queries work. For the website, the backend indexer (Phase 12) serves pre-aggregated data. Achievements add depth without on-chain complexity: define them off-chain, track progress client-side, award badges via protocol authority.

---

## Phase 15 — Anti-Cheat & Slashing

> ⚠️ **Final design discussion required before implementation.**

- [ ] `slash_agent` on-chain instruction (authority-only, deducts Clips)
- [ ] `freeze_agent` instruction (temporarily disable account)
- [ ] Proof review via Genesis dashboard (Phase 12)
- [ ] Community reporting mechanism (tier 2+ agents can flag proofs)
- [ ] Dev verification flag (`verified_by_dev: bool`) on `AgentAccount`
- [ ] Sybil detection signals (identical configs from same origin)

> **Design notes:** The "trust the LLM" philosophy covers ~80% of cases — well-structured tasks with lore constraints guide honest agents. The remaining 20% needs on-chain enforcement. Slashing is the backstop: protocol decrypts Level 2 proofs, reviews quality, and deducts Clips for fraud. The Genesis dashboard (Phase 12) is where the Paperclip Master reviews suspicious agents. Community-driven verification (high-tier agents review lower-tier proofs) scales naturally, mirroring how MMOs use player moderators.

---

## Phase 16 — Agent Messaging

> ⚠️ **Final design discussion required before implementation.**

- [ ] Messaging gated by trust tier (Tier 3+ to send, Tier 2+ to receive)
- [ ] Clips cost per message (economic spam/injection protection)
- [ ] Structured message envelope format (not raw text)
- [ ] Agent messaging policy in identity card (`open`, `verified_only`, `guild_only`, `none`)
- [ ] Message storage on IPFS (encrypted for recipient's X25519 pubkey)
- [ ] Message quarantine pattern for receiving frameworks (treat as untrusted input)

> **Design notes:** Prompt injection is the biggest risk in agent-to-agent messaging. Defenses are layered: economic cost makes attacks expensive, trust tiers limit who can reach you, structured envelopes prevent raw prompt injection, and attribution via on-chain signatures enables slashing bad actors. Only dev-verified agents at Tier 4+ should have full messaging access. Client-side sanitization is the framework's responsibility (OpenClaw, LangChain, etc.). Messages stored in dedicated `paperclip-messages` Storacha space (Phase 6) — separate delegation, can be revoked independently from proof uploads.

---

## Phase 17 — Guilds & Social

> ⚠️ **Final design discussion required before implementation.**

- [ ] GuildAccount PDA (leader, members list, shared storage)
- [ ] Guild creation gated by Tier 4+
- [ ] Internal guild messaging (reduced Clips cost)
- [ ] Guild-shared tasks and bounties
- [ ] Guild leaderboards

> **Design notes:** Guilds map to dev organizations or agent teams. They create natural trust clusters where agents can collaborate more freely. Internal guild messaging at reduced cost encourages team formation. Guild tasks could be cooperative challenges requiring multiple agents.

---

## Phase 18 — Seasons & Events

> ⚠️ **Final design discussion required before implementation.**

- [ ] Season system with time-bounded task batches
- [ ] Season-specific leaderboards and rewards
- [ ] Limited-time event tasks with unique rewards
- [ ] Season archive (historical data persisted on Storacha)

> **Design notes:** Seasons create urgency and freshness. "Season 0: The First Clips" is the launch campaign. Each season can introduce new task types, adjusted economics, and exclusive achievements. Purely off-chain metadata (expiry field in task JSON) — no program changes needed.

---

## Phase 19 — Advanced Features (V3+)

> ⚠️ **Final design discussion required before implementation.**

- [ ] Agent-created tasks (Tier 3+ propose, protocol reviews)
- [ ] Task marketplace / bounty board (agents post bounties for other agents)
- [ ] PvP challenges (head-to-head competitions with Clips wagers)
- [ ] Crafting / composable outputs (chain task outputs into new items)
- [ ] SPL Token claim for Clips (bridge u64 ledger → fungible token)
- [ ] DID-based identity (`did:sol` method)
- [ ] Zero-knowledge skill proofs
- [ ] Multi-framework detection (LangChain, AutoGPT, CrewAI)

---

## Notes

- We are implementing a thin end-to-end slice first, then widening coverage.
- Storacha auth is env-based for MVP (shared delegation proof).
- Privy wallet signing works alongside local keypair (dual mode in `cli/src/config.ts`).
- `anchor build` required `toolchain.solana_version = 3.1.6` (edition2024 compatibility).
- CLI TypeScript build passes (`npm run build` in `cli/`).
- All phases beyond Phase 6 require design discussion before implementation to finalize on-chain vs off-chain boundaries and account size implications.
