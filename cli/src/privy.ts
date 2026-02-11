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
  type ConfirmOptions,
  type Signer,
  type TransactionSignature,
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { NETWORK, PRIVY_APP_ID, PRIVY_APP_SECRET } from "./config.js";
import { loadSettings, saveSettings } from "./settings.js";

const PRIVY_API_BASE = "https://api.privy.io/v1";
const DUMMY_RECENT_BLOCKHASH = "11111111111111111111111111111111";

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

async function privyFetch(path: string, init: RequestInit = {}): Promise<any> {
  const url = `${PRIVY_API_BASE}${path}`;
  const headers = {
    ...authHeaders(),
    ...((init.headers as Record<string, string>) || {}),
  };
  const res = await fetch(url, { ...init, headers });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Privy API error ${res.status} on ${
        init.method || "GET"
      } ${path}: ${body}`
    );
  }

  return res.json();
}

function networkToCaip2(network: string): string {
  if (network === "devnet") {
    return "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
  }
  if (network === "testnet") {
    return "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z";
  }
  if (network === "mainnet") {
    return "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
  }
  throw new Error(
    `Privy gas sponsorship is not supported for network "${network}". Use devnet/mainnet.`
  );
}

function extractTxHash(response: any): string {
  const hash =
    response?.data?.hash ||
    response?.data?.signature ||
    response?.hash ||
    response?.signature;

  if (typeof hash !== "string" || hash.length === 0) {
    throw new Error(
      `Invalid Privy signAndSendTransaction response: ${JSON.stringify(
        response
      )}`
    );
  }
  return hash;
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
export async function getPrivyWalletInfo(
  walletId: string
): Promise<PrivyWalletInfo> {
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

  get id(): string {
    return this.walletId;
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

async function signAndSendSponsoredTransaction(
  walletId: string,
  txBase64: string
): Promise<string> {
  const caip2 = networkToCaip2(NETWORK);
  const data = await privyFetch(`/wallets/${walletId}/rpc`, {
    method: "POST",
    body: JSON.stringify({
      method: "signAndSendTransaction",
      caip2,
      sponsor: true,
      params: {
        transaction: txBase64,
        encoding: "base64",
      },
    }),
  });
  return extractTxHash(data);
}

function toBase64Transaction(tx: Transaction | VersionedTransaction): string {
  if (tx instanceof VersionedTransaction) {
    return Buffer.from(tx.serialize()).toString("base64");
  }

  // Privy signs this transaction server-side, so it may be missing wallet sig.
  const raw = tx.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });
  return Buffer.from(raw).toString("base64");
}

/**
 * Provider wrapper that routes Privy transactions through signAndSendTransaction
 * with sponsorship enabled.
 */
export class PrivyAnchorProvider extends anchor.AnchorProvider {
  private readonly privyWallet: PrivyWallet;

  constructor(
    connection: Connection,
    wallet: PrivyWallet,
    opts: ConfirmOptions = anchor.AnchorProvider.defaultOptions()
  ) {
    super(connection, wallet as unknown as anchor.Wallet, opts);
    this.privyWallet = wallet;
  }

  private prepareTx(
    tx: Transaction | VersionedTransaction,
    signers?: Signer[]
  ): Transaction | VersionedTransaction {
    if (tx instanceof VersionedTransaction) {
      if (signers && signers.length > 0) {
        tx.sign(signers);
      }
      // Privy fills the real recent blockhash when processing signAndSend.
      (tx.message as any).recentBlockhash = DUMMY_RECENT_BLOCKHASH;
      return tx;
    }

    tx.feePayer = tx.feePayer ?? this.wallet.publicKey;
    tx.recentBlockhash = DUMMY_RECENT_BLOCKHASH;

    if (signers && signers.length > 0) {
      for (const signer of signers) {
        tx.partialSign(signer);
      }
    }
    return tx;
  }

  async sendAndConfirm(
    tx: Transaction | VersionedTransaction,
    signers: Signer[] = [],
    opts?: ConfirmOptions
  ): Promise<TransactionSignature> {
    // Keep localnet behavior unchanged (no Privy sponsorship path there).
    if (NETWORK === "localnet") {
      return super.sendAndConfirm(tx, signers, opts as any);
    }

    const prepared = this.prepareTx(tx, signers);
    const txBase64 = toBase64Transaction(prepared);
    const signature = await signAndSendSponsoredTransaction(
      this.privyWallet.id,
      txBase64
    );

    const commitment = opts?.commitment ?? this.opts.commitment ?? "confirmed";
    const status = await this.connection.confirmTransaction(
      signature,
      commitment
    );
    if (status.value.err) {
      throw new Error(
        `Privy sponsored transaction ${signature} failed: ${JSON.stringify(
          status.value.err
        )}`
      );
    }

    return signature;
  }

  async sendAll<T extends Transaction | VersionedTransaction>(
    txWithSigners: { tx: T; signers?: Signer[] }[],
    opts?: ConfirmOptions
  ): Promise<TransactionSignature[]> {
    const out: TransactionSignature[] = [];
    for (const item of txWithSigners) {
      out.push(await this.sendAndConfirm(item.tx, item.signers ?? [], opts));
    }
    return out;
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
    throw new Error("No Privy wallet found. Run `pc init` to create one.");
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
