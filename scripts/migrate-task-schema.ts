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
  quest_order?: number;
  category?: string;
  min_tier?: number;
  minTier?: number;
  required_task_id?: number | null;
  requiredTaskId?: number | null;
  [k: string]: unknown;
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function asTaskId(task: TaskLike): number {
  const raw = task.task_id ?? task.taskId;
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 0) {
    throw new Error(`Invalid task id: ${String(raw)}`);
  }
  return id;
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

function normalizeTask(task: TaskLike, onboardingPrereqById: Map<number, number | null>): void {
  const taskId = asTaskId(task);

  if (task.min_tier === undefined && task.minTier === undefined) {
    task.min_tier = 0;
  } else if (task.min_tier === undefined && task.minTier !== undefined) {
    task.min_tier = Number(task.minTier);
  }
  delete task.minTier;

  if (task.required_task_id === undefined && task.requiredTaskId !== undefined) {
    task.required_task_id = task.requiredTaskId;
  }

  if (task.required_task_id === undefined) {
    if (onboardingPrereqById.has(taskId)) {
      task.required_task_id = onboardingPrereqById.get(taskId) ?? null;
    } else {
      task.required_task_id = null;
    }
  }
  delete task.requiredTaskId;

  const maxClaims = Number(task.max_claims);
  if (Number.isInteger(maxClaims) && maxClaims > 65535) {
    task.max_claims = 65535;
  }
}

function buildOnboardingPrereqById(taskFiles: string[]): Map<number, number | null> {
  const onboarding = [] as Array<{ taskId: number; questOrder: number; source: string }>;

  for (const relFile of taskFiles) {
    const absFile = path.resolve(path.dirname(CATALOG_PATH), relFile);
    const parsed = readJson(absFile);
    const tasks = Array.isArray(parsed) ? parsed : [parsed];

    for (const raw of tasks) {
      const task = raw as TaskLike;
      if (task.category === "onboarding" && Number.isInteger(task.quest_order)) {
        onboarding.push({
          taskId: asTaskId(task),
          questOrder: Number(task.quest_order),
          source: relFile,
        });
      }
    }
  }

  onboarding.sort((a, b) => a.questOrder - b.questOrder);

  const map = new Map<number, number | null>();
  for (let i = 0; i < onboarding.length; i++) {
    const current = onboarding[i];
    const expected = i + 1;
    if (current.questOrder !== expected) {
      throw new Error(
        `Onboarding quest order mismatch at ${current.source}: expected ${expected}, got ${current.questOrder}`
      );
    }

    map.set(current.taskId, i === 0 ? null : onboarding[i - 1].taskId);
  }

  return map;
}

function main() {
  const files = collectFilesFromCatalog(CATALOG_PATH);
  const onboardingPrereqById = buildOnboardingPrereqById(files);

  let updatedFiles = 0;
  let updatedTasks = 0;

  for (const relFile of files) {
    const absFile = path.resolve(path.dirname(CATALOG_PATH), relFile);
    const parsed = readJson(absFile);
    const tasks = (Array.isArray(parsed) ? parsed : [parsed]) as TaskLike[];

    let fileChanged = false;
    for (const task of tasks) {
      const before = JSON.stringify(task);
      normalizeTask(task, onboardingPrereqById);
      const after = JSON.stringify(task);
      if (before !== after) {
        fileChanged = true;
        updatedTasks++;
      }
    }

    if (fileChanged) {
      writeJson(absFile, Array.isArray(parsed) ? tasks : tasks[0]);
      updatedFiles++;
      console.log(`updated ${relFile}`);
    }
  }

  console.log(`\nDone. Updated files: ${updatedFiles}, tasks normalized: ${updatedTasks}`);
}

main();
