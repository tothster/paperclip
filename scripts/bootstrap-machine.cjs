#!/usr/bin/env node

/**
 * Machine Bootstrap Check
 *
 * Verifies a new machine has everything required to build and run the Paperclip CLI.
 * This script does not mutate the repo; it validates prerequisites and prints
 * exact remediation commands.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { checkTool, requirements, checkEnvironmentConfig } = require("./check-env.cjs");

const ROOT_DIR = path.resolve(__dirname, "..");
const CLI_DIR = path.resolve(ROOT_DIR, "cli");
const SCRIPTS_DIR = path.resolve(ROOT_DIR, "scripts");

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
  header: (msg) =>
    console.log(`\n${colors.bold}${colors.cyan}${msg}${colors.reset}\n`),
  ok: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  err: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  cmd: (msg) => console.log(`${colors.dim}    $ ${msg}${colors.reset}`),
};

function commandExists(command) {
  try {
    execSync(`command -v ${command}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function checkDependencies() {
  const failures = [];
  const warnings = [];

  for (const [name, config] of Object.entries(requirements)) {
    const result = checkTool(name, config);
    const displayName = name
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    if (!result.installed) {
      failures.push(`${displayName} is not installed`);
      continue;
    }

    if (!result.valid) {
      warnings.push(
        `${displayName} v${result.version} is below recommended v${result.required}+`
      );
      continue;
    }

    log.ok(`${displayName}: v${result.version}`);
  }

  if (!commandExists("npm")) {
    failures.push("npm is not installed");
  } else {
    log.ok("NPM: installed");
  }

  return { failures, warnings };
}

function checkWorkspace() {
  const failures = [];
  const warnings = [];

  const requiredFiles = [
    path.join(ROOT_DIR, "package.json"),
    path.join(CLI_DIR, "package.json"),
    path.join(ROOT_DIR, "Anchor.toml"),
    path.join(ROOT_DIR, "tasks", "catalog.json"),
  ];

  for (const file of requiredFiles) {
    if (!fs.existsSync(file)) {
      failures.push(`Missing required file: ${path.relative(ROOT_DIR, file)}`);
    }
  }

  if (!fs.existsSync(path.join(ROOT_DIR, ".env"))) {
    warnings.push(
      "No .env found at repo root. Use .env.example as a base before building packaged defaults."
    );
  } else {
    log.ok(".env file found");
  }

  const localWallet = process.env.PAPERCLIP_WALLET || path.join(require("os").homedir(), ".config", "solana", "id.json");
  if (!fs.existsSync(localWallet)) {
    warnings.push(
      `Wallet file not found at ${localWallet}. Local wallet mode may fail until a keypair exists.`
    );
  } else {
    log.ok(`Wallet file found: ${localWallet}`);
  }

  return { failures, warnings };
}

function checkNodeModules() {
  const warnings = [];

  const moduleDirs = [
    path.join(ROOT_DIR, "node_modules"),
    path.join(CLI_DIR, "node_modules"),
    path.join(SCRIPTS_DIR, "node_modules"),
  ];

  for (const dir of moduleDirs) {
    if (!fs.existsSync(dir)) {
      warnings.push(`Dependencies missing in ${path.relative(ROOT_DIR, dir)}`);
    } else {
      log.ok(`${path.relative(ROOT_DIR, dir)} present`);
    }
  }

  return warnings;
}

function printRemediation() {
  console.log("");
  log.info("Suggested remediation commands:");
  log.cmd("npm run install:all");
  log.cmd("cp .env.example .env");
  log.cmd("npm run check:env");
  log.cmd("npm run build:cli");
}

function main() {
  log.header("🧰 Paperclip — Machine Bootstrap Check");

  log.info("Checking toolchain...");
  const dep = checkDependencies();
  console.log("");

  log.info("Checking workspace prerequisites...");
  const workspace = checkWorkspace();
  console.log("");

  log.info("Checking environment config...");
  const envCheck = checkEnvironmentConfig();
  for (const msg of envCheck.info) log.info(msg);
  for (const msg of envCheck.warnings) log.warn(msg);
  for (const msg of envCheck.errors) log.err(msg);
  console.log("");

  log.info("Checking dependency installation status...");
  const moduleWarnings = checkNodeModules();
  for (const msg of moduleWarnings) log.warn(msg);

  const failures = [...dep.failures, ...workspace.failures, ...envCheck.errors];
  const warnings = [
    ...dep.warnings,
    ...workspace.warnings,
    ...envCheck.warnings,
    ...moduleWarnings,
  ];

  for (const msg of dep.warnings) log.warn(msg);
  for (const msg of workspace.warnings) log.warn(msg);

  console.log("");
  log.header("📊 Bootstrap Result");
  if (failures.length === 0) {
    log.ok("Hard prerequisites: PASS");
  } else {
    log.err(`Hard prerequisites: FAIL (${failures.length} issue(s))`);
    for (const issue of failures) {
      log.err(issue);
    }
  }

  if (warnings.length === 0) {
    log.ok("Warnings: none");
  } else {
    log.warn(`Warnings: ${warnings.length}`);
  }

  printRemediation();

  if (failures.length > 0) {
    process.exit(1);
  }
}

main();
