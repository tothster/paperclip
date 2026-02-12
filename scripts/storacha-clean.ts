#!/usr/bin/env npx tsx

/**
 * Storacha Space Cleanup Script
 *
 * Lists and removes uploads from a selected Paperclip Storacha space.
 * Useful during development to clear out test data.
 *
 * NOTE: Per Storacha docs, removing uploads only un-lists them
 * from the space — data may persist on the IPFS network.
 */

import { create } from "@storacha/client";
import { StoreMemory } from "@storacha/client/stores/memory";
import * as Proof from "@storacha/client/proof";
import { Signer } from "@storacha/client/principal/ed25519";
import readline from "readline";

// Import config from CLI source (avoid stale dist assumptions)
import {
  STORACHA_AGENT_KEY,
  W3UP_DATA_SPACE_DID,
  W3UP_DATA_SPACE_PROOF,
  W3UP_MESSAGES_SPACE_DID,
  W3UP_MESSAGES_SPACE_PROOF,
  W3UP_TASKS_SPACE_DID,
  W3UP_TASKS_SPACE_PROOF,
  W3UP_SPACE_DID,
  W3UP_SPACE_PROOF,
} from "../cli/src/config.ts";

const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

const log = {
  info: (msg: string) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg: string) =>
    console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg: string) =>
    console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  header: (msg: string) =>
    console.log(`\n${colors.bold}${colors.cyan}${msg}${colors.reset}\n`),
};

type StorachaScope = "data" | "tasks" | "messages";

function parseScope(argv: string[]): StorachaScope {
  const idx = argv.indexOf("--scope");
  if (idx === -1) {
    return "data";
  }

  const value = argv[idx + 1]?.toLowerCase().trim();
  if (value === "data" || value === "tasks" || value === "messages") {
    return value;
  }

  throw new Error('Invalid --scope value. Use "data", "tasks", or "messages".');
}

function getScopeConfig(scope: StorachaScope): { did: string; proof: string } {
  if (scope === "tasks") {
    return {
      did: W3UP_TASKS_SPACE_DID || W3UP_SPACE_DID,
      proof: W3UP_TASKS_SPACE_PROOF || W3UP_SPACE_PROOF,
    };
  }

  if (scope === "messages") {
    return {
      did: W3UP_MESSAGES_SPACE_DID || W3UP_SPACE_DID,
      proof: W3UP_MESSAGES_SPACE_PROOF || W3UP_SPACE_PROOF,
    };
  }

  return {
    did: W3UP_DATA_SPACE_DID || W3UP_SPACE_DID,
    proof: W3UP_DATA_SPACE_PROOF || W3UP_SPACE_PROOF,
  };
}

function promptUser(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().trim());
    });
  });
}

async function main() {
  const scope = parseScope(process.argv.slice(2));
  const { did: configuredDid, proof: configuredProof } = getScopeConfig(scope);

  log.header("🧹 Paperclip — Storacha Space Cleanup");
  log.info(`Scope: ${scope}`);

  if (!STORACHA_AGENT_KEY || !configuredProof) {
    log.error(
      `Missing STORACHA_AGENT_KEY or scoped proof for "${scope}" in CLI config.`
    );
    log.info("Run: storacha key create && storacha delegation create <did> --base64");
    process.exit(1);
  }

  // Create client with agent identity
  log.info("Connecting to Storacha...");
  const principal = Signer.parse(STORACHA_AGENT_KEY);
  const store = new StoreMemory();
  const client = await create({ principal, store });

  // Add space proof
  const delegation = await Proof.parse(configuredProof);
  const space = await client.addSpace(delegation);
  const spaceDid = (configuredDid || space.did()) as `did:${string}:${string}`;
  await client.setCurrentSpace(spaceDid);

  log.success(`Connected to ${scope} space: ${spaceDid}`);

  // List uploads
  log.info("Listing uploads...");

  const uploads: Array<{ root: unknown }> = [];
  let cursor: string | undefined;

  while (true) {
    const page = await client.capability.upload.list({
      cursor,
      size: 100,
    });

    uploads.push(...page.results);

    if (!page.cursor || page.results.length === 0) {
      break;
    }
    cursor = page.cursor;
  }

  if (uploads.length === 0) {
    log.success("Space is already empty — nothing to clean up.");
    return;
  }

  console.log(`\n  Found ${colors.bold}${uploads.length}${colors.reset} upload(s):\n`);

  for (const upload of uploads) {
    console.log(`    📦 ${String((upload as any).root)}`);
  }

  console.log("");

  const answer = await promptUser(
    `${colors.yellow}Remove all ${uploads.length} upload(s) from ${scope}?${colors.reset} (y/N): `
  );

  if (answer !== "y" && answer !== "yes") {
    log.info("Aborted.");
    return;
  }

  let removed = 0;
  let failed = 0;

  for (const upload of uploads) {
    const root = (upload as any).root;
    try {
      await client.remove(root, { shards: true } as any);
      log.success(`Removed: ${root.toString()}`);
      removed++;
    } catch (error: any) {
      log.error(`Failed to remove ${root.toString()}: ${error.message}`);
      failed++;
    }
  }

  console.log("");
  log.header("📊 Cleanup Results");
  console.log(`  ✅ Removed: ${removed}`);
  if (failed > 0) {
    console.log(`  ❌ Failed:  ${failed}`);
  }
  console.log("");

  const verify = await client.capability.upload.list({ size: 1 });
  if (verify.results.length === 0) {
    log.success("Space is now empty! ✨\n");
  } else {
    log.warn("Some uploads may still remain.\n");
  }
}

main().catch((err) => {
  log.error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
