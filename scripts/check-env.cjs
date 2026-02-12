#!/usr/bin/env node

/**
 * Environment Validation Script
 *
 * Checks that all required dependencies are installed:
 * - Solana CLI (v2.0+)
 * - Anchor CLI (v0.31+)
 * - Node.js (v18+)
 * - Rust/Cargo
 */

const { execSync } = require("child_process");
const readline = require("readline");
const fs = require("fs");
const path = require("path");

// ANSI colors
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  header: (msg) =>
    console.log(`\n${colors.bold}${colors.cyan}${msg}${colors.reset}\n`),
};

// Version requirements (minimum versions)
const requirements = {
  node: {
    min: "18.0.0",
    command: "node --version",
    parse: (v) => v.replace("v", ""),
  },
  solana: {
    min: "2.0.0",
    command: "solana --version",
    parse: (v) => v.match(/(\d+\.\d+\.\d+)/)?.[1],
  },
  anchor: {
    min: "0.31.0",
    command: "anchor --version",
    parse: (v) => v.match(/(\d+\.\d+\.\d+)/)?.[1],
  },
  rust: {
    min: null,
    command: "rustc --version",
    parse: (v) => v.match(/(\d+\.\d+\.\d+)/)?.[1],
  },
  "solana-test-validator": {
    min: null,
    command: "solana-test-validator --version",
    parse: (v) => v.match(/(\d+\.\d+\.\d+)/)?.[1],
  },
};

const ROOT_ENV_PATH = path.resolve(__dirname, "..", ".env");

function parseDotEnv(raw) {
  const out = {};
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const noExport = trimmed.startsWith("export ")
      ? trimmed.slice(7).trim()
      : trimmed;
    const idx = noExport.indexOf("=");
    if (idx === -1) continue;

    const key = noExport.slice(0, idx).trim();
    if (!key) continue;
    let value = noExport.slice(idx + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function readRootEnvFile() {
  if (!fs.existsSync(ROOT_ENV_PATH)) {
    return {};
  }
  try {
    return parseDotEnv(fs.readFileSync(ROOT_ENV_PATH, "utf8"));
  } catch {
    return {};
  }
}

function clean(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function resolveEnv(source, key) {
  return clean(process.env[key] || source[key] || "");
}

function checkEnvironmentConfig() {
  const rootEnv = readRootEnvFile();
  const out = {
    errors: [],
    warnings: [],
    info: [],
  };

  if (!fs.existsSync(ROOT_ENV_PATH)) {
    out.warnings.push(
      `No .env file found at ${ROOT_ENV_PATH}. Build/runtime will rely only on current shell env and baked defaults.`
    );
  }

  const dataDid = resolveEnv(rootEnv, "W3UP_DATA_SPACE_DID");
  const dataProof = resolveEnv(rootEnv, "W3UP_DATA_SPACE_PROOF");
  const tasksDid = resolveEnv(rootEnv, "W3UP_TASKS_SPACE_DID");
  const tasksProof = resolveEnv(rootEnv, "W3UP_TASKS_SPACE_PROOF");
  const messagesDid = resolveEnv(rootEnv, "W3UP_MESSAGES_SPACE_DID");
  const messagesProof = resolveEnv(rootEnv, "W3UP_MESSAGES_SPACE_PROOF");

  if (!dataProof) {
    out.warnings.push(
      "Missing Storacha proof for data uploads. Set W3UP_DATA_SPACE_PROOF."
    );
  }

  if (!dataDid) {
    out.warnings.push(
      "No DID configured for data uploads. Set W3UP_DATA_SPACE_DID."
    );
  }

  if (!tasksProof) {
    out.warnings.push(
      "W3UP_TASKS_SPACE_PROOF is not set. Task publishing requires scoped tasks proof."
    );
  }
  if (!tasksDid) {
    out.warnings.push(
      "W3UP_TASKS_SPACE_DID is not set. Task publishing requires scoped tasks DID."
    );
  }
  if (!messagesProof) {
    out.info.push(
      "W3UP_MESSAGES_SPACE_PROOF is not set (ok for now; reserved for future messaging features)."
    );
  }
  if (!messagesDid) {
    out.info.push(
      "W3UP_MESSAGES_SPACE_DID is not set (ok for now; reserved for future messaging features)."
    );
  }

  const privyAppId = resolveEnv(rootEnv, "PRIVY_APP_ID");
  const privyAppSecret = resolveEnv(rootEnv, "PRIVY_APP_SECRET");
  if ((privyAppId && !privyAppSecret) || (!privyAppId && privyAppSecret)) {
    out.warnings.push(
      "Privy config is partial. Set both PRIVY_APP_ID and PRIVY_APP_SECRET, or clear both."
    );
  }

  return out;
}

function compareVersions(v1, v2) {
  const parts1 = v1.split(".").map(Number);
  const parts2 = v2.split(".").map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

function checkTool(name, config) {
  try {
    const output = execSync(config.command, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    const version = config.parse(output);

    if (!version) {
      return { installed: true, version: "unknown", valid: true };
    }

    if (config.min) {
      const valid = compareVersions(version, config.min) >= 0;
      return { installed: true, version, valid, required: config.min };
    }

    return { installed: true, version, valid: true };
  } catch (e) {
    return {
      installed: false,
      version: null,
      valid: false,
      required: config.min,
    };
  }
}

function promptUser(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().trim());
    });
  });
}

async function main() {
  log.header("🔍 Paperclip Protocol — Environment Check");

  const results = {};
  let hasErrors = false;
  let hasWarnings = false;

  console.log("Checking required dependencies...\n");

  for (const [name, config] of Object.entries(requirements)) {
    const result = checkTool(name, config);
    results[name] = result;

    const displayName = name
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    if (!result.installed) {
      log.error(
        `${displayName}: Not installed${result.required ? ` (requires v${result.required}+)` : ""}`
      );
      hasErrors = true;
    } else if (!result.valid) {
      log.warn(
        `${displayName}: v${result.version} (requires v${result.required}+)`
      );
      hasWarnings = true;
    } else {
      log.success(
        `${displayName}: v${result.version}${result.required ? ` (requires v${result.required}+)` : ""}`
      );
    }
  }

  console.log("");

  const envCheck = checkEnvironmentConfig();
  if (envCheck.errors.length > 0 || envCheck.warnings.length > 0 || envCheck.info.length > 0) {
    log.header("🧩 Environment Variables");
  }
  for (const line of envCheck.errors) {
    log.error(line);
  }
  for (const line of envCheck.warnings) {
    log.warn(line);
  }
  for (const line of envCheck.info) {
    log.info(line);
  }

  if (envCheck.errors.length > 0) {
    hasErrors = true;
  }
  if (envCheck.warnings.length > 0) {
    hasWarnings = true;
  }

  if (
    envCheck.errors.length > 0 ||
    envCheck.warnings.length > 0 ||
    envCheck.info.length > 0
  ) {
    console.log("");
  }

  if (hasErrors) {
    log.error("Some required dependencies are missing!\n");
    console.log("Installation guides:");
    console.log(
      "  • Solana: https://docs.solana.com/cli/install-solana-cli-tools"
    );
    console.log("  • Anchor: https://www.anchor-lang.com/docs/installation");
    console.log("  • Node.js: https://nodejs.org/");
    console.log("  • Rust: https://rustup.rs/\n");

    const retry = await promptUser(
      "Would you like to retry after fixing? (y/n): "
    );
    if (retry === "y" || retry === "yes") {
      console.log("");
      return main();
    }

    process.exit(1);
  }

  if (hasWarnings) {
    log.warn("Some dependencies have version warnings, but may still work.\n");
    const proceed = await promptUser("Proceed anyway? (y/n): ");
    if (proceed !== "y" && proceed !== "yes") {
      process.exit(1);
    }
  }

  log.success("All environment checks passed!\n");
  return true;
}

// Allow importing as module or running directly
if (require.main === module) {
  main().catch((err) => {
    log.error(`Unexpected error: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { main, checkTool, requirements, checkEnvironmentConfig };
