import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { PublicKey } from "@solana/web3.js";
import { getNetwork, type PaperclipNetwork } from "./settings.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BAKED_CONFIG_PATH = path.resolve(__dirname, "..", "baked-config.json");

interface BakedConfig {
  PAPERCLIP_NETWORK?: string;
  PAPERCLIP_RPC_URL?: string;
  PAPERCLIP_PROGRAM_ID?: string;
  PAPERCLIP_WALLET?: string;
  PAPERCLIP_WALLET_TYPE?: string;
  STORACHA_GATEWAY_URL?: string;
  STORACHA_AGENT_KEY?: string;
  W3UP_SPACE_DID?: string;
  W3UP_SPACE_PROOF?: string;
  PRIVY_APP_ID?: string;
  PRIVY_APP_SECRET?: string;
}

function readBakedConfig(): BakedConfig {
  try {
    if (!fs.existsSync(BAKED_CONFIG_PATH)) {
      return {};
    }
    return JSON.parse(fs.readFileSync(BAKED_CONFIG_PATH, "utf8")) as BakedConfig;
  } catch {
    return {};
  }
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseNetwork(value: string | undefined): PaperclipNetwork | undefined {
  const normalized = value?.toLowerCase().trim();
  if (normalized === "devnet" || normalized === "localnet") {
    return normalized;
  }
  return undefined;
}

export type WalletType = "privy" | "local";

function parseWalletType(value: string | undefined): WalletType | undefined {
  const normalized = value?.toLowerCase().trim();
  if (normalized === "privy" || normalized === "local") {
    return normalized;
  }
  return undefined;
}

function networkFromArgv(argv: string[]): PaperclipNetwork | undefined {
  const longIdx = argv.indexOf("--network");
  if (longIdx !== -1) {
    return parseNetwork(argv[longIdx + 1]);
  }
  const shortIdx = argv.indexOf("-n");
  if (shortIdx !== -1) {
    return parseNetwork(argv[shortIdx + 1]);
  }
  return undefined;
}

const baked = readBakedConfig();

const DEVNET_RPC_URL = "https://api.devnet.solana.com";
const LOCALNET_RPC_URL = "http://127.0.0.1:8899";
const DEVNET_PROGRAM_ID = "Fehg9nbFCRnrZAuaW6tiqnegbHpHgizV9bvakhAWix6v";
const LOCALNET_PROGRAM_ID = "Fehg9nbFCRnrZAuaW6tiqnegbHpHgizV9bvakhAWix6v";

const bakedNetwork = parseNetwork(baked.PAPERCLIP_NETWORK);

export const NETWORK: PaperclipNetwork =
  networkFromArgv(process.argv) ||
  parseNetwork(process.env.PAPERCLIP_NETWORK) ||
  bakedNetwork ||
  getNetwork();

const NETWORK_RPC_URL = NETWORK === "localnet" ? LOCALNET_RPC_URL : DEVNET_RPC_URL;
const NETWORK_PROGRAM_ID =
  NETWORK === "localnet" ? LOCALNET_PROGRAM_ID : DEVNET_PROGRAM_ID;

export const RPC_URL =
  clean(process.env.PAPERCLIP_RPC_URL) || clean(baked.PAPERCLIP_RPC_URL) || NETWORK_RPC_URL;

export const PROGRAM_ID = new PublicKey(
  clean(process.env.PAPERCLIP_PROGRAM_ID) ||
    clean(baked.PAPERCLIP_PROGRAM_ID) ||
    NETWORK_PROGRAM_ID
);

export const WALLET_PATH =
  clean(process.env.PAPERCLIP_WALLET) ||
  clean(baked.PAPERCLIP_WALLET) ||
  path.join(os.homedir(), ".config", "solana", "id.json");

export const STORACHA_GATEWAY_URL =
  clean(process.env.STORACHA_GATEWAY_URL) ||
  clean(baked.STORACHA_GATEWAY_URL) ||
  "https://w3s.link/ipfs/";

export const W3UP_SPACE_DID =
  clean(process.env.W3UP_SPACE_DID) || clean(baked.W3UP_SPACE_DID) || "";

export const STORACHA_AGENT_KEY =
  clean(process.env.STORACHA_AGENT_KEY) || clean(baked.STORACHA_AGENT_KEY) || "";

export const W3UP_SPACE_PROOF =
  clean(process.env.W3UP_SPACE_PROOF) || clean(baked.W3UP_SPACE_PROOF) || "";

export const PRIVY_APP_ID =
  clean(process.env.PRIVY_APP_ID) || clean(baked.PRIVY_APP_ID) || "";

export const PRIVY_APP_SECRET =
  clean(process.env.PRIVY_APP_SECRET) || clean(baked.PRIVY_APP_SECRET) || "";

const configuredWalletType =
  parseWalletType(process.env.PAPERCLIP_WALLET_TYPE) ||
  parseWalletType(baked.PAPERCLIP_WALLET_TYPE);

export const WALLET_TYPE: WalletType =
  configuredWalletType || (PRIVY_APP_ID && PRIVY_APP_SECRET ? "privy" : "local");
