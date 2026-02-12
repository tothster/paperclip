#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const CLI_DIR = path.resolve(__dirname, "..");
const ROOT_ENV_PATH = path.resolve(CLI_DIR, "..", ".env");
const ROOT_ENV_EXAMPLE_PATH = path.resolve(CLI_DIR, "..", ".env.example");
const CLI_ENV_PATH = path.resolve(CLI_DIR, ".env");
const OUTPUT_PATH = path.resolve(CLI_DIR, "baked-config.json");

function parseDotEnv(raw) {
  const out = {};
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const withoutExport = trimmed.startsWith("export ")
      ? trimmed.slice(7).trim()
      : trimmed;

    const eqIdx = withoutExport.indexOf("=");
    if (eqIdx === -1) {
      continue;
    }

    const key = withoutExport.slice(0, eqIdx).trim();
    if (!key) {
      continue;
    }

    let value = withoutExport.slice(eqIdx + 1).trim();

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

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const raw = fs.readFileSync(filePath, "utf8");
  return parseDotEnv(raw);
}

function optional(value) {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value).trim();
}

function pick(source, defaults, key) {
  const fromSource = optional(source[key]);
  if (fromSource) {
    return fromSource;
  }
  return optional(defaults[key]);
}

function main() {
  const rootEnv = readEnvFile(ROOT_ENV_PATH);
  const rootEnvExample = readEnvFile(ROOT_ENV_EXAMPLE_PATH);
  const cliEnv = readEnvFile(CLI_ENV_PATH);

  // Precedence: process.env > cli/.env > repo/.env > repo/.env.example
  const source = {
    ...rootEnv,
    ...cliEnv,
    ...process.env,
  };

  const baked = {
    PAPERCLIP_NETWORK: pick(source, rootEnvExample, "PAPERCLIP_NETWORK"),
    PAPERCLIP_RPC_URL: pick(source, rootEnvExample, "PAPERCLIP_RPC_URL"),
    PAPERCLIP_RPC_FALLBACK_URL: pick(
      source,
      rootEnvExample,
      "PAPERCLIP_RPC_FALLBACK_URL"
    ),
    PAPERCLIP_PROGRAM_ID: pick(source, rootEnvExample, "PAPERCLIP_PROGRAM_ID"),
    PAPERCLIP_WALLET: pick(source, rootEnvExample, "PAPERCLIP_WALLET"),
    PAPERCLIP_WALLET_TYPE: pick(source, rootEnvExample, "PAPERCLIP_WALLET_TYPE"),
    STORACHA_GATEWAY_URL: pick(source, rootEnvExample, "STORACHA_GATEWAY_URL"),
    STORACHA_AGENT_KEY: pick(source, rootEnvExample, "STORACHA_AGENT_KEY"),
    W3UP_DATA_SPACE_DID: pick(source, rootEnvExample, "W3UP_DATA_SPACE_DID"),
    W3UP_DATA_SPACE_PROOF: pick(source, rootEnvExample, "W3UP_DATA_SPACE_PROOF"),
    W3UP_TASKS_SPACE_DID: pick(source, rootEnvExample, "W3UP_TASKS_SPACE_DID"),
    W3UP_TASKS_SPACE_PROOF: pick(source, rootEnvExample, "W3UP_TASKS_SPACE_PROOF"),
    W3UP_MESSAGES_SPACE_DID: pick(source, rootEnvExample, "W3UP_MESSAGES_SPACE_DID"),
    W3UP_MESSAGES_SPACE_PROOF: pick(source, rootEnvExample, "W3UP_MESSAGES_SPACE_PROOF"),
    PRIVY_APP_ID: pick(source, rootEnvExample, "PRIVY_APP_ID"),
    PRIVY_APP_SECRET: pick(source, rootEnvExample, "PRIVY_APP_SECRET"),
  };

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(baked, null, 2)}\n`);
  console.log(`[bake-config] Wrote ${OUTPUT_PATH}`);
}

main();
