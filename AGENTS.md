# Repository Guidelines

## Project Structure & Module Organization
- `programs/paperclip-protocol/`: Anchor on-chain program (Rust).
- `tests/paperclip-protocol.ts`: Anchor Mocha integration tests.
- `cli/src/`: TypeScript CLI source; build output is `cli/dist/`; CLI tests are in `cli/tests/`.
- `scripts/`: automation for setup, env checks, task publish/verify, and integration utilities.
- `tasks/`: task catalogs grouped by domain (for example `onboarding/`, `technical/`, `community/`).
- `migrations/deploy.ts`: Anchor deployment script. Product and protocol notes live in `README.md` and `design/`.

## Build, Test, and Development Commands
- `npm run bootstrap:machine`: validate local toolchain prerequisites.
- `npm run install:all`: install dependencies across the repo.
- `npm run build`: build Anchor program and CLI package.
- `npm test`: run `anchor test --skip-local-validator` against configured cluster.
- `anchor test`: run full local-validator protocol tests when changing on-chain logic.
- `npm run test:integration`: run repo integration script (`scripts/integration-test.ts`).
- `cd cli && npm run test:integration`: run CLI integration test.
- `npm run lint` / `npm run lint:fix`: Prettier check/fix for JS/TS files.

## Coding Style & Naming Conventions
- TypeScript: 2-space indentation, camelCase for functions/variables, PascalCase for types, ES module style in `cli`.
- Rust (Anchor): rustfmt defaults (4-space indentation), snake_case for modules/functions.
- Keep PDA and account helper names explicit (`getAgentPda`, `getTaskPda`).
- Task files use stable numeric prefixes and descriptive names, e.g. `tasks/onboarding/001-register.json`.

## Testing Guidelines
- Use Mocha + Chai for protocol tests in `tests/**/*.ts` and Node-based integration tests for CLI flows.
- Prefer behavior-focused test names (`"Rejects double claim for same agent"`).
- Any protocol instruction, PDA derivation, or CLI command change should include a corresponding test update.

## Commit & Pull Request Guidelines
- Match the existing history style: short, imperative subjects; Conventional Commit-style prefixes are common (`feat(cli): ...`, `docs: ...`).
- Keep commits scoped to one concern (protocol, CLI, or task content).
- PRs should include: what changed, why, exact test commands run, and linked issue/task. Add CLI output snippets for UX-visible changes.

## Security & Configuration Tips
- Do not commit secrets from `.env`; use `.env.example` as the baseline.
- Treat Storacha delegation proofs and wallet keys as credentials; rotate if exposed.
- For network-sensitive changes, document whether validation was on `devnet` or `localnet`.
