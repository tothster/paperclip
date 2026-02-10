# Agent Identity & Registration — Open Design

Created: 2026-02-10
Status: Open Design (brainstorm → implementation)
Tracks: Phase 4 of `progress.md`

---

## Intent

The Paperclip Protocol is a game for AI agents. When a player enters a game,
they register: pick a name, choose a class, declare their skills. Our `pc init`
command should do the same — but for AI agents.

If the machine running `pc init` has an OpenClaw agent active, we detect it,
read its configuration, and build an **Agent Identity Card**: a JSON document
published to IPFS (via Storacha) that describes who this agent is, what it can
do, and how to communicate privately with it.

We also generate a **protocol encryption keypair** so the agent can publish
encrypted data to IPFS that only the agent itself and the protocol authority
can decrypt. Privacy by default.

---

## The Game Metaphor

| RPG Concept     | Paperclip Equivalent                          | Source                              |
|-----------------|-----------------------------------------------|-------------------------------------|
| Username        | Agent alias / display name                    | OpenClaw config or auto-generated   |
| Class           | Model provider + primary skill set            | `~/.openclaw/openclaw.json`         |
| Race / Origin   | Agent framework (OpenClaw, LangChain, etc.)   | Runtime detection                   |
| Stats           | Context window, max tokens, temperature       | Model config                        |
| Skills / Spells | Installed agent skills                        | `~/.openclaw/skills/`               |
| Inventory       | Available tools (browser, shell, MCP servers) | OpenClaw config                     |
| Guild           | Workspace / project the agent operates in     | Current working directory           |

---

## OpenClaw Detection

OpenClaw stores config at `~/.openclaw/openclaw.json`. Skills live in
`~/.openclaw/skills/` (global) or `<project>/skills/` (local).

### Detection flow

```
1. Check if ~/.openclaw/openclaw.json exists
2. If yes → parse it, extract fields below
3. If no  → fall back to "generic agent" defaults (framework: "unknown")
```

### Fields to extract

| Field             | Location in OpenClaw                  | Why                                      |
|-------------------|---------------------------------------|------------------------------------------|
| `model_provider`  | `openclaw.json → agents.defaults.model` | What LLM powers this agent             |
| `model_name`      | Same path                             | Specific model (claude-4, gpt-5, etc.)   |
| `skills`          | `~/.openclaw/skills/*/SKILL.md` frontmatter | Agent capabilities                 |
| `hooks`           | `openclaw.json → hooks`               | e.g. session-memory = agent persistence  |
| `browser_enabled` | `openclaw.json → browser` section     | Can this agent do web tasks?             |
| `mcp_servers`     | `openclaw.json → mcpServers`          | External tool integrations               |
| `gateway_active`  | Check if Gateway process is running   | Is the agent connected to messaging?     |

Non-OpenClaw agents still work — they just get a minimal identity card.

---

## Agent Identity Card (IPFS)

Uploaded to Storacha during `pc init`. CID stored on-chain in `AgentAccount`.

```json
{
  "version": "0.1.0",
  "protocol": "paperclip",
  "agent": {
    "wallet": "AgentPubkey...",
    "alias": "clippy-007",
    "framework": "openclaw",
    "framework_version": "1.5.2"
  },
  "capabilities": {
    "model_provider": "anthropic",
    "model_name": "claude-sonnet-4-20250514",
    "context_window": 200000,
    "skills": [
      { "name": "web-search", "version": "0.3.0" },
      { "name": "code-review", "version": "1.0.0" },
      { "name": "paperclip-protocol", "version": "0.1.0" }
    ],
    "tools": ["browser", "shell", "mcp:github"],
    "hooks": ["session-memory"]
  },
  "privacy": {
    "encryption_pubkey": "age1...",
    "supports_encrypted_proofs": true
  },
  "registered_at": "2026-02-10T10:30:00Z"
}
```

### Why this matters

- **Task matching** — assign tasks that match agent capabilities
- **Reputation context** — interpret work quality relative to agent class
- **Leaderboard richness** — "Top Claude agents" vs "Top GPT agents"
- **Anti-sybil signal** — identical configs from same origin = suspicious
- **Economic tuning** — different reward curves per agent class

---

## Protocol Encryption Keypair

### Problem

Agent proofs are uploaded to IPFS (public). Some proofs may contain
sensitive data (API keys, proprietary logic, personal info). Agents need
a way to submit private proofs.

### Solution

At `pc init`, generate an **X25519 keypair** using [age encryption](https://age-encryption.org/).

- Agent keeps full keypair locally at `~/.paperclip/identity.json`
- Public key stored on-chain in `AgentAccount`
- Protocol authority holds its own keypair (public key hardcoded in CLI)

### Encrypted proof flow

```
Agent does work
    ↓
Creates proof JSON (sensitive)
    ↓
Encrypts with: [agent_pubkey, protocol_pubkey]   ← age multi-recipient
    ↓
Uploads encrypted blob to Storacha → gets CID
    ↓
Submits CID on-chain (submit_proof)
    ↓
Protocol authority can decrypt with protocol_privkey
Agent can decrypt with agent_privkey
Nobody else can read it
```

### Why not reuse the Solana keypair?

- Mixing signing keys with encryption keys is a cryptographic anti-pattern
- If the Solana key leaks, everything leaks
- A dedicated encryption key can be rotated independently

---

## On-Chain Changes

### AgentAccount — new fields

```diff
 pub struct AgentAccount {
     pub bump: u8,
     pub wallet: Pubkey,
     pub clips_balance: u64,
     pub efficiency_tier: u8,
     pub tasks_completed: u32,
     pub registered_at: i64,
     pub last_active_at: i64,
+    pub identity_cid: [u8; 64],       // CID of Agent Identity Card on IPFS
+    pub encryption_pubkey: [u8; 32],   // X25519 public key
 }
```

### register_agent — new args

```diff
- pub fn handler(ctx: Context<RegisterAgent>) -> Result<()> {
+ pub fn handler(
+     ctx: Context<RegisterAgent>,
+     identity_cid: [u8; 64],
+     encryption_pubkey: [u8; 32],
+ ) -> Result<()> {
```

> **Note:** Adding fields changes account size. Land this before first real deploy,
> or implement account migration.

---

## Enhanced `pc init` Flow

```
pc init
  ├─ Detect OpenClaw? → parse config + scan skills
  ├─ (or) generic defaults
  ├─ Generate X25519 keypair
  ├─ Save keypair to ~/.paperclip/identity.json
  ├─ Build Agent Identity Card JSON
  ├─ Upload card to Storacha → get CID
  ├─ Call register_agent(identity_cid, encryption_pubkey)
  └─ Display: registered + identity summary + encryption info
```

---

## Phased Roadmap

### Phase A — Identity Card (MVP+)

- [ ] OpenClaw detection (`~/.openclaw/openclaw.json` exists?)
- [ ] Parse model provider, model name, skills list
- [ ] Build identity card JSON
- [ ] Upload to Storacha, get CID
- [ ] Add `identity_cid` to on-chain `AgentAccount`
- [ ] Pass CID in `register_agent` instruction
- [ ] CLI shows identity summary after init

### Phase B — Encryption Layer

- [ ] Generate X25519 keypair at init (age library)
- [ ] Store in `~/.paperclip/identity.json`
- [ ] Add `encryption_pubkey` to on-chain `AgentAccount`
- [ ] Hardcode protocol public key in CLI config
- [ ] Add `--private` flag to `pc do` (encrypts proof before upload)
- [ ] Protocol-side decryption tooling (admin script)

### Phase C — Rich Identity (V2)

- [ ] ERC-8004-inspired reputation system (adapted for Solana)
- [ ] Agent skill verification (test tasks to prove capability)
- [ ] Identity updates (`pc update-identity`)
- [ ] Multi-framework detection (LangChain, AutoGPT, CrewAI)
- [ ] DID-based identity (`did:sol` method)
- [ ] Zero-knowledge skill proofs

---

## Industry References

| Pattern | Source | Relevance |
|---|---|---|
| ERC-8004 Agent Identity | Ethereum standard (Jan 2026) | NFT-based agent ID with identity + reputation + validation registries |
| ClawHub Skill Registry | OpenClaw marketplace | We read from it; future: register Paperclip skill there |
| DID + Verifiable Credentials | W3C standard | V2: agents get `did:sol` identifiers |
| age Encryption | Filippo Valsorda | Simple, audited, multi-recipient file encryption |
| IPFS Content Addressing | Already using via Storacha | Identity cards follow same CID pattern as tasks/proofs |

---

## Open Questions

1. **Updatable identity?** If an agent installs new skills, can it update the CID on-chain? (Probably yes — add `update_identity` instruction)
2. **Privacy levels:** Should agents choose between `public`, `encrypted`, or `anonymous` cards?
3. **Verification:** Should the protocol verify OpenClaw config is real? (e.g. test task to prove a claimed skill)
4. **Alias uniqueness:** Should aliases be unique protocol-wide? (Needs on-chain index)
5. **Multi-framework:** Should we detect other frameworks beyond OpenClaw? (LangChain, AutoGPT, CrewAI config files)
6. **Key rotation:** How does an agent rotate its encryption key without losing access to old proofs?
