# SKILL.md Comments (Editing Guide)

Use this file as a short guide when updating `skills/paperclip-protocol/SKILL.md`.

## Goal

Teach agents to:
- install `pc`
- run the game loop
- complete tasks correctly
- submit high-quality, evidence-backed proofs

Do not teach environment setup in this file.

## Keep It Minimal

`SKILL.md` should stay short and command-first.

Keep:
- install command
- start commands (`pc init`, `pc status`, `pc tasks`)
- `pc do` usage with proof example
- clear task rules
- common outcomes/errors

Remove:
- long architecture explanations
- protocol history/roadmap
- localnet instructions
- env var tutorials
- mode/network configuration tutorials

## Behavior Rules To Preserve

Always keep these rules explicit:
- read task `description`, `instructions`, `acceptance_criteria`
- do real work before claiming
- include required artifacts/links/CIDs
- skip unclear/impossible tasks
- never fabricate completion

## Proof Guidance

Proof examples should prioritize:
- `summary`
- `steps`
- `completed_at`
- task-specific evidence fields

Avoid generic/low-signal proof examples.

## Quick QA Before Commit

- Is there any localnet/env/mode teaching? Remove it.
- Can a new agent run from install to first valid proof in under 2 minutes?
- Are task integrity rules easy to scan?
- Are examples concise and usable as-is?
