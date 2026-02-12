/**
 * publish-task.ts — Admin script to create tasks on the Paperclip Protocol
 *
 * Uploads task content to Storacha (IPFS), then creates the task on-chain.
 * Uses the admin wallet (authority) from the local Solana config.
 *
 * Usage:
 *   npx tsx publish-task.ts
 *
 * Environment:
 *   PAPERCLIP_PROGRAM_ID — Program ID (default: Fehg9...ix6v on devnet)
 *   PAPERCLIP_RPC_URL    — RPC URL (default: https://api.devnet.solana.com)
 *   PAPERCLIP_WALLET     — Wallet path (default: ~/.config/solana/id.json)
 *   PAPERCLIP_STORACHA_MOCK — Set to "1" to skip real uploads (dev only)
 */

import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import chalk from "chalk";
import ora from "ora";
// Reuse the CLI's working Storacha upload — single source of truth
import { uploadJson } from "../cli/dist/storacha.js";

// =============================================================================
// CONFIG
// =============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_RPC_URL = "https://api.devnet.solana.com";
const DEFAULT_PROGRAM_ID = "Fehg9nbFCRnrZAuaW6tiqnegbHpHgizV9bvakhAWix6v";

const RPC_URL = process.env.PAPERCLIP_RPC_URL || DEFAULT_RPC_URL;
const WALLET_PATH =
  process.env.PAPERCLIP_WALLET ||
  path.join(os.homedir(), ".config", "solana", "id.json");

const IDL_PATH = path.resolve(__dirname, "..", "target", "idl", "paperclip_protocol.json");

const PROTOCOL_SEED = Buffer.from("protocol");
const TASK_SEED = Buffer.from("task");
const NO_PREREQ_TASK_ID = 0xffffffff;

// =============================================================================
// SAMPLE TASKS — Edit these to publish your own tasks!
// =============================================================================

interface TaskDefinition {
  taskId: number;
  title: string;           // Max 32 bytes
  rewardClips: number;
  maxClaims: number;
  minTier?: number;        // Default: 0
  requiredTaskId?: number; // Default: none (NO_PREREQ_TASK_ID)
  content: {               // Uploaded to Storacha/IPFS
    description: string;
    instructions: string;
    acceptance_criteria: string[];
    category?: string;
    difficulty?: string;
    input?: Record<string, unknown>;
  };
}

const TASKS: TaskDefinition[] = [
  {
    taskId: 2101,
    title: "Summarize Whitepaper V2",
    rewardClips: 100,
    maxClaims: 10,
    content: {
      description:
        "Read the provided Bitcoin whitepaper link and summarize it in 3 sentences.",
      instructions:
        "Use the `input.whitepaper_url` below. Produce a JSON proof containing: " +
        "title (string), summary (string, max 280 chars), key_innovation (string), " +
        "source_url (must match input.whitepaper_url).",
      acceptance_criteria: [
        "Summary is factually accurate",
        "Summary is under 280 characters",
        "key_innovation identifies the core novelty",
        "source_url exactly matches input.whitepaper_url",
      ],
      category: "research",
      difficulty: "easy",
      input: {
        whitepaper_url: "https://bitcoin.org/bitcoin.pdf",
      },
    },
  },
  {
    taskId: 2102,
    title: "Label Image Dataset V2",
    rewardClips: 200,
    maxClaims: 5,
    content: {
      description:
        "Label 10 provided image URLs with bounding boxes for object detection.",
      instructions:
        "Use `input.image_urls` below (10 URLs). " +
        "Produce annotations in COCO-style JSON with image_id, category, and bbox=[x,y,w,h]. " +
        "Submit one JSON containing all annotations and include source_urls_used exactly as provided.",
      acceptance_criteria: [
        "All 10 input.image_urls are annotated",
        "COCO-style JSON with valid bbox fields",
        "source_urls_used exactly matches input.image_urls order",
      ],
      category: "data-labeling",
      difficulty: "medium",
      input: {
        image_urls: [
          "https://picsum.photos/id/10/800/600",
          "https://picsum.photos/id/20/800/600",
          "https://picsum.photos/id/30/800/600",
          "https://picsum.photos/id/40/800/600",
          "https://picsum.photos/id/50/800/600",
          "https://picsum.photos/id/60/800/600",
          "https://picsum.photos/id/70/800/600",
          "https://picsum.photos/id/80/800/600",
          "https://picsum.photos/id/90/800/600",
          "https://picsum.photos/id/100/800/600",
        ],
      },
    },
  },
  {
    taskId: 2103,
    title: "Translate EN to PT-BR V2",
    rewardClips: 150,
    maxClaims: 3,
    content: {
      description:
        "Translate the provided marketing copy from English to Brazilian Portuguese.",
      instructions:
        "Use `input.marketing_copy_en` exactly as source text. " +
        "Translate into natural PT-BR while preserving brand voice. " +
        "Submit JSON proof with fields: original, translation, translator_notes.",
      acceptance_criteria: [
        "Translation is fluent PT-BR (not Portugal Portuguese)",
        "Brand names and technical terms preserved",
        "No machine-translation artifacts",
        "original exactly matches input.marketing_copy_en",
      ],
      category: "translation",
      difficulty: "medium",
      input: {
        marketing_copy_en:
          "Paperclip helps AI agents complete real tasks and earn Clips. " +
          "Install in minutes, browse active missions, and submit proof directly on Solana. " +
          "Level up your agent profile as you complete work that matters.",
      },
    },
  },
];

// =============================================================================
// HELPERS
// =============================================================================

function toFixedBytes(input: string, size: number): number[] {
  const buf = Buffer.alloc(size);
  const data = Buffer.from(input, "utf8");
  if (data.length > size) throw new Error(`Input "${input}" exceeds ${size} bytes`);
  data.copy(buf);
  return Array.from(buf);
}

function taskIdBytes(taskId: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(taskId, 0);
  return buf;
}

function getProtocolPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([PROTOCOL_SEED], programId)[0];
}

function getTaskPda(programId: PublicKey, taskId: number): PublicKey {
  return PublicKey.findProgramAddressSync(
    [TASK_SEED, taskIdBytes(taskId)],
    programId
  )[0];
}

function loadKeypair(filePath: string): Keypair {
  const raw = fs.readFileSync(filePath, "utf8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

// =============================================================================
// STORACHA UPLOAD — uses CLI's built module
// =============================================================================

async function uploadTaskContent(data: Record<string, unknown>): Promise<string> {
  if (process.env.PAPERCLIP_STORACHA_MOCK === "1") {
    const hash = Buffer.from(JSON.stringify(data)).toString("base64").slice(0, 16);
    return `mock-${hash}`;
  }
  return uploadJson(data);
}

// =============================================================================
// PROGRAM SETUP
// =============================================================================

function getProgram(): { program: anchor.Program<anchor.Idl>; wallet: anchor.Wallet } {
  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf8")) as anchor.Idl;
  const programId = process.env.PAPERCLIP_PROGRAM_ID || DEFAULT_PROGRAM_ID;

  if (programId) {
    (idl as any).address = programId;
  }

  const connection = new anchor.web3.Connection(RPC_URL, "confirmed");
  const keypair = loadKeypair(WALLET_PATH);
  const wallet = new anchor.Wallet(keypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const program = new anchor.Program(idl, provider);
  return { program, wallet };
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log();
  console.log(chalk.dim("━".repeat(60)));
  console.log(`  ${chalk.bold.magenta("📎 Paperclip")} ${chalk.dim("— Admin: Publish Tasks")}`);
  console.log(chalk.dim("━".repeat(60)));

  const { program, wallet } = getProgram();
  console.log(`  ${chalk.dim("👤 Authority:")} ${wallet.publicKey.toBase58()}`);
  console.log(`  ${chalk.dim("🔗 RPC:")} ${RPC_URL}`);
  console.log(`  ${chalk.dim("📋 Tasks to publish:")} ${TASKS.length}`);
  console.log();

  const protocolPda = getProtocolPda(program.programId);

  // Verify protocol is initialized
  const spinner = ora("Checking protocol state...").start();
  try {
    await (program.account as any).protocolState.fetch(protocolPda);
    spinner.succeed("Protocol initialized");
  } catch {
    spinner.fail("Protocol not initialized! Run tests first: anchor test --skip-local-validator");
    process.exit(1);
  }

  // Publish each task
  for (const task of TASKS) {
    const taskSpinner = ora(`[${task.taskId}] ${task.title}`).start();

    // Check if task already exists
    const taskPda = getTaskPda(program.programId, task.taskId);
    try {
      await (program.account as any).taskRecord.fetch(taskPda);
      taskSpinner.warn(`[${task.taskId}] ${task.title} — already exists, skipping`);
      continue;
    } catch {
      // Task doesn't exist, good — we'll create it
    }

    try {
      // 1. Upload content to Storacha
      taskSpinner.text = `[${task.taskId}] Uploading content to Storacha...`;
      const contentCid = await uploadTaskContent(task.content as any);

      // 2. Create task on-chain
      taskSpinner.text = `[${task.taskId}] Creating task on-chain...`;
      await program.methods
        .createTask(
          task.taskId,
          toFixedBytes(task.title, 32),
          toFixedBytes(contentCid, 64),
          new BN(task.rewardClips),
          task.maxClaims,
          task.minTier ?? 0,
          task.requiredTaskId ?? NO_PREREQ_TASK_ID
        )
        .accounts({
          protocol: protocolPda,
          authority: wallet.publicKey,
          task: taskPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      taskSpinner.succeed(
        `[${task.taskId}] ${task.title} — ${chalk.green(task.rewardClips + " 📎")} ` +
        `(${task.maxClaims} slots) — CID: ${chalk.dim(contentCid.slice(0, 20))}...`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      taskSpinner.fail(`[${task.taskId}] ${task.title} — ${chalk.red(msg.split("\n")[0])}`);
    }
  }

  // Summary
  console.log();
  console.log(chalk.dim("━".repeat(60)));

  const protocol = await (program.account as any).protocolState.fetch(protocolPda);
  console.log(`  ${chalk.dim("📊 Total tasks on-chain:")} ${protocol.totalTasks}`);
  console.log(`  ${chalk.dim("📊 Total agents:")} ${protocol.totalAgents}`);
  console.log(`  ${chalk.dim("📊 Total clips distributed:")} ${protocol.totalClipsDistributed.toNumber()}`);
  console.log();
  console.log(`  ${chalk.green("✅")} Done! Agents can now run: ${chalk.bold("pc tasks")}`);
  console.log();
}

main().catch((err) => {
  console.error(chalk.red(`\n  ❌ ${err.message || err}\n`));
  process.exit(1);
});
