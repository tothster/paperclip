# Paperclip Protocol Upgrade Policy

Last updated: 2026-02-12

## Goals
- Keep frequent program upgrades safe.
- Avoid forced wipes/migrations for small feature changes.
- Make upgrades predictable for on-chain code, CLI, and ops.

## Non-Negotiable Rules
1. Do not reorder or remove fields in existing account structs.
2. Add new fields only by consuming reserved tail bytes first.
3. Keep PDA seeds stable once released.
4. Treat instruction argument schemas as versioned APIs.
5. Upgrade IDL and CLI in lockstep with on-chain upgrades.

## Account Layout Strategy
All core accounts include:
- `layout_version: u8`
- `reserved: [u8; N]` tail bytes

Current reserved budgets:
- `ProtocolState`: 64 bytes
- `AgentAccount`: 128 bytes
- `TaskRecord`: 128 bytes
- `ClaimRecord`: 64 bytes

Rule for future edits:
1. Prefer replacing part of `reserved` with typed fields.
2. Keep total account size unchanged when possible.
3. When reserved budget is exhausted, use a new extension PDA (preferred) or migration with realloc.

## Feature Design Rules
1. Core immutable data stays in core PDAs.
2. Evolving logic/config goes into extension PDAs.
3. Optional features should be additive, not mutating existing meaning.
4. New instruction variants are preferred over breaking existing instruction signatures.

## Upgrade Release Checklist
1. Build and regenerate IDL.
2. Run tests including at least one upgrade simulation from previous release.
3. Validate old data deserializes under new binary.
4. Verify CLI commands against updated IDL.
5. Deploy to devnet.
6. Run smoke flow: initialize/register/create/submit.
7. Tag release with commit + IDL hash + program slot.

## Devnet Wipe and Redeploy Runbook
Use this only for test networks.

1. Close existing upgradeable program (authority required):
```bash
solana program close <OLD_PROGRAM_ID> -u devnet --bypass-warning
```

Note: closed program IDs are permanently unusable and cannot be redeployed.

2. Rebuild program and verify declared id:
```bash
anchor build
solana address -k target/deploy/paperclip_protocol-keypair.json
```

3. Deploy:
```bash
solana program deploy target/deploy/paperclip_protocol.so \
  --program-id target/deploy/paperclip_protocol-keypair.json \
  -u devnet
```

4. Refresh IDL in repo:
```bash
cp target/idl/paperclip_protocol.json cli/idl/paperclip_protocol.json
```

5. Re-seed protocol state/tasks and run CLI smoke tests.

## When Realloc Is Allowed
Realloc is last resort for live/core accounts.

Allowed only if:
1. Reserved bytes cannot cover required changes.
2. A dedicated migration instruction exists.
3. Rent top-up and batched execution are planned.
4. Partial-migration behavior is defined and tested.

If these are not met, use extension PDAs instead.
