/**
 * Privy EVM Integration
 *
 * Provides server-side Ethereum wallet management and gas-sponsored
 * transaction sending via Privy's REST API.
 *
 * Agents never touch raw private keys — signing happens on Privy's servers.
 * Gas fees are sponsored by Privy, so agents can transact without holding
 * native tokens (MON, ETH, etc.).
 *
 * This module is only used when WALLET_TYPE === "privy" and chain === "evm".
 */

import { authHeaders, privyFetch } from "./privy.js";
import { loadSettings, saveSettings } from "./settings.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PrivyEvmWalletInfo {
  id: string;
  address: string;
}

export interface EvmTransactionRequest {
  to: string;
  data: string;
  value?: string; // hex-encoded wei amount, optional
}

// ---------------------------------------------------------------------------
// Wallet provisioning
// ---------------------------------------------------------------------------

/**
 * Create a new Ethereum server wallet via Privy.
 * Called once during `pc init` for EVM chains.
 */
export async function createPrivyEvmWallet(): Promise<PrivyEvmWalletInfo> {
  const data = await privyFetch("/wallets", {
    method: "POST",
    body: JSON.stringify({ chain_type: "ethereum" }),
  });

  return { id: data.id, address: data.address };
}

/**
 * Get an existing EVM wallet's info from Privy.
 */
export async function getPrivyEvmWalletInfo(
  walletId: string
): Promise<PrivyEvmWalletInfo> {
  const data = await privyFetch(`/wallets/${walletId}`);
  return { id: data.id, address: data.address };
}

// ---------------------------------------------------------------------------
// Sponsored transaction sending
// ---------------------------------------------------------------------------

/**
 * Send a gas-sponsored EVM transaction via Privy.
 *
 * Uses `eth_sendTransaction` with `sponsor: true` — Privy pays gas.
 * Returns the transaction hash.
 *
 * @param walletId   Privy wallet ID
 * @param chainId    EVM chain ID (e.g. 10143 for Monad testnet)
 * @param tx         Transaction parameters (to, data, value?)
 */
export async function sendSponsoredEvmTransaction(
  walletId: string,
  chainId: number,
  tx: EvmTransactionRequest
): Promise<string> {
  const caip2 = `eip155:${chainId}`;

  const transaction: Record<string, string> = {
    to: tx.to,
    data: tx.data,
  };
  if (tx.value) {
    transaction.value = tx.value;
  }

  const data = await privyFetch(`/wallets/${walletId}/rpc`, {
    method: "POST",
    body: JSON.stringify({
      method: "eth_sendTransaction",
      caip2,
      sponsor: true,
      params: { transaction },
    }),
  });

  const hash =
    data?.data?.hash ||
    data?.hash ||
    data?.data?.transaction_hash;

  if (typeof hash !== "string" || hash.length === 0) {
    throw new Error(
      `Invalid Privy eth_sendTransaction response: ${JSON.stringify(data)}`
    );
  }

  return hash;
}

// ---------------------------------------------------------------------------
// Provision + persist
// ---------------------------------------------------------------------------

/**
 * Provision a new EVM wallet and save to settings.
 * Called during `pc init` when using Privy mode on an EVM chain.
 * Returns the wallet address.
 */
export async function provisionPrivyEvmWallet(): Promise<PrivyEvmWalletInfo> {
  const settings = loadSettings();

  // Already provisioned?
  if (settings.privyEvmWalletId && settings.privyEvmWalletAddress) {
    return {
      id: settings.privyEvmWalletId,
      address: settings.privyEvmWalletAddress,
    };
  }

  // Create new wallet
  const info = await createPrivyEvmWallet();

  // Persist
  settings.privyEvmWalletId = info.id;
  settings.privyEvmWalletAddress = info.address;
  saveSettings(settings);

  return info;
}

/**
 * Get existing EVM Privy wallet info from settings.
 * Throws if no wallet has been provisioned yet.
 */
export function getPersistedEvmWallet(): PrivyEvmWalletInfo {
  const settings = loadSettings();
  if (!settings.privyEvmWalletId || !settings.privyEvmWalletAddress) {
    throw new Error("No Privy EVM wallet found. Run `pc init` to create one.");
  }
  return {
    id: settings.privyEvmWalletId,
    address: settings.privyEvmWalletAddress,
  };
}
