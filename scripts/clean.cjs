#!/usr/bin/env node

/**
 * Cleanup Script
 *
 * Cleans up local development environment:
 * 1. Stops solana-test-validator processes
 * 2. Removes test-ledger directory
 * 3. Optionally removes node_modules and build artifacts
 */

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const readline = require("readline");

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

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  header: (msg) =>
    console.log(`\n${colors.bold}${colors.cyan}${msg}${colors.reset}\n`),
  step: (num, msg) =>
    console.log(`\n${colors.bold}[${num}]${colors.reset} ${msg}`),
  cmd: (msg) => console.log(`${colors.dim}    $ ${msg}${colors.reset}`),
};

const rootDir = path.resolve(__dirname, "..");
const cliDir = path.join(rootDir, "cli");
const scriptsDir = path.join(rootDir, "scripts");
const testLedgerDir = path.join(rootDir, "test-ledger");

function promptUser(question, defaultYes = null) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      const trimmed = answer.toLowerCase().trim();
      if (trimmed === "" && defaultYes !== null) {
        resolve(defaultYes ? "y" : "n");
      } else {
        resolve(trimmed);
      }
    });
  });
}

async function main() {
  log.header("🧹 Paperclip Protocol — Cleanup");

  // Step 1: Stop validator processes
  log.step(1, "Stopping solana-test-validator processes...");
  execSync("pkill -f solana-test-validator 2>/dev/null || true", {
    stdio: "pipe",
  });
  log.success("Sent stop signal to any running validators");

  // Step 2: Remove test-ledger
  log.step(2, "Removing test-ledger...");
  if (fs.existsSync(testLedgerDir)) {
    const shouldRemove = await promptUser(
      `Remove ${testLedgerDir}? (Y/n): `,
      true
    );
    if (shouldRemove === "y" || shouldRemove === "yes") {
      fs.rmSync(testLedgerDir, { recursive: true, force: true });
      log.success("Test-ledger removed");
    } else {
      log.info("Skipped test-ledger removal");
    }
  } else {
    log.success("No test-ledger found");
  }

  // Step 3: Optional deep clean
  log.step(3, "Deep clean (optional)...");
  const deepClean = await promptUser(
    "Also remove node_modules and build artifacts? (y/N): ",
    false
  );

  if (deepClean === "y" || deepClean === "yes") {
    console.log("");

    const dirsToClean = [
      { name: "root node_modules", path: path.join(rootDir, "node_modules") },
      { name: "cli/node_modules", path: path.join(cliDir, "node_modules") },
      { name: "cli/dist", path: path.join(cliDir, "dist") },
      {
        name: "scripts/node_modules",
        path: path.join(scriptsDir, "node_modules"),
      },
    ];

    for (const dir of dirsToClean) {
      if (fs.existsSync(dir.path)) {
        log.info(`Removing ${dir.name}...`);
        fs.rmSync(dir.path, { recursive: true, force: true });
        log.success(`Removed ${dir.name}`);
      }
    }

    // Rust target is huge — ask separately
    const targetDir = path.join(rootDir, "target");
    if (fs.existsSync(targetDir)) {
      const removeTarget = await promptUser(
        "Also remove target/ (Rust build cache, ~500MB+)? (y/N): ",
        false
      );
      if (removeTarget === "y" || removeTarget === "yes") {
        log.info("Removing target/ (this may take a moment)...");
        fs.rmSync(targetDir, { recursive: true, force: true });
        log.success("Removed target/");
      }
    }
  }

  log.header("✅ Cleanup Complete!");
  console.log("To set up the environment again, run:");
  console.log(
    `  ${colors.cyan}npm run install:all${colors.reset}     # Install dependencies`
  );
  console.log(
    `  ${colors.cyan}npm run setup:local${colors.reset}     # Start local validator and deploy\n`
  );
}

main().catch((err) => {
  log.error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
