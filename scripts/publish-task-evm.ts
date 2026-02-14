/**
 * publish-task-evm.ts — Admin script to publish tasks on the EVM (Monad) contract
 *
 * Mirrors the Solana `publish-task.ts` flow:
 *   1. Reads task definitions from tasks/catalog.json
 *   2. Uploads task content JSON to Storacha (IPFS) → gets real CID
 *   3. Calls createTask on-chain with the Storacha CID
 *
 * Usage:
 *   npx tsx scripts/publish-task-evm.ts --task-ids 1,2,3,10,13,15,30,32,34,52,54,59,70,75,78
 *   npx tsx scripts/publish-task-evm.ts --dry-run
 *   npx tsx scripts/publish-task-evm.ts --limit 5
 *
 * Environment:
 *   DEPLOYER_PRIVATE_KEY  — Deployer/authority private key
 *   MONAD_RPC_URL         — RPC URL (default: https://testnet-rpc.monad.xyz)
 *   PAPERCLIP_STORACHA_MOCK — Set to "1" to skip real uploads (dev only)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import chalk from "chalk";
import ora from "ora";
import { ethers } from "ethers";
import { uploadJson } from "../cli/src/storacha.ts";

// =============================================================================
// CONFIG
// =============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const ENV_PATH = path.resolve(ROOT_DIR, "evm", ".env");
const CATALOG_PATH = path.resolve(ROOT_DIR, "tasks", "catalog.json");
const NO_PREREQ_TASK_ID = 0xffffffff;

// Load .env manually (no dotenv dep)
function loadEnv(envPath: string): void {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip quotes
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnv(ENV_PATH);

const DEFAULT_CONTRACT = "0x4e794d12625456fb3043c329215555de4d0e2841";
const DEFAULT_RPC_URL = "https://testnet-rpc.monad.xyz";

const CONTRACT_ADDRESS = process.env.MONAD_CONTRACT || DEFAULT_CONTRACT;
const RPC_URL = process.env.MONAD_RPC_URL || DEFAULT_RPC_URL;
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error(chalk.red("  ❌ Missing DEPLOYER_PRIVATE_KEY"));
  process.exit(1);
}

const CONTRACT_ABI = [
  "function createTask(uint32 taskId, string title, string contentCid, uint64 rewardClips, uint16 maxClaims, uint8 minTier, uint32 prerequisiteTaskId) external",
  "function getTask(uint32 taskId) view returns (tuple(bool exists, uint32 taskId, address creator, string title, string contentCid, uint64 rewardClips, uint16 maxClaims, uint16 currentClaims, bool isActive, int64 createdAt, uint8 minTier, uint32 requiredTaskId))",
  "function totalTasks() view returns (uint32)",
];

// =============================================================================
// TYPES
// =============================================================================

interface PublishOptions {
  dryRun: boolean;
  limit: number | null;
  taskIds: number[];
}

interface RawTaskDefinition {
  task_id?: string | number;
  taskId?: number;
  request_task_id?: string | number | null;
  requestTaskId?: number | null;
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

interface NormalizedTask {
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
  const limitRaw = readFlagValue(argv, "--limit");
  const taskIdsRaw = readFlagValue(argv, "--task-ids");

  return {
    dryRun: argv.includes("--dry-run"),
    limit: limitRaw ? parsePositiveInt(limitRaw, "--limit") : null,
    taskIds: taskIdsRaw ? parseTaskIds(taskIdsRaw) : [],
  };
}

function readFlagValue(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  if (idx === -1) return undefined;
  const value = argv[idx + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
  return value;
}

function parsePositiveInt(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${field}: "${value}". Expected a positive integer.`);
  }
  return parsed;
}

function parseTaskIds(value: string): number[] {
  const ids = value.split(",").map(s => s.trim()).filter(Boolean).map(s => parsePositiveInt(s, "--task-ids"));
  return Array.from(new Set(ids)).sort((a, b) => a - b);
}

function assertInteger(value: unknown, field: string, src: string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`Invalid ${field} in ${src}: ${value}`);
  return n;
}

function normalizeInstructions(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function normalizeAcceptanceCriteria(raw: RawTaskDefinition): string[] {
  if (Array.isArray(raw.acceptance_criteria)) return raw.acceptance_criteria.map(String);
  if (typeof raw.expected_output === "string" && raw.expected_output.trim())
    return [`Expected output: ${raw.expected_output.trim()}`];
  return [];
}

function loadJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function collectTaskFiles(catalogPath: string): string[] {
  const catalog = loadJson(catalogPath) as Catalog;
  const files = new Set<string>();
  for (const cat of Object.values(catalog.categories || {})) {
    if (cat.file) files.add(cat.file.trim());
    if (Array.isArray(cat.files)) {
      for (const f of cat.files) if (f) files.add(f.trim());
    }
  }
  return Array.from(files).sort();
}

function normalizeTask(raw: RawTaskDefinition, src: string): NormalizedTask {
  const taskId = assertInteger(raw.task_id ?? raw.taskId, "task_id", src);
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title) throw new Error(`Missing title in ${src} (task_id=${taskId})`);

  const description = typeof raw.description === "string" ? raw.description.trim() : "";
  if (!description) throw new Error(`Missing description in ${src} (task_id=${taskId})`);

  const instructions = normalizeInstructions(raw.instructions);
  if (instructions.length === 0) throw new Error(`Missing instructions in ${src} (task_id=${taskId})`);

  const rewardClips = assertInteger(raw.reward_clips ?? raw.rewardClips, "reward_clips", src);
  const maxClaims = assertInteger(raw.max_claims ?? raw.maxClaims, "max_claims", src);
  if (maxClaims > 65535) throw new Error(`max_claims > 65535 for task ${taskId} in ${src}`);

  const minTier = raw.min_tier ?? raw.minTier ?? 0;
  let requiredTaskId = NO_PREREQ_TASK_ID;
  const reqRaw = raw.required_task_id ?? raw.requiredTaskId;
  if (reqRaw !== undefined && reqRaw !== null && reqRaw !== "") {
    requiredTaskId = assertInteger(reqRaw, "required_task_id", src);
  }

  const questOrder = raw.quest_order !== undefined && raw.quest_order !== null
    ? assertInteger(raw.quest_order, "quest_order", src) : null;

  const content = {
    ...raw,
    task_id: String(taskId),
    request_task_id: String(taskId),
    reward_clips: rewardClips,
    max_claims: maxClaims,
    min_tier: minTier,
    required_task_id: requiredTaskId === NO_PREREQ_TASK_ID ? null : requiredTaskId,
    instructions,
    acceptance_criteria: normalizeAcceptanceCriteria(raw),
  } as Record<string, unknown>;

  return { taskId, title, rewardClips, maxClaims, minTier, requiredTaskId, questOrder, category: raw.category || "", sourceFile: src, content };
}

function inferOnboardingPrerequisites(tasks: NormalizedTask[]): void {
  const onboarding = tasks
    .filter(t => t.category === "onboarding" && t.questOrder !== null)
    .sort((a, b) => (a.questOrder as number) - (b.questOrder as number));

  for (let i = 0; i < onboarding.length; i++) {
    if (onboarding[i].requiredTaskId === NO_PREREQ_TASK_ID && i > 0) {
      onboarding[i].requiredTaskId = onboarding[i - 1].taskId;
      onboarding[i].content.required_task_id = onboarding[i - 1].taskId;
    }
  }
}

function loadTaskDefinitions(catalogPath: string): NormalizedTask[] {
  const taskFiles = collectTaskFiles(catalogPath);
  if (taskFiles.length === 0) throw new Error(`No task files in ${catalogPath}`);

  const tasks: NormalizedTask[] = [];
  for (const relFile of taskFiles) {
    const absFile = path.resolve(path.dirname(catalogPath), relFile);
    const parsed = loadJson(absFile);
    if (Array.isArray(parsed)) {
      for (const raw of parsed) tasks.push(normalizeTask(raw as RawTaskDefinition, relFile));
    } else {
      tasks.push(normalizeTask(parsed as RawTaskDefinition, relFile));
    }
  }

  inferOnboardingPrerequisites(tasks);
  return tasks.sort((a, b) => a.taskId - b.taskId);
}

function expandPrereqs(selectedIds: Set<number>, byId: Map<number, NormalizedTask>): Set<number> {
  const expanded = new Set(selectedIds);
  const queue = [...selectedIds];
  while (queue.length > 0) {
    const id = queue.pop()!;
    const task = byId.get(id);
    if (!task || task.requiredTaskId === NO_PREREQ_TASK_ID || expanded.has(task.requiredTaskId)) continue;
    if (!byId.has(task.requiredTaskId)) throw new Error(`Task ${id} has missing prerequisite ${task.requiredTaskId}`);
    expanded.add(task.requiredTaskId);
    queue.push(task.requiredTaskId);
  }
  return expanded;
}

function selectTasks(tasks: NormalizedTask[], options: PublishOptions): NormalizedTask[] {
  const byId = new Map(tasks.map(t => [t.taskId, t]));
  let selected = tasks;

  if (options.taskIds.length > 0) {
    for (const id of options.taskIds) if (!byId.has(id)) throw new Error(`Unknown task_id ${id}`);
    const ids = expandPrereqs(new Set(options.taskIds), byId);
    selected = tasks.filter(t => ids.has(t.taskId));
  }

  if (options.limit !== null && selected.length > options.limit) {
    const limited = new Set(selected.slice(0, options.limit).map(t => t.taskId));
    const expanded = expandPrereqs(limited, byId);
    selected = tasks.filter(t => expanded.has(t.taskId));
  }

  return selected.sort((a, b) => a.taskId - b.taskId);
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
// MAIN
// =============================================================================

async function main() {
  const options = parseOptions(process.argv.slice(2));

  console.log();
  console.log(chalk.dim("━".repeat(60)));
  console.log(`  ${chalk.bold.magenta("📎 Paperclip")} ${chalk.dim("— EVM: Publish Tasks (Monad)")}`);
  console.log(chalk.dim("━".repeat(60)));

  const allTasks = loadTaskDefinitions(CATALOG_PATH);
  const tasks = selectTasks(allTasks, options);

  if (tasks.length === 0) {
    throw new Error("No tasks selected. Use --task-ids or --limit.");
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY!, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

  console.log(`  ${chalk.dim("👤 Authority:")} ${wallet.address}`);
  console.log(`  ${chalk.dim("🔗 RPC:")} ${RPC_URL}`);
  console.log(`  ${chalk.dim("📜 Contract:")} ${CONTRACT_ADDRESS}`);
  console.log(`  ${chalk.dim("📋 Tasks:")} ${tasks.length}/${allTasks.length}`);
  if (options.taskIds.length > 0) console.log(`  ${chalk.dim("🎯 IDs:")} ${options.taskIds.join(",")}`);
  if (options.dryRun) console.log(`  ${chalk.dim("🧪 Mode:")} ${chalk.yellow("dry-run")}`);
  console.log();

  let published = 0;
  let skipped = 0;
  let failed = 0;

  for (const task of tasks) {
    const spin = ora(`[${task.taskId}] ${task.title}`).start();

    // Check if already exists
    try {
      const existing = await contract.getTask(task.taskId);
      if (existing.exists) {
        spin.warn(`[${task.taskId}] ${task.title} — already exists, skipping`);
        skipped++;
        continue;
      }
    } catch {
      // getTask may revert if task doesn't exist — that's fine
    }

    if (options.dryRun) {
      spin.succeed(
        `[${task.taskId}] ${task.title} — would publish (${task.rewardClips} 📎, prereq ${
          task.requiredTaskId === NO_PREREQ_TASK_ID ? "none" : task.requiredTaskId
        })`
      );
      published++;
      continue;
    }

    try {
      spin.text = `[${task.taskId}] Uploading content to Storacha...`;
      const contentCid = await uploadTaskContent(task.content);

      spin.text = `[${task.taskId}] Creating task on-chain...`;
      const tx = await contract.createTask(
        task.taskId,
        task.title,
        contentCid,
        task.rewardClips,
        task.maxClaims,
        task.minTier,
        task.requiredTaskId,
      );
      await tx.wait();

      spin.succeed(
        `[${task.taskId}] ${task.title} — ${chalk.green(task.rewardClips + " 📎")} (${task.maxClaims} slots) ` +
        `CID: ${chalk.dim(contentCid.slice(0, 20))}...`
      );
      published++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      spin.fail(`[${task.taskId}] ${task.title} — ${chalk.red(msg.split("\n")[0])}`);
      failed++;
    }
  }

  console.log();
  console.log(chalk.dim("━".repeat(60)));
  console.log(`  ${chalk.dim("📊 Published:")} ${published}`);
  console.log(`  ${chalk.dim("📊 Skipped:")} ${skipped}`);
  if (failed > 0) console.log(`  ${chalk.red("📊 Failed:")} ${failed}`);

  const total = await contract.totalTasks();
  console.log(`  ${chalk.dim("📊 Total tasks on-chain:")} ${total}`);
  console.log();

  if (failed === 0) {
    console.log(`  ${chalk.green("✅")} Done! Agents can run: ${chalk.bold("pc tasks --server monad-testnet")}`);
  } else {
    console.log(`  ${chalk.red("❌")} Completed with failures. Review logs above.`);
  }
  console.log();
}

main().catch((err) => {
  console.error(chalk.red(`\n  ❌ ${err.message || err}\n`));
  process.exit(1);
});
