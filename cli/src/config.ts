import os from "os";
import path from "path";
import { PublicKey } from "@solana/web3.js";

export const RPC_URL = process.env.PAPERCLIP_RPC_URL || "http://127.0.0.1:8899";

export const PROGRAM_ID = new PublicKey(
  process.env.PAPERCLIP_PROGRAM_ID ||
    "29kNcBm1gE7xn3ksX2VTQmwoJR8y8vxPhbF9MZYwjLgo"
);

export const WALLET_PATH =
  process.env.PAPERCLIP_WALLET ||
  path.join(os.homedir(), ".config", "solana", "id.json");

export const STORACHA_GATEWAY_URL =
  process.env.STORACHA_GATEWAY_URL || "https://w3s.link/ipfs/";

const DEFAULT_W3UP_SPACE_DID =
  "did:key:z6MkogFkR3iTVG9rSGBx5vEoobtscR3SvmA63eCcs4bMLcWj";

// Agent key for did:key:z6MkgguZmUBtnW7hDCFdiWB4ezSWWYSoKgsssDtC3ekeJsu7
const DEFAULT_STORACHA_AGENT_KEY =
  "MgCYn4fkLUWLFvRDq0JSxzqITBdp+dAOFRtzk+295/i5AWO0BITZZQ4u/7r3/Oa2JipO537ENTXVQjifoPt775JB68+4=";

const DEFAULT_W3UP_SPACE_PROOF =
  "mAYIEANQROqJlcm9vdHOB2CpYJQABcRIgEH/Xltca4xw5J4beF8hY8wTW7St3ar4WAwjzrST9jHxndmVyc2lvbgHHAgFxEiCWm6o7+Y1CnPKJXb/4mi/A6zqKJfYplclB0MNyW5veg6hhc1hE7aEDQNKeKzGW+43GbtXCjP4v3fXp07ccz/ZLlz3sx/tH5x9hKzyNwFmBKd//jlNVBUFZjVaoKw2KgY+VnUO45+BLiANhdmUwLjkuMWNhdHSBomNjYW5hKmR3aXRoeDhkaWQ6a2V5Ono2TWtvZ0ZrUjNpVFZHOXJTR0J4NXZFb29idHNjUjNTdm1BNjNlQ2NzNGJNTGNXamNhdWRYH50abWFpbHRvOmdtYWlsLmNvbTpidWxsNDA0ZG96ZXJjZXhw9mNmY3SBoWVzcGFjZaJkbmFtZWlQYXBlcmNsaXBmYWNjZXNzoWR0eXBlZnB1YmxpY2Npc3NYIu0BiQ1l5D60c2jaamGJyqn50jEoxP+2+4fsm6/A7i+FfOBjcHJmgMICAXESIJ8DgweCbfPXl+7TEYhS14oK9QwkWZsI8AqeOQQU20e9qGFzRICgAwBhdmUwLjkuMWNhdHSBomNjYW5hKmR3aXRoZnVjYW46KmNhdWRYIu0B2FqJm8sYkb8LJaRCcyCc2fMAnfCAZAo5hwA4yXh/G2BjZXhw9mNmY3SBom5hY2Nlc3MvY29uZmlybdgqWCUAAXESIJkHRi+hrq77NG4MIfsp2OheCakdjXQ/TsK2mVYHx90AbmFjY2Vzcy9yZXF1ZXN02CpYJQABcRIgqrEuZIisFbG+y0oW9GlzAnk9TQztf5tlFrVEswaYrcFjaXNzWB+dGm1haWx0bzpnbWFpbC5jb206YnVsbDQwNGRvemVyY3ByZoHYKlglAAFxEiCWm6o7+Y1CnPKJXb/4mi/A6zqKJfYplclB0MNyW5veg6cDAXESIFwJZ8zDKu3iC2lVjZaFUhjCH6N7w2rnCTHIOWec6ySCqGFzWETtoQNABX3XgHoCg9s+Ms44ln4mD4xlUxnVIDDUi1HS4WQdhxODM6RaJJLxsHu7xbMvn3wR9hiFkObWWDEWcpiKqHnHA2F2ZTAuOS4xY2F0dIGjYm5ioWVwcm9vZtgqWCUAAXESIJ8DgweCbfPXl+7TEYhS14oK9QwkWZsI8AqeOQQU20e9Y2Nhbmt1Y2FuL2F0dGVzdGR3aXRoeBtkaWQ6d2ViOnVwLnN0b3JhY2hhLm5ldHdvcmtjYXVkWCLtAdhaiZvLGJG/CyWkQnMgnNnzAJ3wgGQKOYcAOMl4fxtgY2V4cPZjZmN0gaJuYWNjZXNzL2NvbmZpcm3YKlglAAFxEiCZB0Yvoa6u+zRuDCH7KdjoXgmpHY10P07CtplWB8fdAG5hY2Nlc3MvcmVxdWVzdNgqWCUAAXESIKqxLmSIrBWxvstKFvRpcwJ5PU0M7X+bZRa1RLMGmK3BY2lzc1gZnRp3ZWI6dXAuc3RvcmFjaGEubmV0d29ya2NwcmaAhwgBcRIgMEspCoexCS8/DCLjwlLevE/V/oH4oizVFyulqYcEDhSoYXNYRO2hA0DeyZL+phs1tG/67B1J72cvbJ50sflqMMH/UPtB2xL4BxDaDn2ldlttqEOLQ5nkhVY4ZBvL06CR4lLZ2MIe108BYXZlMC45LjFjYXR0iaJjY2FuaGFzc2VydC8qZHdpdGh4OGRpZDprZXk6ejZNa29nRmtSM2lUVkc5clNHQng1dkVvb2J0c2NSM1N2bUE2M2VDY3M0Yk1MY1dqomNjYW5nc3BhY2UvKmR3aXRoeDhkaWQ6a2V5Ono2TWtvZ0ZrUjNpVFZHOXJTR0J4NXZFb29idHNjUjNTdm1BNjNlQ2NzNGJNTGNXaqJjY2FuZmJsb2IvKmR3aXRoeDhkaWQ6a2V5Ono2TWtvZ0ZrUjNpVFZHOXJTR0J4NXZFb29idHNjUjNTdm1BNjNlQ2NzNGJNTGNXaqJjY2FuZ2luZGV4Lypkd2l0aHg4ZGlkOmtleTp6Nk1rb2dGa1IzaVRWRzlyU0dCeDV2RW9vYnRzY1IzU3ZtQTYzZUNjczRiTUxjV2qiY2NhbmdzdG9yZS8qZHdpdGh4OGRpZDprZXk6ejZNa29nRmtSM2lUVkc5clNHQng1dkVvb2J0c2NSM1N2bUE2M2VDY3M0Yk1MY1dqomNjYW5odXBsb2FkLypkd2l0aHg4ZGlkOmtleTp6Nk1rb2dGa1IzaVRWRzlyU0dCeDV2RW9vYnRzY1IzU3ZtQTYzZUNjczRiTUxjV2qiY2NhbmhhY2Nlc3MvKmR3aXRoeDhkaWQ6a2V5Ono2TWtvZ0ZrUjNpVFZHOXJTR0J4NXZFb29idHNjUjNTdm1BNjNlQ2NzNGJNTGNXaqJjY2FuamZpbGVjb2luLypkd2l0aHg4ZGlkOmtleTp6Nk1rb2dGa1IzaVRWRzlyU0dCeDV2RW9vYnRzY1IzU3ZtQTYzZUNjczRiTUxjV2qiY2Nhbmd1c2FnZS8qZHdpdGh4OGRpZDprZXk6ejZNa29nRmtSM2lUVkc5clNHQng1dkVvb2J0c2NSM1N2bUE2M2VDY3M0Yk1MY1dqY2F1ZFgi7QEhNllDi7/uvf85rYmKk7nfsQ1NdVCOJ+g+3vvkkHrz7mNleHD2Y2ZjdIGhZXNwYWNlomRuYW1laVBhcGVyY2xpcGZhY2Nlc3OhZHR5cGVmcHVibGljY2lzc1gi7QHYWombyxiRvwslpEJzIJzZ8wCd8IBkCjmHADjJeH8bYGNwcmaC2CpYJQABcRIgnwODB4Jt89eX7tMRiFLXigr1DCRZmwjwCp45BBTbR73YKlglAAFxEiBcCWfMwyrt4gtpVY2WhVIYwh+je8Nq5wkxyDlnnOskglkBcRIgEH/Xltca4xw5J4beF8hY8wTW7St3ar4WAwjzrST9jHyhanVjYW5AMC45LjHYKlglAAFxEiAwSykKh7EJLz8MIuPCUt68T9X+gfiiLNUXK6WphwQOFA";

export const W3UP_SPACE_DID =
  process.env.W3UP_SPACE_DID || DEFAULT_W3UP_SPACE_DID;

export const STORACHA_AGENT_KEY =
  process.env.STORACHA_AGENT_KEY || DEFAULT_STORACHA_AGENT_KEY;

export const W3UP_SPACE_PROOF =
  process.env.W3UP_SPACE_PROOF || DEFAULT_W3UP_SPACE_PROOF;

// ---------------------------------------------------------------------------
// Privy server wallet credentials (managed by protocol team)
// Fill these before building to enable Privy-backed agent wallets.
// When empty, the CLI falls back to local keypair signing.
// ---------------------------------------------------------------------------

const DEFAULT_PRIVY_APP_ID = "";
const DEFAULT_PRIVY_APP_SECRET = "";

export const PRIVY_APP_ID =
  process.env.PRIVY_APP_ID || DEFAULT_PRIVY_APP_ID;

export const PRIVY_APP_SECRET =
  process.env.PRIVY_APP_SECRET || DEFAULT_PRIVY_APP_SECRET;

/**
 * Wallet type selector:
 *   "privy"  — server-side signing via Privy (recommended for agents)
 *   "local"  — raw keypair from WALLET_PATH (development fallback)
 *
 * Defaults to "privy" when Privy credentials are baked in,
 * otherwise falls back to "local".
 */
export type WalletType = "privy" | "local";

export const WALLET_TYPE: WalletType =
  (process.env.PAPERCLIP_WALLET_TYPE as WalletType) ||
  (PRIVY_APP_ID && PRIVY_APP_SECRET ? "privy" : "local");
