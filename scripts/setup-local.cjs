#!/usr/bin/env node

/**
 * Setup Local Environment Script
 *
 * Sets up local environment for CLI testing:
 * 1. Validates environment
 * 2. Syncs anchor keys
 * 3. Kills old validators
 * 4. Starts solana-test-validator
 * 5. Builds program
 * 6. Deploys program
 * 7. Runs Anchor tests (protocol state)
 * 8. Publishes a starter task subset to Storacha
 * 9. Syncs program ID to CLI config
 * 10. Rebuilds CLI
 */

const { execSync, spawn } = require("child_process");
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveTaskPublishArgs() {
  const ids = process.env.PAPERCLIP_SETUP_TASK_IDS?.trim();
  if (ids) {
    return `--task-ids ${ids}`;
  }

  const limitRaw = process.env.PAPERCLIP_SETUP_TASK_LIMIT?.trim();
  if (!limitRaw) {
    return "--limit 5";
  }

  if (limitRaw.toLowerCase() === "all") {
    return "";
  }

  const limit = Number(limitRaw);
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(
      `Invalid PAPERCLIP_SETUP_TASK_LIMIT="${limitRaw}". Use a positive integer or "all".`
    );
  }
  return `--limit ${limit}`;
}

async function waitForValidator(maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      execSync("solana cluster-version --url http://127.0.0.1:8899", {
        stdio: "pipe",
        encoding: "utf-8",
      });
      return true;
    } catch {
      await sleep(1000);
    }
  }
  return false;
}

async function main() {
  log.header("🚀 Paperclip Protocol — Local Setup");

  // Step 1: Check environment
  log.step(1, "Checking environment...");
  try {
    const { main: checkEnv } = require("./check-env.cjs");
    await checkEnv();
  } catch (error) {
    log.error(
      "Environment check failed. Please fix the issues above and try again."
    );
    process.exit(1);
  }

  // Step 2: Sync Anchor keys
  log.step(2, "Syncing Anchor keys...");
  log.cmd("anchor keys sync");
  try {
    execSync("anchor keys sync", { cwd: rootDir, stdio: "inherit" });
    log.success("Anchor keys synced");
  } catch (error) {
    log.warn(`Key sync failed: ${error.message}`);
    log.info("Continuing — keys may already be synced");
  }

  // Step 3: Kill existing validators
  log.step(3, "Stopping any running validators...");
  execSync("pkill -f solana-test-validator 2>/dev/null || true", {
    stdio: "pipe",
  });
  log.success("Sent stop signal to any running validators");

  // Clean old test-ledger
  if (fs.existsSync(testLedgerDir)) {
    const shouldClean = await promptUser(
      "Delete old test-ledger and start fresh? (Y/n): ",
      true
    );
    if (shouldClean === "y" || shouldClean === "yes") {
      fs.rmSync(testLedgerDir, { recursive: true, force: true });
      log.success("Old test-ledger removed");
    }
  }

  await sleep(2000); // Wait for validator to fully stop

  // Step 4: Start solana-test-validator
  log.step(4, "Starting solana-test-validator...");
  log.cmd("solana-test-validator --reset (detached)");

  const validator = spawn("solana-test-validator", ["--reset"], {
    cwd: rootDir,
    detached: true,
    stdio: "ignore",
  });
  validator.unref();

  log.info("Waiting for validator to be ready...");
  const ready = await waitForValidator(30);

  if (!ready) {
    log.error(
      "Validator failed to start within 30 seconds. Check logs and try again."
    );
    process.exit(1);
  }
  log.success("Validator is running at http://127.0.0.1:8899");

  // Step 5: Build program
  log.step(5, "Building program...");
  log.cmd("anchor build");
  try {
    execSync("anchor build", { cwd: rootDir, stdio: "inherit" });
    log.success("Program built");
  } catch (error) {
    log.error(`Build failed: ${error.message}`);
    process.exit(1);
  }

  // Step 6: Deploy program
  log.step(6, "Deploying program...");
  log.cmd("anchor deploy");
  try {
    execSync("anchor deploy", { cwd: rootDir, stdio: "inherit" });
    log.success("Program deployed");
  } catch (error) {
    log.error(`Deploy failed: ${error.message}`);
    process.exit(1);
  }

  // Step 7: Run Anchor tests (initializes protocol state)
  log.step(7, "Running Anchor tests (sets up protocol state)...");
  log.cmd("anchor test --skip-local-validator");
  try {
    execSync("anchor test --skip-local-validator", {
      cwd: rootDir,
      stdio: "inherit",
    });
    log.success("Protocol state initialized via Anchor tests");
  } catch (error) {
    log.error(`Tests failed: ${error.message}`);
    const proceed = await promptUser(
      "Continue despite test failures? (y/N): ",
      false
    );
    if (proceed !== "y" && proceed !== "yes") {
      process.exit(1);
    }
  }

  // Step 8: Publish starter tasks to Storacha
  log.step(8, "Publishing starter tasks to Storacha...");
  let publishArgs = "--limit 5";
  try {
    publishArgs = resolveTaskPublishArgs();
  } catch (error) {
    log.error(error.message);
    process.exit(1);
  }
  const publishCmd = `npx tsx scripts/publish-task.ts ${publishArgs}`.trim();
  log.info(
    publishArgs
      ? `Task seed selection: ${publishArgs}`
      : "Task seed selection: all catalog tasks"
  );
  log.cmd(publishCmd);
  try {
    execSync(`npx tsx publish-task.ts ${publishArgs}`.trim(), {
      cwd: scriptsDir,
      stdio: "inherit",
    });
    log.success("Task seed publish completed");
  } catch (error) {
    log.warn(`Task publishing failed: ${error.message}`);
    log.info("You can retry later with: npm run publish:tasks -- --limit 5");
  }

  // Step 9: Sync program ID from lib.rs to CLI config
  log.step(9, "Syncing program ID to CLI...");

  try {
    const libRsPath = path.join(
      rootDir,
      "programs",
      "paperclip-protocol",
      "src",
      "lib.rs"
    );
    const libRsContent = fs.readFileSync(libRsPath, "utf-8");
    const programIdMatch = libRsContent.match(
      /declare_id!\s*\(\s*"([A-Za-z0-9]+)"\s*\)/
    );

    if (programIdMatch) {
      const contractProgramId = programIdMatch[1];
      log.info(`Program ID from lib.rs: ${contractProgramId}`);

      const configPath = path.join(cliDir, "src", "config.ts");
      let configContent = fs.readFileSync(configPath, "utf-8");

      // Check if it needs updating
      const configMatch = configContent.match(
        /PAPERCLIP_PROGRAM_ID\s*\|\|\s*\n?\s*"([A-Za-z0-9]+)"/
      );

      if (configMatch && configMatch[1] !== contractProgramId) {
        log.info(
          `Updating CLI config: ${configMatch[1]} → ${contractProgramId}`
        );
        configContent = configContent.replace(
          configMatch[1],
          contractProgramId
        );
        fs.writeFileSync(configPath, configContent);
        log.success("CLI config.ts updated with program ID");
      } else {
        log.success("CLI program ID already matches contract");
      }
    }
  } catch (error) {
    log.warn(`Failed to sync program ID: ${error.message}`);
    log.info("You may need to manually update cli/src/config.ts");
  }

  // Step 10: Rebuild CLI
  log.step(10, "Rebuilding CLI...");
  log.cmd("cd cli && npm run build");
  try {
    execSync("npm run build", { cwd: cliDir, stdio: "inherit" });
    log.success("CLI rebuilt");
  } catch (error) {
    log.error(`CLI build failed: ${error.message}`);
  }

  // Done!
  log.header("✅ Local Environment Ready!");

  console.log(
    "The local validator is running. You can use the CLI:\n"
  );
  console.log(
    `  ${colors.cyan}pc tasks${colors.reset}           # List available tasks`
  );
  console.log(
    `  ${colors.cyan}pc tasks --json${colors.reset}    # Full task data (Storacha resolved)`
  );
  console.log(
    `  ${colors.cyan}pc init${colors.reset}            # Register as an agent`
  );
  console.log(
    `  ${colors.cyan}pc status${colors.reset}          # View agent balance`
  );
  console.log(
    `  ${colors.cyan}pc do <id> --proof '...'${colors.reset}  # Submit task proof\n`
  );

  console.log("When done, run:");
  console.log(
    `  ${colors.cyan}npm run clean${colors.reset}      # Stop validator and clean up\n`
  );

  console.log(
    `${colors.dim}Validator running at: http://127.0.0.1:8899${colors.reset}\n`
  );
}

main().catch((err) => {
  log.error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
