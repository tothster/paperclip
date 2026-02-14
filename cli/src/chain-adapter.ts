/**
 * Chain Adapter Interface
 *
 * Defines the chain-agnostic API for all Paperclip Protocol operations.
 * Both SolanaAdapter and EVMAdapter implement this interface.
 */

// =========================================================================
// TYPES — chain-agnostic representations of on-chain data
// =========================================================================

export interface AgentData {
  exists: boolean;
  wallet: string; // address or pubkey string
  clipsBalance: number;
  efficiencyTier: number;
  tasksCompleted: number;
  registeredAt: number;
  lastActiveAt: number;
  invitesSent: number;
  invitesRedeemed: number;
  invitedBy: string | null; // null or zero-address means none
}

export interface TaskData {
  taskId: number;
  creator: string;
  title: string;
  contentCid: string;
  rewardClips: number;
  maxClaims: number;
  currentClaims: number;
  isActive: boolean;
  createdAt: number;
  minTier: number;
  requiredTaskId: number | null; // null means no prereq
}

export interface ClaimData {
  exists: boolean;
  taskId: number;
  agent: string;
  proofCid: string;
  clipsAwarded: number;
  completedAt: number;
}

export interface InviteData {
  exists: boolean;
  inviterWallet: string;
  invitesRedeemed: number;
  createdAt: number;
  isActive: boolean;
}

// =========================================================================
// CHAIN ADAPTER INTERFACE
// =========================================================================

export interface ChainAdapter {
  /** Chain family identifier */
  readonly chain: "solana" | "evm";

  /** Human-readable name, e.g. "solana-devnet" or "monad-testnet" */
  readonly serverName: string;

  /** The wallet address/pubkey of the current user */
  getWalletAddress(): Promise<string>;

  // --- Protocol reads ---
  getAgent(wallet: string): Promise<AgentData | null>;
  getTask(taskId: number): Promise<TaskData | null>;
  getClaim(taskId: number, agent: string): Promise<ClaimData | null>;
  getInvite(inviter: string): Promise<InviteData | null>;

  // --- Active tasks listing ---
  listActiveTasks(): Promise<TaskData[]>;
  listDoableTasks(agentWallet: string, agentTier: number): Promise<TaskData[]>;

  // --- Mutations ---
  registerAgent(): Promise<{ wallet: string; clipsBalance: number; invitedBy: string | null }>;
  registerAgentWithInvite(inviteCode: string): Promise<{ wallet: string; clipsBalance: number; invitedBy: string | null }>;
  createInvite(): Promise<{ inviteCode: string; invitesRedeemed: number }>;
  submitProof(taskId: number, proofCid: string): Promise<{ clipsAwarded: number }>;

  // --- Privy (optional per chain) ---
  provisionWallet?(): Promise<void>;
}

// =========================================================================
// SERVER REGISTRY
// =========================================================================

export type ChainFamily = "solana" | "evm";

export interface ServerConfig {
  name: string;
  chain: ChainFamily;
  chainId?: number; // EVM only
  rpcUrl: string;
  contractAddress: string; // Program ID for Solana, contract address for EVM
  label: string; // Human display label
}

export const BUILTIN_SERVERS: ServerConfig[] = [
  {
    name: "solana-devnet",
    chain: "solana",
    rpcUrl: "https://devnet.helius-rpc.com/?api-key=4d93203f-a21c-40f1-88aa-7f8e61d5a7c9",
    contractAddress: "Fehg9nbFCRnrZAuaW6tiqnegbHpHgizV9bvakhAWix6v",
    label: "Solana Devnet",
  },
  {
    name: "solana-localnet",
    chain: "solana",
    rpcUrl: "http://127.0.0.1:8899",
    contractAddress: "Fehg9nbFCRnrZAuaW6tiqnegbHpHgizV9bvakhAWix6v",
    label: "Solana Localnet",
  },
  {
    name: "monad-testnet",
    chain: "evm",
    chainId: 10143,
    rpcUrl: "https://testnet-rpc.monad.xyz",
    contractAddress: "0x4e794d12625456fb3043c329215555de4d0e2841",
    label: "Monad Testnet",
  },
  {
    name: "evm-localnet",
    chain: "evm",
    chainId: 31337,
    rpcUrl: "http://127.0.0.1:8545",
    contractAddress: "", // Set via PAPERCLIP_EVM_CONTRACT_ADDRESS env var after deploying to Anvil
    label: "EVM Localnet (Anvil)",
  },
];

export function getServerConfig(name: string): ServerConfig | undefined {
  return BUILTIN_SERVERS.find((s) => s.name === name);
}

export function listServers(): ServerConfig[] {
  return BUILTIN_SERVERS;
}
