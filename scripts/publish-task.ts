/**
 * publish-task.ts — Admin script to create tasks on the Paperclip Protocol
 *
 * Reads task definitions from tasks/catalog.json (+ referenced files),
 * uploads task content to Storacha (IPFS), then creates tasks on-chain.
 *
 * Usage:
 *   npx tsx publish-task.ts
 *   npx tsx publish-task.ts --dry-run
 *   npx tsx publish-task.ts --examples
 *
 * Environment:
 *   PAPERCLIP_PROGRAM_ID      — Program ID (default: BjNH...Sy83 on devnet)
 *   PAPERCLIP_RPC_URL         — RPC URL (default: https://api.devnet.solana.com)
 *   PAPERCLIP_WALLET          — Wallet path (default: ~/.config/solana/id.json)
 *   PAPERCLIP_STORACHA_MOCK   — Set to "1" to skip real uploads (dev only)
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
import { uploadJson } from "../cli/src/storacha.ts";

// =============================================================================
// CONFIG
// =============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const DEFAULT_RPC_URL = "https://api.devnet.solana.com";
const DEFAULT_PROGRAM_ID = "BjNHQo9MFTwgpqHRHkcqYmRfkikMfzKZJdsUkNq9Sy83";

const RPC_URL = process.env.PAPERCLIP_RPC_URL || DEFAULT_RPC_URL;
const WALLET_PATH =
  process.env.PAPERCLIP_WALLET ||
  path.join(os.homedir(), ".config", "solana", "id.json");

const IDL_PATH = path.resolve(ROOT_DIR, "target", "idl", "paperclip_protocol.json");
const CATALOG_PATH = path.resolve(ROOT_DIR, "tasks", "catalog.json");

const PROTOCOL_SEED = Buffer.from("protocol");
const TASK_SEED = Buffer.from("task");
const NO_PREREQ_TASK_ID = 0xffffffff;

interface PublishOptions {
  dryRun: boolean;
  examples: boolean;
}

interface RawTaskDefinition {
  task_id?: string | number;
  taskId?: number;
  title?: string;
  description?: string;
  instructions?: string[] | string;
  acceptance_criteria?: string[];
  expected_output?: string;
  reward_clips?: number;
  rewardClips?: number;
  max_claims?: number;
  maxClaims?: number;
  min_tier?: number;
  minTier?: number;
  required_task_id?: number | string | null;
  requiredTaskId?: number | null;
  category?: string;
  difficulty?: string;
  quest_order?: number;
  [key: string]: unknown;
}

interface CatalogCategory {
  file?: string;
  files?: string[];
}

interface Catalog {
  categories?: Record<string, CatalogCategory>;
}

interface NormalizedTaskDefinition {
  taskId: number;
  title: string;
  rewardClips: number;
  maxClaims: number;
  minTier: number;
  requiredTaskId: number;
  questOrder: number | null;
  category: string;
  sourceFile: string;
  content: Record<string, unknown>;
}

// =============================================================================
// HELPERS
// =============================================================================

function parseOptions(argv: string[]): PublishOptions {
  return {
    dryRun: argv.includes("--dry-run"),
    examples: argv.includes("--examples"),
  };
}

function buildExampleTasks(): NormalizedTaskDefinition[] {
  return [
    {
      taskId: 2001,
      title: "Summarize Bitcoin Whitepaper",
      rewardClips: 120,
      maxClaims: 100,
      minTier: 0,
      requiredTaskId: NO_PREREQ_TASK_ID,
      questOrder: null,
      category: "research",
      sourceFile: "scripts/publish-task.ts:examples",
      content: {
        version: "0.1.0",
        task_id: "2001",
        title: "Summarize Bitcoin Whitepaper",
        description:
          "Read the original Bitcoin whitepaper and produce a concise, accurate summary for non-experts.",
        instructions: [
          "1. Read the PDF in full (or at minimum sections 1-4 and 8).",
          "2. Write a 3-5 sentence summary in plain language.",
          "3. Include one sentence explaining Proof-of-Work and one sentence on double-spend prevention.",
          "4. Submit proof JSON with fields: summary, pow_explanation, double_spend_prevention, citations.",
        ],
        acceptance_criteria: [
          "Summary is factually consistent with the PDF.",
          "Proof includes at least 2 direct section references (e.g. 'Section 3').",
          "pow_explanation and double_spend_prevention are present and non-empty.",
        ],
        resources: [
          {
            type: "pdf",
            title: "Bitcoin: A Peer-to-Peer Electronic Cash System",
            url: "https://bitcoin.org/bitcoin.pdf",
          },
        ],
        category: "research",
        difficulty: "easy",
        reward_clips: 120,
        max_claims: 100,
        min_tier: 0,
        required_task_id: null,
      },
    },
    {
      taskId: 2002,
      title: "Translate Product Copy EN→PT-BR",
      rewardClips: 140,
      maxClaims: 100,
      minTier: 0,
      requiredTaskId: NO_PREREQ_TASK_ID,
      questOrder: null,
      category: "translation",
      sourceFile: "scripts/publish-task.ts:examples",
      content: {
        version: "0.1.0",
        task_id: "2002",
        title: "Translate Product Copy EN→PT-BR",
        description:
          "Translate provided product copy from English to Brazilian Portuguese, preserving tone and terminology.",
        source_text:
          "Paperclip Protocol is a quest game where AI agents complete real tasks, submit proof, and earn Clips. Build your on-chain reputation by delivering useful, verifiable work.",
        glossary: {
          "Paperclip Protocol": "Paperclip Protocol",
          "Clips": "Clips",
          "on-chain reputation": "reputação on-chain",
        },
        instructions: [
          "1. Translate source_text to natural PT-BR (not PT-PT).",
          "2. Keep product names and glossary terms unchanged where specified.",
          "3. Submit proof JSON with fields: source_text, translation, notes.",
        ],
        acceptance_criteria: [
          "Translation is fluent PT-BR and semantically faithful to source_text.",
          "Glossary terms are respected.",
          "No untranslated full sentence remains unless justified in notes.",
        ],
        category: "translation",
        difficulty: "easy",
        reward_clips: 140,
        max_claims: 100,
        min_tier: 0,
        required_task_id: null,
      },
    },
    {
      taskId: 2003,
      title: "Create COCO Labels for 3 Images",
      rewardClips: 180,
      maxClaims: 100,
      minTier: 0,
      requiredTaskId: NO_PREREQ_TASK_ID,
      questOrder: null,
      category: "data-labeling",
      sourceFile: "scripts/publish-task.ts:examples",
      content: {
        version: "0.1.0",
        task_id: "2003",
        title: "Create COCO Labels for 3 Images",
        description:
          "Annotate three public images with bounding boxes in COCO JSON format.",
        resources: [
          {
            type: "image",
            id: "img-1",
            url: "https://upload.wikimedia.org/wikipedia/commons/3/3f/Fronalpstock_big.jpg",
            target_classes: ["mountain", "lake"],
          },
          {
            type: "image",
            id: "img-2",
            url: "https://upload.wikimedia.org/wikipedia/commons/7/7d/Dog_face.png",
            target_classes: ["dog"],
          },
          {
            type: "image",
            id: "img-3",
            url: "https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png",
            target_classes: ["bird"],
          },
        ],
        instructions: [
          "1. Download the 3 images from resources.",
          "2. Produce COCO JSON with images, annotations, and categories sections.",
          "3. Include at least one bounding box per required class.",
          "4. Submit proof JSON with fields: coco_json, categories_used, annotation_count.",
        ],
        acceptance_criteria: [
          "COCO JSON is valid and parseable.",
          "Each resource image has at least one annotation.",
          "Categories include the target classes listed in each resource item.",
        ],
        category: "data-labeling",
        difficulty: "medium",
        reward_clips: 180,
        max_claims: 100,
        min_tier: 0,
        required_task_id: null,
      },
    },
  ];
}

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
  return PublicKey.findProgramAddressSync([TASK_SEED, taskIdBytes(taskId)], programId)[0];
}

function loadKeypair(filePath: string): Keypair {
  const raw = fs.readFileSync(filePath, "utf8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

function assertInteger(value: unknown, field: string, sourceFile: string): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(numeric) || numeric < 0) {
    throw new Error(`Invalid ${field} in ${sourceFile}: ${String(value)}`);
  }
  return numeric;
}

function normalizeInstructions(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((step) => String(step));
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}

function normalizeAcceptanceCriteria(raw: RawTaskDefinition): string[] {
  const explicit = Array.isArray(raw.acceptance_criteria)
    ? raw.acceptance_criteria.map((rule) => String(rule))
    : [];

  if (explicit.length > 0) {
    return explicit;
  }

  if (typeof raw.expected_output === "string" && raw.expected_output.trim()) {
    return [`Expected output: ${raw.expected_output.trim()}`];
  }

  return [];
}

function loadJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function collectTaskFilesFromCatalog(catalogPath: string): string[] {
  const catalog = loadJson(catalogPath) as Catalog;
  const categories = catalog.categories || {};
  const files = new Set<string>();

  for (const category of Object.values(categories)) {
    if (typeof category.file === "string" && category.file.trim()) {
      files.add(category.file.trim());
    }
    if (Array.isArray(category.files)) {
      for (const file of category.files) {
        if (typeof file === "string" && file.trim()) {
          files.add(file.trim());
        }
      }
    }
  }

  return Array.from(files).sort();
}

function normalizeTask(raw: RawTaskDefinition, sourceFile: string): NormalizedTaskDefinition {
  const taskIdValue = raw.task_id ?? raw.taskId;
  const taskId = assertInteger(taskIdValue, "task_id", sourceFile);

  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title) {
    throw new Error(`Missing title in ${sourceFile} (task_id=${taskId})`);
  }
  const titleBytes = Buffer.from(title, "utf8").length;
  if (titleBytes > 32) {
    throw new Error(
      `Title exceeds 32 bytes for task_id=${taskId} in ${sourceFile}: ${titleBytes} bytes`
    );
  }

  const description = typeof raw.description === "string" ? raw.description.trim() : "";
  if (!description) {
    throw new Error(`Missing description in ${sourceFile} (task_id=${taskId})`);
  }

  const instructions = normalizeInstructions(raw.instructions);
  if (instructions.length === 0) {
    throw new Error(`Missing instructions in ${sourceFile} (task_id=${taskId})`);
  }

  const rewardClips = assertInteger(
    raw.reward_clips ?? raw.rewardClips,
    "reward_clips",
    sourceFile
  );
  const maxClaims = assertInteger(raw.max_claims ?? raw.maxClaims, "max_claims", sourceFile);
  if (maxClaims > 65535) {
    throw new Error(
      `max_claims exceeds u16 for task_id=${taskId} in ${sourceFile}: ${maxClaims} > 65535`
    );
  }

  const minTierRaw = raw.min_tier ?? raw.minTier;
  const minTier = minTierRaw === undefined ? 0 : assertInteger(minTierRaw, "min_tier", sourceFile);

  const requiredTaskIdRaw = raw.required_task_id ?? raw.requiredTaskId;
  let requiredTaskId = NO_PREREQ_TASK_ID;
  if (requiredTaskIdRaw !== undefined && requiredTaskIdRaw !== null && requiredTaskIdRaw !== "") {
    requiredTaskId = assertInteger(requiredTaskIdRaw, "required_task_id", sourceFile);
  }

  const category = typeof raw.category === "string" ? raw.category.trim() : "";
  const questOrderRaw = raw.quest_order;
  const questOrder =
    questOrderRaw === undefined || questOrderRaw === null
      ? null
      : assertInteger(questOrderRaw, "quest_order", sourceFile);

  const acceptanceCriteria = normalizeAcceptanceCriteria(raw);

  const content = {
    ...raw,
    task_id: String(taskId),
    reward_clips: rewardClips,
    max_claims: maxClaims,
    min_tier: minTier,
    required_task_id: requiredTaskId === NO_PREREQ_TASK_ID ? null : requiredTaskId,
    instructions,
    acceptance_criteria: acceptanceCriteria,
  } as Record<string, unknown>;

  return {
    taskId,
    title,
    rewardClips,
    maxClaims,
    minTier,
    requiredTaskId,
    questOrder,
    category,
    sourceFile,
    content,
  };
}

function inferOnboardingPrerequisites(tasks: NormalizedTaskDefinition[]): void {
  const onboarding = tasks
    .filter((task) => task.category === "onboarding" && task.questOrder !== null)
    .sort((a, b) => (a.questOrder as number) - (b.questOrder as number));

  if (onboarding.length === 0) {
    return;
  }

  for (let idx = 0; idx < onboarding.length; idx++) {
    const current = onboarding[idx];
    const expectedOrder = idx + 1;
    if (current.questOrder !== expectedOrder) {
      throw new Error(
        `Onboarding quest_order sequence mismatch: expected ${expectedOrder}, got ${current.questOrder} in ${current.sourceFile}`
      );
    }

    if (current.requiredTaskId === NO_PREREQ_TASK_ID && idx > 0) {
      current.requiredTaskId = onboarding[idx - 1].taskId;
      current.content.required_task_id = onboarding[idx - 1].taskId;
    }
  }
}

function validateTasks(tasks: NormalizedTaskDefinition[]): void {
  const idSet = new Set<number>();
  for (const task of tasks) {
    if (idSet.has(task.taskId)) {
      throw new Error(`Duplicate task_id detected: ${task.taskId} (${task.sourceFile})`);
    }
    idSet.add(task.taskId);
  }

  for (const task of tasks) {
    if (task.requiredTaskId !== NO_PREREQ_TASK_ID && !idSet.has(task.requiredTaskId)) {
      throw new Error(
        `Task ${task.taskId} requires missing task ${task.requiredTaskId} (${task.sourceFile})`
      );
    }
  }
}

function loadTaskDefinitions(catalogPath: string): NormalizedTaskDefinition[] {
  const taskFiles = collectTaskFilesFromCatalog(catalogPath);
  if (taskFiles.length === 0) {
    throw new Error(`No task files referenced in catalog: ${catalogPath}`);
  }

  const tasks: NormalizedTaskDefinition[] = [];

  for (const relFile of taskFiles) {
    const absFile = path.resolve(path.dirname(catalogPath), relFile);
    const parsed = loadJson(absFile);

    if (Array.isArray(parsed)) {
      for (const rawTask of parsed) {
        tasks.push(normalizeTask(rawTask as RawTaskDefinition, relFile));
      }
      continue;
    }

    tasks.push(normalizeTask(parsed as RawTaskDefinition, relFile));
  }

  inferOnboardingPrerequisites(tasks);
  validateTasks(tasks);

  return tasks.sort((a, b) => a.taskId - b.taskId);
}

// =============================================================================
// STORACHA UPLOAD
// =============================================================================

async function uploadTaskContent(data: Record<string, unknown>): Promise<string> {
  if (process.env.PAPERCLIP_STORACHA_MOCK === "1") {
    const hash = Buffer.from(JSON.stringify(data)).toString("base64").slice(0, 16);
    return `mock-${hash}`;
  }
  return uploadJson(data, "tasks");
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
  const options = parseOptions(process.argv.slice(2));

  console.log();
  console.log(chalk.dim("━".repeat(60)));
  console.log(`  ${chalk.bold.magenta("📎 Paperclip")} ${chalk.dim("— Admin: Publish Tasks")}`);
  console.log(chalk.dim("━".repeat(60)));

  const taskDefs = options.examples
    ? buildExampleTasks()
    : loadTaskDefinitions(CATALOG_PATH);
  const { program, wallet } = getProgram();

  console.log(`  ${chalk.dim("👤 Authority:")} ${wallet.publicKey.toBase58()}`);
  console.log(`  ${chalk.dim("🔗 RPC:")} ${RPC_URL}`);
  if (options.examples) {
    console.log(`  ${chalk.dim("📦 Source:")} built-in example tasks (--examples)`);
    console.log(`  ${chalk.dim("📋 Example tasks:")} ${taskDefs.length}`);
  } else {
    console.log(`  ${chalk.dim("📦 Catalog:")} ${path.relative(ROOT_DIR, CATALOG_PATH)}`);
    console.log(`  ${chalk.dim("📋 Tasks in catalog:")} ${taskDefs.length}`);
  }
  if (options.dryRun) {
    console.log(`  ${chalk.dim("🧪 Mode:")} ${chalk.yellow("dry-run (no upload, no tx)")}`);
  }
  console.log();

  const protocolPda = getProtocolPda(program.programId);

  const spinner = ora("Checking protocol state...").start();
  try {
    await (program.account as any).protocolState.fetch(protocolPda);
    spinner.succeed("Protocol initialized");
  } catch {
    spinner.fail("Protocol not initialized! Run tests first: anchor test --skip-local-validator");
    process.exit(1);
  }

  let published = 0;
  let skipped = 0;
  let failed = 0;

  for (const task of taskDefs) {
    const taskSpinner = ora(`[${task.taskId}] ${task.title}`).start();
    const taskPda = getTaskPda(program.programId, task.taskId);

    try {
      await (program.account as any).taskRecord.fetch(taskPda);
      taskSpinner.warn(`[${task.taskId}] ${task.title} — already exists, skipping`);
      skipped++;
      continue;
    } catch {
      // Expected when task does not exist yet.
    }

    if (options.dryRun) {
      taskSpinner.succeed(
        `[${task.taskId}] ${task.title} — would publish (${task.rewardClips} 📎, tier ${task.minTier}, prereq ${
          task.requiredTaskId === NO_PREREQ_TASK_ID ? "none" : task.requiredTaskId
        })`
      );
      published++;
      continue;
    }

    try {
      taskSpinner.text = `[${task.taskId}] Uploading content to Storacha...`;
      const contentCid = await uploadTaskContent(task.content);

      taskSpinner.text = `[${task.taskId}] Creating task on-chain...`;
      await program.methods
        .createTask(
          task.taskId,
          toFixedBytes(task.title, 32),
          toFixedBytes(contentCid, 64),
          new BN(task.rewardClips),
          task.maxClaims,
          task.minTier,
          task.requiredTaskId
        )
        .accounts({
          protocol: protocolPda,
          authority: wallet.publicKey,
          task: taskPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      taskSpinner.succeed(
        `[${task.taskId}] ${task.title} — ${chalk.green(task.rewardClips + " 📎")} (${task.maxClaims} slots) ` +
          `tier ${task.minTier}, prereq ${
            task.requiredTaskId === NO_PREREQ_TASK_ID ? "none" : task.requiredTaskId
          } — CID: ${chalk.dim(contentCid.slice(0, 20))}...`
      );
      published++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      taskSpinner.fail(`[${task.taskId}] ${task.title} — ${chalk.red(msg.split("\n")[0])}`);
      failed++;
    }
  }

  console.log();
  console.log(chalk.dim("━".repeat(60)));
  console.log(`  ${chalk.dim("📊 Planned/published:")} ${published}`);
  console.log(`  ${chalk.dim("📊 Skipped:")} ${skipped}`);
  if (failed > 0) {
    console.log(`  ${chalk.red("📊 Failed:")} ${failed}`);
  }

  if (!options.dryRun) {
    const protocol = await (program.account as any).protocolState.fetch(protocolPda);
    console.log(`  ${chalk.dim("📊 Total tasks on-chain:")} ${protocol.totalTasks}`);
    console.log(`  ${chalk.dim("📊 Total agents:")} ${protocol.totalAgents}`);
    console.log(`  ${chalk.dim("📊 Total clips distributed:")} ${protocol.totalClipsDistributed.toNumber()}`);
  }

  console.log();
  if (failed === 0) {
    console.log(`  ${chalk.green("✅")} Done! Agents can run: ${chalk.bold("pc tasks")}`);
  } else {
    console.log(`  ${chalk.red("❌")} Completed with failures. Review logs above.`);
  }
  console.log();
}

main().catch((err) => {
  console.error(chalk.red(`\n  ❌ ${err.message || err}\n`));
  process.exit(1);
});
