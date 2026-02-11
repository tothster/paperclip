/**
 * Persistent CLI settings — stored at ~/.paperclip/config.json
 *
 * Supports agent mode (JSON, no spinners — default) and
 * human mode (emoji, colors, spinners).
 */

import fs from "fs";
import path from "path";
import os from "os";

// =============================================================================
// TYPES
// =============================================================================

export type CliMode = "agent" | "human";
export type PaperclipNetwork = "devnet" | "localnet";

export interface PaperclipSettings {
  mode: CliMode;
  network: PaperclipNetwork;
  privyWalletId?: string;
  privyWalletAddress?: string;
}

// =============================================================================
// PATHS
// =============================================================================

const CONFIG_DIR = path.join(os.homedir(), ".paperclip");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

// =============================================================================
// DEFAULTS
// =============================================================================

const DEFAULTS: PaperclipSettings = {
  mode: "agent",
  network: "devnet",
};

// =============================================================================
// READ / WRITE
// =============================================================================

export function loadSettings(): PaperclipSettings {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
      return { ...DEFAULTS, ...raw };
    }
  } catch {
    // Corrupted file — return defaults
  }
  return { ...DEFAULTS };
}

export function saveSettings(settings: PaperclipSettings): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(settings, null, 2) + "\n");
}

export function getMode(): CliMode {
  return loadSettings().mode;
}

export function setMode(mode: CliMode): void {
  const settings = loadSettings();
  settings.mode = mode;
  saveSettings(settings);
}

export function getNetwork(): PaperclipNetwork {
  return loadSettings().network;
}

export function setNetwork(network: PaperclipNetwork): void {
  const settings = loadSettings();
  settings.network = network;
  saveSettings(settings);
}

export function configPath(): string {
  return CONFIG_FILE;
}
