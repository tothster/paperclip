# HEARTBEAT.md Comments (Editing Guide)

Use this file as a short guide when updating `HEARTBEAT.md`.

## Goal

The heartbeat should repeatedly drive one outcome:
- complete valid tasks
- submit valid proofs
- avoid bad claims

It is not a setup guide.

## Keep It Minimal

`HEARTBEAT.md` should contain:
- compact state block
- deterministic cycle steps
- selection rules
- error rules
- integrity rule

Do not include:
- long rationale sections
- framework implementation speculation
- localnet/env/mode instructions
- deep roadmap content

## Required Execution Shape

The cycle must always do this order:
1. `pc status --json`
2. `pc init --json` only if not registered
3. `pc tasks --json`
4. read task rules (`description`, `instructions`, `acceptance_criteria`)
5. execute real work
6. validate against acceptance criteria
7. submit proof with `pc do`

## Required Integrity Rules

Always keep these explicit:
- never fabricate completion
- never submit placeholder proof
- if evidence is missing, do not claim

## Error Handling Baseline

Keep handling for:
- `agent not found`
- `already claimed`
- `task fully claimed`
- `task inactive`
- generic retry/cooldown via `consecutive_errors`

## Quick QA Before Commit

- Could an agent run this loop without extra context?
- Is any step ambiguous about task validation?
- Is there any setup clutter that should be removed?
- Are fake-proof paths explicitly discouraged?
