#!/usr/bin/env npx tsx

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
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
  [k: string]: unknown;
}

interface Options {
  count: number;
  startId: number;
  taskIds: number[] | null;
  dryRun: boolean;
  skipMigrate: boolean;
  skipPublish: boolean;
}

function printUsage(): void {
  console.log(`
Usage:
  npm run publish:trail
  npm run publish:trail -- --count 15 --start-id 1
  npm run publish:trail -- --task-ids 1,2,3,4,5,10,11,12,13,14,15,16,17,18,19
  npm run publish:trail -- --dry-run

Options:
  --count <n>         Number of tasks to select from the trail (default: 15)
  --start-id <id>     Minimum task_id to start trail selection (default: 1)
  --task-ids <ids>    Explicit comma-separated task IDs to publish
  --dry-run           Do not write migration or send on-chain publish transactions
  --skip-migrate      Skip request_task_id migration step
  --skip-publish      Skip publish step
  --help              Show this help
`);
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

function parsePositiveInt(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${field} value "${value}". Expected a positive integer.`);
  }
  return parsed;
}

function parseTaskIds(value: string): number[] {
  const values = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (values.length === 0) {
    throw new Error('Invalid --task-ids value. Example: --task-ids "1,2,3"');
  }

  const ids = values.map((item) => parsePositiveInt(item, "--task-ids"));
  return Array.from(new Set(ids)).sort((a, b) => a - b);
}

function parseOptions(argv: string[]): Options {
  if (argv.includes("--help")) {
    printUsage();
    process.exit(0);
  }

  const countRaw = readFlagValue(argv, "--count");
  const startIdRaw = readFlagValue(argv, "--start-id");
  const taskIdsRaw = readFlagValue(argv, "--task-ids");

  return {
    count: countRaw ? parsePositiveInt(countRaw, "--count") : 15,
    startId: startIdRaw ? parsePositiveInt(startIdRaw, "--start-id") : 1,
    taskIds: taskIdsRaw ? parseTaskIds(taskIdsRaw) : null,
    dryRun: argv.includes("--dry-run"),
    skipMigrate: argv.includes("--skip-migrate"),
    skipPublish: argv.includes("--skip-publish"),
  };
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function collectTaskFilesFromCatalog(catalogPath: string): string[] {
  const catalog = readJson(catalogPath) as Catalog;
  const files = new Set<string>();
  const categories = catalog.categories || {};

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

function asTaskId(task: TaskLike, source: string): number {
  const raw = task.task_id ?? task.taskId;
  const numeric = Number(raw);
  if (!Number.isInteger(numeric) || numeric < 0) {
    throw new Error(`Invalid task_id in ${source}: ${String(raw)}`);
  }
  return numeric;
}

function loadAllTaskIds(catalogPath: string): number[] {
  const files = collectTaskFilesFromCatalog(catalogPath);
  const ids = new Set<number>();

  for (const relFile of files) {
    const absFile = path.resolve(path.dirname(catalogPath), relFile);
    const parsed = readJson(absFile);
    const tasks = (Array.isArray(parsed) ? parsed : [parsed]) as TaskLike[];
    for (const task of tasks) {
      ids.add(asTaskId(task, relFile));
    }
  }

  return Array.from(ids).sort((a, b) => a - b);
}

function selectTrailIds(allTaskIds: number[], options: Options): number[] {
  if (options.taskIds) {
    for (const id of options.taskIds) {
      if (!allTaskIds.includes(id)) {
        throw new Error(`Unknown task_id in --task-ids: ${id}`);
      }
    }
    return options.taskIds;
  }

  const candidates = allTaskIds.filter((id) => id >= options.startId);
  const selected = candidates.slice(0, options.count);

  if (selected.length < options.count) {
    throw new Error(
      `Only found ${selected.length} tasks from start_id=${options.startId}; requested ${options.count}.`
    );
  }

  return selected;
}

function runNpm(args: string[]): void {
  const result = spawnSync("npm", args, {
    cwd: ROOT_DIR,
    stdio: "inherit",
    encoding: "utf8",
    env: { ...process.env },
  });
  if (result.status !== 0) {
    throw new Error(`npm ${args.join(" ")} failed with exit code ${result.status ?? 1}`);
  }
}

function main(): void {
  const options = parseOptions(process.argv.slice(2));
  const allTaskIds = loadAllTaskIds(CATALOG_PATH);
  const selectedIds = selectTrailIds(allTaskIds, options);
  const idsCsv = selectedIds.join(",");

  console.log("");
  console.log("Paperclip task trail publish");
  console.log(`  Selected task_ids (${selectedIds.length}): ${idsCsv}`);
  console.log(`  Mode: ${options.dryRun ? "dry-run" : "live"}`);
  console.log("");

  if (!options.skipMigrate) {
    const migrateArgs = ["run", "migrate:request-task-id", "--", "--task-ids", idsCsv];
    if (!options.dryRun) {
      migrateArgs.push("--write");
    } else {
      migrateArgs.push("--dry-run");
    }
    runNpm(migrateArgs);
  } else {
    console.log("Skipping migrate step (--skip-migrate).");
  }

  if (!options.skipPublish) {
    const publishArgs = ["run", "publish:tasks", "--", "--task-ids", idsCsv];
    if (options.dryRun) {
      publishArgs.push("--dry-run");
    }
    runNpm(publishArgs);
  } else {
    console.log("Skipping publish step (--skip-publish).");
  }
}

main();
