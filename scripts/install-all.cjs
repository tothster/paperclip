#!/usr/bin/env node

/**
 * Install All Dependencies Script
 *
 * 1. Validates environment
 * 2. Installs root dependencies (Anchor tests)
 * 3. Installs CLI dependencies
 * 4. Installs scripts dependencies
 * 5. Builds CLI
 * 6. Links CLI globally (pc command)
 */

const { execSync } = require("child_process");
const path = require("path");
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

function runCommand(command, cwd, options = {}) {
  const { silent = false, allowFail = false } = options;

  log.cmd(`${command} (in ${path.basename(cwd)})`);

  try {
    const output = execSync(command, {
      cwd,
      encoding: "utf-8",
      stdio: silent ? "pipe" : "inherit",
    });
    return { success: true, output };
  } catch (error) {
    if (allowFail) {
      return { success: false, error };
    }
    throw error;
  }
}

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
  log.header("📦 Paperclip Protocol — Install All Dependencies");

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

  // Step 2: Install root dependencies
  log.step(2, "Installing root dependencies (Anchor tests)...");
  try {
    runCommand("npm install", rootDir);
    log.success("Root dependencies installed");
  } catch (error) {
    log.error(`Failed: ${error.message}`);
    process.exit(1);
  }

  // Step 3: Install CLI dependencies
  log.step(3, "Installing CLI dependencies...");
  try {
    runCommand("npm install", cliDir);
    log.success("CLI dependencies installed");
  } catch (error) {
    log.error(`Failed: ${error.message}`);
    process.exit(1);
  }

  // Step 4: Install scripts dependencies
  log.step(4, "Installing scripts dependencies...");
  try {
    runCommand("npm install", scriptsDir);
    log.success("Scripts dependencies installed");
  } catch (error) {
    log.error(`Failed: ${error.message}`);
    process.exit(1);
  }

  // Step 5: Build CLI
  log.step(5, "Building CLI...");
  try {
    runCommand("npm run build", cliDir);
    log.success("CLI built successfully");
  } catch (error) {
    log.error(`Failed to build CLI: ${error.message}`);
    process.exit(1);
  }

  // Step 6: Link CLI globally
  log.step(6, "Linking CLI globally (npm link --force)...");
  console.log(
    `${colors.dim}    This makes the 'pc' command available in your terminal${colors.reset}`
  );

  try {
    runCommand("npm link --force", cliDir);
    log.success("CLI linked globally");

    const result = runCommand("which pc", rootDir, {
      silent: true,
      allowFail: true,
    });
    if (result.success) {
      log.success(`pc CLI available at: ${result.output.trim()}`);
    }
  } catch (error) {
    log.warn("npm link --force failed — you may need to fix npm permissions");
    const proceed = await promptUser(
      "Continue without global link? (Y/n): ",
      true
    );
    if (proceed !== "y" && proceed !== "yes") {
      process.exit(1);
    }
  }

  // Summary
  log.header("✅ Installation Complete!");
  console.log("Next steps:");
  console.log(
    `  1. Run ${colors.cyan}npm run setup:local${colors.reset} to start local validator and deploy`
  );
  console.log(
    `  2. Use ${colors.cyan}pc${colors.reset} CLI commands (tasks, init, status, etc.)`
  );
  console.log(
    `  3. Run ${colors.cyan}npm run clean${colors.reset} when done to stop validators\n`
  );
}

main().catch((err) => {
  log.error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
