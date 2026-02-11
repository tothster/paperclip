/**
 * verify-tasks.ts — Verify tasks are properly stored on-chain and fetchable from Storacha
 *
 * Reads all tasks from the program, resolves their content CIDs via the
 * Storacha IPFS gateway, and reports the results.
 *
 * Usage:
 *   npx tsx verify-tasks.ts
 *
 * Environment:
 *   PAPERCLIP_PROGRAM_ID — Program ID (default: BjNH...Sy83 on devnet)
 *   PAPERCLIP_RPC_URL    — RPC URL (default: https://api.devnet.solana.com)
 *   PAPERCLIP_WALLET     — Wallet path (default: ~/.config/solana/id.json)
 */

import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import chalk from "chalk";
import ora from "ora";

// =============================================================================
// CONFIG
// =============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_RPC_URL = "https://api.devnet.solana.com";
const DEFAULT_PROGRAM_ID = "BjNHQo9MFTwgpqHRHkcqYmRfkikMfzKZJdsUkNq9Sy83";

const RPC_URL = process.env.PAPERCLIP_RPC_URL || DEFAULT_RPC_URL;
const WALLET_PATH =
  process.env.PAPERCLIP_WALLET ||
  path.join(os.homedir(), ".config", "solana", "id.json");

const IDL_PATH = path.resolve(__dirname, "..", "target", "idl", "paperclip_protocol.json");
const STORACHA_GATEWAY_URL =
  process.env.STORACHA_GATEWAY_URL || "https://w3s.link/ipfs/";

const PROTOCOL_SEED = Buffer.from("protocol");

// =============================================================================
// HELPERS
// =============================================================================

function fromFixedBytes(data: number[]): string {
  const buf = Buffer.from(data);
  const end = buf.indexOf(0);
  return buf.slice(0, end === -1 ? buf.length : end).toString("utf8");
}

function loadKeypair(filePath: string): Keypair {
  const raw = fs.readFileSync(filePath, "utf8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

function getProtocolPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([PROTOCOL_SEED], programId)[0];
}

function normalizeGateway(base: string): string {
  return base.endsWith("/") ? base : `${base}/`;
}

async function fetchFromStoracha(cid: string): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  if (process.env.PAPERCLIP_STORACHA_MOCK === "1") {
    return { ok: true, data: { mock: true, cid } };
  }

  const base = normalizeGateway(STORACHA_GATEWAY_URL);
  const url = `${base}${cid}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// =============================================================================
// PROGRAM SETUP
// =============================================================================

function getProgram(): anchor.Program<anchor.Idl> {
  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf8")) as anchor.Idl;
  const programId = process.env.PAPERCLIP_PROGRAM_ID || DEFAULT_PROGRAM_ID;
  if (programId) (idl as any).address = programId;

  const connection = new anchor.web3.Connection(RPC_URL, "confirmed");
  const keypair = loadKeypair(WALLET_PATH);
  const wallet = new anchor.Wallet(keypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  return new anchor.Program(idl, provider);
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log();
  console.log(chalk.dim("━".repeat(60)));
  console.log(`  ${chalk.bold.magenta("📎 Paperclip")} ${chalk.dim("— Verify Tasks")}`);
  console.log(chalk.dim("━".repeat(60)));

  const program = getProgram();
  console.log(`  ${chalk.dim("🔗 RPC:")} ${RPC_URL}`);
  console.log(`  ${chalk.dim("🌐 Gateway:")} ${STORACHA_GATEWAY_URL}`);
  console.log();

  // 1. Fetch protocol state
  const protocolPda = getProtocolPda(program.programId);
  const spinner = ora("Fetching protocol state...").start();

  let protocol: any;
  try {
    protocol = await (program.account as any).protocolState.fetch(protocolPda);
    spinner.succeed(
      `Protocol: ${protocol.totalTasks} tasks, ${protocol.totalAgents} agents, ` +
      `${protocol.totalClipsDistributed.toNumber()} clips distributed`
    );
  } catch {
    spinner.fail("Protocol not initialized");
    process.exit(1);
  }

  // 2. Fetch all task accounts
  const taskSpinner = ora("Fetching all tasks from chain...").start();
  const tasks = await (program.account as any).taskRecord.all();
  taskSpinner.succeed(`Found ${tasks.length} task(s) on-chain`);
  console.log();

  if (tasks.length === 0) {
    console.log(`  ${chalk.yellow("⚠️")}  No tasks found. Run: ${chalk.bold("npx tsx publish-task.ts")}`);
    console.log();
    return;
  }

  // 3. Verify each task
  let passCount = 0;
  let failCount = 0;

  for (const task of tasks) {
    const t = task.account;
    const title = fromFixedBytes(t.title);
    const contentCid = fromFixedBytes(t.contentCid);
    const status = t.isActive ? chalk.green("active") : chalk.dim("inactive");
    const slots = `${t.currentClaims}/${t.maxClaims}`;

    console.log(chalk.dim("  ─".repeat(20)));
    console.log(`  ${chalk.bold(`Task #${t.taskId}`)} — ${title}`);
    console.log(`  ${chalk.dim("Status:")} ${status}  ${chalk.dim("Slots:")} ${slots}  ${chalk.dim("Reward:")} ${t.rewardClips.toNumber()} 📎`);
    console.log(`  ${chalk.dim("CID:")} ${contentCid}`);

    // Fetch content from Storacha
    const fetchSpinner = ora({ text: "  Fetching content from Storacha...", indent: 2 }).start();
    const result = await fetchFromStoracha(contentCid);

    if (result.ok) {
      fetchSpinner.succeed("Content fetched from Storacha");
      passCount++;

      // Show content preview
      const content = result.data as any;
      if (content?.description) {
        console.log(`    ${chalk.dim("📝")} ${content.description}`);
      }
      if (content?.category) {
        console.log(`    ${chalk.dim("🏷️")}  ${content.category} / ${content.difficulty || "?"}`);
      }
      if (content?.acceptance_criteria?.length) {
        console.log(`    ${chalk.dim("✓")}  ${content.acceptance_criteria.length} acceptance criteria`);
      }
    } else {
      fetchSpinner.fail(`Content fetch failed: ${result.error}`);
      failCount++;
    }
  }

  // Summary
  console.log();
  console.log(chalk.dim("━".repeat(60)));
  console.log(
    `  ${chalk.bold("Results:")} ` +
    `${chalk.green(`${passCount} passed`)} / ` +
    `${failCount > 0 ? chalk.red(`${failCount} failed`) : chalk.dim("0 failed")}`
  );

  if (failCount === 0) {
    console.log(`  ${chalk.green("✅")} All tasks verified! Content is reachable from Storacha.`);
    console.log(`  ${chalk.dim("💡")} Agents can browse with: ${chalk.bold("pc tasks")}`);
  } else {
    console.log(`  ${chalk.red("❌")} Some tasks have unreachable content.`);
    console.log(`  ${chalk.dim("💡")} Check gateway URL and CID validity.`);
  }
  console.log();
}

main().catch((err) => {
  console.error(chalk.red(`\n  ❌ ${err.message || err}\n`));
  process.exit(1);
});
