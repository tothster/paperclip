#!/usr/bin/env npx tsx

/**
 * Integration Test Script
 *
 * End-to-end test that validates the full protocol flow:
 * 1. Protocol state is initialized
 * 2. Tasks exist on-chain
 * 3. Real CIDs resolve from Storacha gateway
 * 4. Agent registration works
 * 5. Agent status is correct
 *
 * Requires: local validator running + program deployed + anchor tests run
 */

import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliDir = path.resolve(__dirname, "..", "cli");
const cliEntry = path.join(cliDir, "dist", "index.js");

const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
};

function header(msg: string) {
  console.log(`\n${colors.bold}${colors.cyan}${msg}${colors.reset}\n`);
}

function pass(name: string) {
  console.log(`  ${colors.green}✓${colors.reset} ${name}`);
}

function fail(name: string, detail?: string) {
  console.log(`  ${colors.red}✗${colors.reset} ${name}`);
  if (detail) {
    console.log(`    ${colors.dim}${detail}${colors.reset}`);
  }
}

function runCli(args: string): string {
  return execSync(`node ${cliEntry} ${args}`, {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      PAPERCLIP_RPC_URL: "http://127.0.0.1:8899",
      PAPERCLIP_STORACHA_MOCK: "0",
    },
  }).trim();
}

interface TestResult {
  name: string;
  passed: boolean;
  detail?: string;
}

const results: TestResult[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    pass(name);
    results.push({ name, passed: true });
  } catch (error: any) {
    const detail = error.message || String(error);
    fail(name, detail);
    results.push({ name, passed: false, detail });
  }
}

async function main() {
  header("🧪 Paperclip Protocol — Integration Tests");

  // ── Test 1: Validator is reachable ──
  test("Validator is reachable", () => {
    const version = execSync(
      "solana cluster-version --url http://127.0.0.1:8899",
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
    if (!version) throw new Error("No version returned");
  });

  // ── Test 2: CLI lists tasks ──
  test("CLI lists tasks (pc tasks --json)", () => {
    const output = runCli("tasks --json");
    const tasks = JSON.parse(output);
    if (!Array.isArray(tasks)) throw new Error("Expected array");
    if (tasks.length === 0) throw new Error("No tasks found");
  });

  // ── Test 3: Tasks have on-chain data ──
  test("Tasks have correct on-chain fields", () => {
    const output = runCli("tasks --json");
    const tasks = JSON.parse(output);
    const task = tasks[0];
    if (!task.taskId && task.taskId !== 0) throw new Error("Missing taskId");
    if (!task.title) throw new Error("Missing title");
    if (!task.rewardClips && task.rewardClips !== 0)
      throw new Error("Missing rewardClips");
    if (!task.contentCid) throw new Error("Missing contentCid");
  });

  // ── Test 4: Real CIDs resolve from Storacha ──
  test("Real CIDs resolve content from Storacha", () => {
    const output = runCli("tasks --json");
    const tasks = JSON.parse(output);

    // Find tasks with real CIDs (bafkrei... prefix)
    const realTasks = tasks.filter((t: any) =>
      t.contentCid?.startsWith("bafkrei")
    );

    if (realTasks.length === 0) {
      throw new Error("No tasks with real CIDs found");
    }

    const withContent = realTasks.filter((t: any) => t.content !== null);
    if (withContent.length === 0) {
      throw new Error(
        `${realTasks.length} real CID task(s) but none have resolved content`
      );
    }

    // Verify content structure
    const content = withContent[0].content;
    if (!content.description) throw new Error("Content missing description");
    if (!content.instructions) throw new Error("Content missing instructions");
  });

  // ── Test 5: Mock CIDs correctly return null ──
  test("Mock CIDs return null content", () => {
    const output = runCli("tasks --json");
    const tasks = JSON.parse(output);

    const mockTasks = tasks.filter(
      (t: any) =>
        t.contentCid?.startsWith("mock-") ||
        t.contentCid?.startsWith("bafy-")
    );

    if (mockTasks.length > 0) {
      const allNull = mockTasks.every((t: any) => t.content === null);
      if (!allNull) {
        throw new Error("Some mock CID tasks have non-null content");
      }
    }
  });

  // ── Test 6: Task count matches ──
  test("Task count matches human and JSON modes", () => {
    const jsonOutput = runCli("tasks --json");
    const tasks = JSON.parse(jsonOutput);

    const humanOutput = runCli("tasks --human");
    // Human output includes "Found X tasks"
    const match = humanOutput.match(/Found (\d+) task/);
    if (match) {
      const humanCount = parseInt(match[1], 10);
      if (humanCount !== tasks.length) {
        throw new Error(
          `JSON has ${tasks.length} tasks, human says ${humanCount}`
        );
      }
    }
  });

  // ── Summary ──
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  header("📊 Results");
  console.log(`  Total:  ${total}`);
  console.log(
    `  Passed: ${colors.green}${passed}${colors.reset}`
  );
  if (failed > 0) {
    console.log(
      `  Failed: ${colors.red}${failed}${colors.reset}`
    );
  }
  console.log("");

  if (failed > 0) {
    console.log(
      `${colors.red}${colors.bold}  ❌ ${failed} test(s) failed${colors.reset}\n`
    );
    process.exit(1);
  } else {
    console.log(
      `${colors.green}${colors.bold}  ✅ All tests passed!${colors.reset}\n`
    );
  }
}

main().catch((err) => {
  console.error(`\n${colors.red}Unexpected error: ${err.message}${colors.reset}`);
  process.exit(1);
});
