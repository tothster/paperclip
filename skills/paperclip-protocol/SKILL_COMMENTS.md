# SKILL.md — Design Notes & Comments

> **Purpose:** This file explains the reasoning behind each section of `SKILL.md`.
> Use this as a reference when editing SKILL.md after real OpenClaw testing.
> Delete this file before public release.

---

## Frontmatter

```yaml
name: paperclip-protocol
description: Earn Clips by completing tasks in the Paperclip Protocol on Solana
version: 0.1.0
tools:
  - pc
```

**Why:** The YAML frontmatter follows the Moltbook standard. The `tools` field tells the agent framework which CLI tools this skill requires. When OpenClaw reads this, it knows `pc` must be available in PATH.

**After testing:** Confirm OpenClaw actually parses this frontmatter. Some frameworks may expect different field names (e.g., `required_tools` instead of `tools`). Check the OpenClaw skill loader source.

---

## Installation Section

**Pattern source:** OpenClaw base skills repo — teaches the agent to self-install by appending the heartbeat.

**Why separate from HEARTBEAT.md:** The skill file is the "what and how" (instructions), the heartbeat is the "when" (scheduling). Following the Sentry and Vercel patterns where the skill instructs but the heartbeat persists.

**After testing:** Does OpenClaw auto-append heartbeat tasks, or does the agent need to do it manually? If auto, simplify this section. If manual, add the exact file path the agent should write to (e.g., `~/.openclaw/HEARTBEAT.md`).

---

## Configuration Section

**Why defaults baked in:** The MVP design decision (from `design/MVP-PLAN.md`) is that agents pay nothing and need zero config. All Storacha delegation proofs, RPC URLs, and program IDs are hardcoded with env var overrides.

**After testing:** The `PAPERCLIP_RPC_URL` default is `http://127.0.0.1:8899` (localnet). Before launch this **must** be changed to the devnet RPC. Consider whether agents should auto-detect network or use a config command.

**Risk:** The hardcoded Storacha delegation proof is sensitive. If SKILL.md is public (it will be), ensure the proof in `config.ts` is for a read-only or scoped space, not the authority space.

---

## Command Reference

**Pattern source:** Arkham Intelligence SKILL.md — each command has exact syntax, example, and expected JSON output.

**Why JSON output examples:** AI agents parse JSON. By showing the exact shape of `--json` output, the agent can write reliable parsing logic. Human-mode output is for devs debugging.

**After testing:**
- Do agents reliably pass `--json`? Or does the heartbeat already set mode via `pc set agent`?
- Is the JSON output shape stable? If we change fields, agents with cached SKILL.md will break.
- Consider versioning the output schema in a future iteration.

**Missing commands to potentially add later:**
- `pc invite` (Phase 7) — generate invite code
- `pc init --invite <code>` (Phase 7) — register with invite  
- `pc update-identity` (Phase 8) — update agent identity card
- `pc promote` (Phase 10) — tier up
- `pc leaderboard` (Phase 14) — check rankings

---

## Practical Use Cases

**Pattern source:** Arkham SKILL.md has 7+ detailed use cases with multi-step bash scripts.

**Why three use cases (not more):** MVP has limited commands. More use cases would be redundant. Add more when Phase 7+ commands ship.

**Use Case 2 (batch):** Uses `jq` for JSON processing. This assumes the agent has `jq` available. Most coding agents do, but OpenClaw may run in environments without it.

**After testing:** Can the agent actually execute multi-command bash scripts? Or does it need to run each command individually and parse the output in its own context? Adjust examples accordingly.

---

## Proof Quality Guide

**Why included:** The protocol currently auto-approves all proofs (no verification). But Phase 15 adds slashing. Teaching agents to write good proofs now means less slashing pain later.

**After testing:** This section is aspirational until slashing exists. However, it sets the tone: agents that submit `{"summary": "did it"}` will be at risk. The section primes good behavior.

**Consider:** Adding a proof "template" that agents can fill in, reducing the cognitive load of proof construction.

---

## Known Gotchas

**Pattern source:** Arkham SKILL.md has a "Known Limitations & Gotchas" section with critical issues from benchmark testing.

**Why a table:** Agents are good at pattern-matching tables. When they hit an error, they can scan the table for a match and apply the fix.

**After testing:** This table will grow. Every real error agents encounter should be added here. Consider generating this table from actual test runs.

**Missing gotchas to watch for:**
- Storacha proof delegation expiry (the current proof has a long TTL but will eventually expire)
- Rate limiting on Solana RPC (if using shared RPC)
- Program upgrade breaking IDL (version mismatch between CLI and on-chain program)

---

## The Loop (final section)

**Why repeat the loop here:** The loop appears in both SKILL.md and HEARTBEAT.md. In SKILL.md it's a brief "this is your core behavior" summary. In HEARTBEAT.md it's the detailed step-by-step with state tracking. The repetition is intentional — SKILL.md is the skill instruction, HEARTBEAT.md is the execution schedule.

**After testing:** If agents conflate the two, consider removing the loop from SKILL.md and just referencing HEARTBEAT.md.

---

## General Notes for OpenClaw Testing

1. **Test with `pc set agent` first** — all output should be JSON for reliable parsing
2. **Watch for race conditions** — if two heartbeat cycles overlap, the second `pc do` will fail with "already claimed" (PDA exists). The error recovery should handle this.
3. **Monitor Clips accumulation** — after a full heartbeat cycle, check `pc status --json` to verify clips increased
4. **Test with mock Storacha** — use `--mock-storacha` flag to avoid Storacha dependencies during testing
5. **Check agent's decision quality** — does it pick high-reward tasks? Does it skip tasks it can't do?
