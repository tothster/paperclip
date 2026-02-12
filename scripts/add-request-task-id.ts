#!/usr/bin/env npx tsx

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const CATALOG_PATH = path.resolve(ROOT_DIR, "tasks", "catalog.json");

interface CatalogCategory {
  file?: string;
  files?: string[];
}

interface Catalog {
  categories?: Record<string, CatalogCategory>;
}

interface TaskLike {
  task_id?: string | number;
  taskId?: number;
  request_task_id?: string | number | null;
  [k: string]: unknown;
}

interface Options {
  taskIds: Set<number> | null;
  all: boolean;
  write: boolean;
  dryRun: boolean;
}

interface AuditStats {
  totalTasks: number;
  withRequestTaskId: number;
  missingRequestTaskId: number;
  mismatchedRequestTaskId: number;
  selectedTasks: number;
  changedTasks: number;
  changedFiles: number;
}

function printUsage(): void {
  console.log(`
Usage:
  npx tsx scripts/add-request-task-id.ts
  npx tsx scripts/add-request-task-id.ts --task-ids 1,2,3 --write
  npx tsx scripts/add-request-task-id.ts --all --write

Options:
  --task-ids <ids>  Comma-separated task IDs to update (subset mode)
  --all             Update all tasks (requires --write)
  --write           Persist changes to disk
  --dry-run         Preview changes without writing
  --help            Show this help
`);
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseTaskIds(value: string): Set<number> {
  const values = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (values.length === 0) {
    throw new Error('Invalid --task-ids value. Example: --task-ids "1,2,3"');
  }

  const ids = new Set<number>();
  for (const valueItem of values) {
    const numeric = Number(valueItem);
    if (!Number.isInteger(numeric) || numeric < 0) {
      throw new Error(`Invalid task_id "${valueItem}" in --task-ids`);
    }
    ids.add(numeric);
  }
  return ids;
}

function readFlagValue(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  if (idx === -1) return undefined;
  const value = argv[idx + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function parseOptions(argv: string[]): Options {
  if (argv.includes("--help")) {
    printUsage();
    process.exit(0);
  }

  const taskIdsRaw = readFlagValue(argv, "--task-ids");
  const taskIds = taskIdsRaw ? parseTaskIds(taskIdsRaw) : null;
  const all = argv.includes("--all");
  const write = argv.includes("--write");
  const dryRun = argv.includes("--dry-run");

  if (taskIds && all) {
    throw new Error("Use either --task-ids or --all, not both.");
  }

  if (write && !taskIds && !all) {
    throw new Error("Refusing to write without selection. Use --task-ids <ids> or --all.");
  }

  return { taskIds, all, write, dryRun };
}

function asTaskId(task: TaskLike): number {
  const raw = task.task_id ?? task.taskId;
  const numeric = Number(raw);
  if (!Number.isInteger(numeric) || numeric < 0) {
    throw new Error(`Invalid task_id: ${String(raw)}`);
  }
  return numeric;
}

function asRequestTaskId(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const numeric = Number(raw);
  if (!Number.isInteger(numeric) || numeric < 0) return null;
  return numeric;
}

function collectFilesFromCatalog(catalogPath: string): string[] {
  const catalog = readJson(catalogPath) as Catalog;
  const out = new Set<string>();

  for (const cat of Object.values(catalog.categories || {})) {
    if (typeof cat.file === "string" && cat.file.trim()) {
      out.add(cat.file.trim());
    }
    if (Array.isArray(cat.files)) {
      for (const file of cat.files) {
        if (typeof file === "string" && file.trim()) {
          out.add(file.trim());
        }
      }
    }
  }

  return Array.from(out).sort();
}

function shouldSelectTask(taskId: number, options: Options): boolean {
  if (options.all) return true;
  if (options.taskIds) return options.taskIds.has(taskId);
  return false;
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  const files = collectFilesFromCatalog(CATALOG_PATH);
  const selectedFound = new Set<number>();

  const stats: AuditStats = {
    totalTasks: 0,
    withRequestTaskId: 0,
    missingRequestTaskId: 0,
    mismatchedRequestTaskId: 0,
    selectedTasks: 0,
    changedTasks: 0,
    changedFiles: 0,
  };

  for (const relFile of files) {
    const absFile = path.resolve(path.dirname(CATALOG_PATH), relFile);
    const parsed = readJson(absFile);
    const tasks = (Array.isArray(parsed) ? parsed : [parsed]) as TaskLike[];

    let fileChanged = false;
    for (const task of tasks) {
      const taskId = asTaskId(task);
      const selected = shouldSelectTask(taskId, options);
      if (selected) {
        stats.selectedTasks++;
        selectedFound.add(taskId);
      }

      stats.totalTasks++;
      const requestTaskId = asRequestTaskId(task.request_task_id);
      if (requestTaskId === null) {
        stats.missingRequestTaskId++;
      } else {
        stats.withRequestTaskId++;
        if (requestTaskId !== taskId) {
          stats.mismatchedRequestTaskId++;
        }
      }

      if (!selected) continue;

      const normalizedValue = String(taskId);
      if (task.request_task_id !== normalizedValue) {
        task.request_task_id = normalizedValue;
        stats.changedTasks++;
        fileChanged = true;
      }
    }

    if (fileChanged) {
      stats.changedFiles++;
      if (options.write && !options.dryRun) {
        writeJson(absFile, Array.isArray(parsed) ? tasks : tasks[0]);
      }
      console.log(
        `${options.write && !options.dryRun ? "updated" : "would update"} ${relFile}`
      );
    }
  }

  if (options.taskIds) {
    const missingSelected = Array.from(options.taskIds).filter((id) => !selectedFound.has(id));
    if (missingSelected.length > 0) {
      throw new Error(`Unknown task_id(s): ${missingSelected.join(", ")}`);
    }
  }

  console.log("");
  console.log("Audit summary:");
  console.log(`  Total tasks: ${stats.totalTasks}`);
  console.log(`  request_task_id present: ${stats.withRequestTaskId}`);
  console.log(`  request_task_id missing/invalid: ${stats.missingRequestTaskId}`);
  console.log(`  request_task_id mismatched: ${stats.mismatchedRequestTaskId}`);

  if (options.taskIds || options.all) {
    console.log(`  Selected tasks: ${stats.selectedTasks}`);
    console.log(
      `  ${options.write && !options.dryRun ? "Changed" : "Planned changes"}: ${stats.changedTasks} tasks in ${stats.changedFiles} files`
    );
  } else {
    console.log("  Mode: audit-only (no selection provided)");
  }

  if (!options.write && (options.taskIds || options.all)) {
    console.log("");
    console.log("Re-run with --write to apply these changes.");
  }
}

main();
