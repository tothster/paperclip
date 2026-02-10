/**
 * Privy Server Wallet Integration
 *
 * Provides server-side Solana wallet signing via Privy's REST API.
 * Agents never touch raw keypairs — signing happens on Privy's servers
 * with policy controls set by the protocol team.
 *
 * Credentials are baked into config.ts at build time.
 * This module is only used when WALLET_TYPE === "privy".
 */

import * as anchor from "@coral-xyz/anchor";
import {
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { PRIVY_APP_ID, PRIVY_APP_SECRET } from "./config.js";
import { loadSettings, saveSettings, loadSettings as getSettings } from "./settings.js";

const PRIVY_API_BASE = "https://api.privy.io/v1";

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function authHeaders(): Record<string, string> {
  const encoded = Buffer.from(`${PRIVY_APP_ID}:${PRIVY_APP_SECRET}`).toString(
    "base64"
  );
  return {
    Authorization: `Basic ${encoded}`,
    "privy-app-id": PRIVY_APP_ID,
    "Content-Type": "application/json",
  };
}

async function privyFetch(
  path: string,
  init: RequestInit = {}
): Promise<any> {
  const url = `${PRIVY_API_BASE}${path}`;
  const headers = { ...authHeaders(), ...(init.headers as Record<string, string> || {}) };
  const res = await fetch(url, { ...init, headers });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Privy API error ${res.status} on ${init.method || "GET"} ${path}: ${body}`
    );
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Wallet provisioning — called once during `pc init`
// ---------------------------------------------------------------------------

export interface PrivyWalletInfo {
  id: string;
  address: string;
}

/**
 * Create a new Solana server wallet via Privy.
 * Called once during `pc init` — wallet ID is saved to ~/.paperclip/config.json.
 */
export async function createPrivyWallet(): Promise<PrivyWalletInfo> {
  const data = await privyFetch("/wallets", {
    method: "POST",
    body: JSON.stringify({ chain_type: "solana" }),
  });

  return { id: data.id, address: data.address };
}

/**
 * Get an existing wallet's info from Privy.
 */
export async function getPrivyWalletInfo(walletId: string): Promise<PrivyWalletInfo> {
  const data = await privyFetch(`/wallets/${walletId}`);
  return { id: data.id, address: data.address };
}

// ---------------------------------------------------------------------------
// PrivyWallet — Anchor Wallet interface
// ---------------------------------------------------------------------------

/**
 * Anchor-compatible Wallet that signs transactions via Privy's REST API.
 *
 * Duck-types the Wallet interface Anchor needs:
 *   - publicKey: PublicKey
 *   - signTransaction(tx): Promise<Transaction>
 *   - signAllTransactions(txs): Promise<Transaction[]>
 */
export class PrivyWallet {
  public publicKey: PublicKey;
  private walletId: string;

  constructor(walletId: string, publicKey: PublicKey) {
    this.walletId = walletId;
    this.publicKey = publicKey;
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(
    tx: T
  ): Promise<T> {
    const serialized = Buffer.from(
      tx.serialize({ requireAllSignatures: false, verifySignatures: false })
    ).toString("base64");

    const data = await privyFetch(`/wallets/${this.walletId}/rpc`, {
      method: "POST",
      body: JSON.stringify({
        method: "signTransaction",
        params: {
          transaction: serialized,
          encoding: "base64",
        },
      }),
    });

    const signedBytes = Buffer.from(
      data.data?.signed_transaction || data.data?.signature || "",
      "base64"
    );

    if (tx instanceof VersionedTransaction) {
      return VersionedTransaction.deserialize(signedBytes) as T;
    }
    return Transaction.from(signedBytes) as T;
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(
    txs: T[]
  ): Promise<T[]> {
    // Sign sequentially — Privy doesn't have a batch sign endpoint
    return Promise.all(txs.map((tx) => this.signTransaction(tx)));
  }
}

// ---------------------------------------------------------------------------
// Cached instance — getPrivyWalletInstance()
// ---------------------------------------------------------------------------

let _cachedWallet: PrivyWallet | null = null;

/**
 * Get or create the PrivyWallet instance.
 * Reads wallet ID from persisted settings (~/.paperclip/config.json).
 * Throws if no wallet has been provisioned yet (agent must run `pc init` first).
 */
export async function getPrivyWalletInstance(): Promise<PrivyWallet> {
  if (_cachedWallet) return _cachedWallet;

  const settings = loadSettings();
  const walletId = settings.privyWalletId;
  const walletAddress = settings.privyWalletAddress;

  if (!walletId || !walletAddress) {
    throw new Error(
      "No Privy wallet found. Run `pc init` to create one."
    );
  }

  _cachedWallet = new PrivyWallet(walletId, new PublicKey(walletAddress));
  return _cachedWallet;
}

/**
 * Provision a new wallet and save to settings.
 * Called during `pc init` when using Privy mode.
 */
export async function provisionPrivyWallet(): Promise<PrivyWallet> {
  const settings = loadSettings();

  // Already provisioned?
  if (settings.privyWalletId && settings.privyWalletAddress) {
    _cachedWallet = new PrivyWallet(
      settings.privyWalletId,
      new PublicKey(settings.privyWalletAddress)
    );
    return _cachedWallet;
  }

  // Create new wallet
  const info = await createPrivyWallet();

  // Persist
  settings.privyWalletId = info.id;
  settings.privyWalletAddress = info.address;
  saveSettings(settings);

  _cachedWallet = new PrivyWallet(info.id, new PublicKey(info.address));
  return _cachedWallet;
}
