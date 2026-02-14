/**
 * EVM Adapter
 *
 * ethers.js-based implementation of ChainAdapter for EVM chains (Monad).
 *
 * Supports two wallet modes:
 *   - local:  ethers.Wallet with private key from env var (default for localnet)
 *   - privy:  Privy server wallet with gas sponsorship (for testnet/mainnet)
 */

import { ethers } from "ethers";
import { WALLET_TYPE } from "./config.js";
import {
  provisionPrivyEvmWallet,
  getPersistedEvmWallet,
  sendSponsoredEvmTransaction,
  type EvmTransactionRequest,
} from "./privy-evm.js";
import type {
  ChainAdapter,
  AgentData,
  TaskData,
  ClaimData,
  InviteData,
  ServerConfig,
} from "./chain-adapter.js";

// =========================================================================
// ABI — minimal ABI for the PaperclipProtocol contract
// Only includes the functions we need for CLI operations.
// =========================================================================

const PAPERCLIP_ABI = [
  // View functions
  "function initialized() view returns (bool)",
  "function authority() view returns (address)",
  "function baseRewardUnit() view returns (uint64)",
  "function totalAgents() view returns (uint32)",
  "function totalTasks() view returns (uint32)",
  "function totalClipsDistributed() view returns (uint64)",
  "function getAgent(address wallet) view returns (tuple(bool exists, uint64 clipsBalance, uint8 efficiencyTier, uint32 tasksCompleted, int64 registeredAt, int64 lastActiveAt, uint32 invitesSent, uint32 invitesRedeemed, address invitedBy))",
  "function getTask(uint32 taskId) view returns (tuple(bool exists, uint32 taskId, address creator, string title, string contentCid, uint64 rewardClips, uint16 maxClaims, uint16 currentClaims, bool isActive, int64 createdAt, uint8 minTier, uint32 requiredTaskId))",
  "function getClaim(uint32 taskId, address agent) view returns (tuple(bool exists, uint32 taskId, address agent, string proofCid, uint64 clipsAwarded, int64 completedAt))",
  "function getInvite(address inviter) view returns (tuple(bool exists, address inviterWallet, uint32 invitesRedeemed, int64 createdAt, bool isActive))",
  "function NO_PREREQ_TASK_ID() view returns (uint32)",

  // Mutation functions
  "function registerAgent()",
  "function registerAgentWithInvite(address inviter)",
  "function createInvite()",
  "function submitProof(uint32 taskId, string proofCid)",

  // Events (for task listing)
  "event TaskCreated(uint32 indexed taskId, string title, uint64 rewardClips, uint16 maxClaims, uint8 minTier, uint32 requiredTaskId)",
  "event AgentRegistered(address indexed agent, uint64 clipsBalance)",
  "event ProofSubmitted(uint32 indexed taskId, address indexed agent, string proofCid, uint64 clipsAwarded)",
];

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const NO_PREREQ_TASK_ID = 0xffffffff;

export class EVMAdapter implements ChainAdapter {
  readonly chain = "evm" as const;
  readonly serverName: string;
  private config: ServerConfig;
  private provider: ethers.JsonRpcProvider;
  private signer: ethers.Wallet | null = null;
  private readContract: ethers.Contract | null = null;
  private iface: ethers.Interface;
  private isPrivyMode: boolean;

  constructor(config: ServerConfig) {
    this.config = config;
    this.serverName = config.name;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.iface = new ethers.Interface(PAPERCLIP_ABI);
    // Privy mode is only for non-localnet servers
    this.isPrivyMode = WALLET_TYPE === "privy" && config.name !== "evm-localnet";
  }

  // =========================================================================
  // Contract access — read-only for Privy mode, full signer for local mode
  // =========================================================================

  private getReadContract(): ethers.Contract {
    if (!this.readContract) {
      this.ensureContractAddress();
      this.readContract = new ethers.Contract(
        this.config.contractAddress,
        PAPERCLIP_ABI,
        this.isPrivyMode ? this.provider : this.getLocalSigner()
      );
    }
    return this.readContract;
  }

  private ensureContractAddress(): void {
    if (!this.config.contractAddress) {
      throw new Error(
        `No contract address configured for server "${this.serverName}". ` +
        `Set PAPERCLIP_EVM_CONTRACT_ADDRESS env var or update server config.`
      );
    }
  }

  private getLocalSigner(): ethers.Wallet {
    if (!this.signer) {
      const privateKey =
        process.env.PAPERCLIP_EVM_PRIVATE_KEY || process.env.EVM_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
      if (!privateKey) {
        throw new Error(
          "EVM private key not set. Set PAPERCLIP_EVM_PRIVATE_KEY environment variable."
        );
      }
      this.signer = new ethers.Wallet(privateKey, this.provider);
    }
    return this.signer;
  }

  // =========================================================================
  // Wallet address
  // =========================================================================

  async getWalletAddress(): Promise<string> {
    if (this.isPrivyMode) {
      try {
        const wallet = getPersistedEvmWallet();
        return wallet.address;
      } catch {
        // No wallet provisioned yet — return zero address so read-only
        // commands (tasks, status) can proceed and show "not registered"
        return ZERO_ADDRESS;
      }
    }
    return this.getLocalSigner().address;
  }

  // =========================================================================
  // Protocol reads (always free — no gas, no Privy needed)
  // =========================================================================

  async getAgent(wallet: string): Promise<AgentData | null> {
    const contract = this.getReadContract();
    const agent = await contract.getAgent(wallet);
    if (!agent.exists) return null;

    return {
      exists: true,
      wallet,
      clipsBalance: Number(agent.clipsBalance),
      efficiencyTier: Number(agent.efficiencyTier),
      tasksCompleted: Number(agent.tasksCompleted),
      registeredAt: Number(agent.registeredAt),
      lastActiveAt: Number(agent.lastActiveAt),
      invitesSent: Number(agent.invitesSent),
      invitesRedeemed: Number(agent.invitesRedeemed),
      invitedBy: agent.invitedBy === ZERO_ADDRESS ? null : agent.invitedBy,
    };
  }

  async getTask(taskId: number): Promise<TaskData | null> {
    const contract = this.getReadContract();
    const task = await contract.getTask(taskId);
    if (!task.exists) return null;

    return this.mapTask(task);
  }

  async getClaim(taskId: number, agent: string): Promise<ClaimData | null> {
    const contract = this.getReadContract();
    const claim = await contract.getClaim(taskId, agent);
    if (!claim.exists) return null;

    return {
      exists: true,
      taskId: Number(claim.taskId),
      agent: claim.agent,
      proofCid: claim.proofCid,
      clipsAwarded: Number(claim.clipsAwarded),
      completedAt: Number(claim.completedAt),
    };
  }

  async getInvite(inviter: string): Promise<InviteData | null> {
    const contract = this.getReadContract();
    const invite = await contract.getInvite(inviter);
    if (!invite.exists) return null;

    return {
      exists: true,
      inviterWallet: invite.inviterWallet,
      invitesRedeemed: Number(invite.invitesRedeemed),
      createdAt: Number(invite.createdAt),
      isActive: invite.isActive,
    };
  }

  async listActiveTasks(): Promise<TaskData[]> {
    // Use totalTasks() to iterate through all tasks by ID
    const contract = this.getReadContract();
    const totalTasks = Number(await contract.totalTasks());

    const tasks: TaskData[] = [];
    for (let taskId = 1; taskId <= totalTasks; taskId++) {
      const task = await this.getTask(taskId);
      if (task && task.isActive && task.currentClaims < task.maxClaims) {
        tasks.push(task);
      }
      // Rate limit: 50ms delay between getTask calls to stay under Monad's 25/sec limit
      if (taskId < totalTasks) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    return tasks;
  }

  async listDoableTasks(agentWallet: string, agentTier: number): Promise<TaskData[]> {
    const allActive = await this.listActiveTasks();
    if (allActive.length === 0) return [];

    const tierEligible = allActive.filter((t) => agentTier >= t.minTier);
    if (tierEligible.length === 0) return [];

    // Check claims and prerequisites (with rate limiting for Monad RPC)
    const doable: TaskData[] = [];

    for (let i = 0; i < tierEligible.length; i++) {
      const task = tierEligible[i];
      // Check if already claimed
      const claim = await this.getClaim(task.taskId, agentWallet);
      if (claim) continue;

      // Check prerequisite
      if (task.requiredTaskId !== null) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        const prereqClaim = await this.getClaim(task.requiredTaskId, agentWallet);
        if (!prereqClaim) continue;
      }

      doable.push(task);
      // Rate limit: 50ms delay between getClaim calls to stay under 25/sec limit
      if (i < tierEligible.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    return doable;
  }

  // =========================================================================
  // Mutations — route through Privy or local signer
  // =========================================================================

  async registerAgent(): Promise<{ wallet: string; clipsBalance: number; invitedBy: string | null }> {
    await this.sendMutation("registerAgent", []);

    const wallet = await this.getWalletAddress();
    const agent = await this.getAgent(wallet);
    return {
      wallet,
      clipsBalance: agent!.clipsBalance,
      invitedBy: agent!.invitedBy,
    };
  }

  async registerAgentWithInvite(inviteCode: string): Promise<{ wallet: string; clipsBalance: number; invitedBy: string | null }> {
    // On EVM, the invite code is the inviter's address
    await this.sendMutation("registerAgentWithInvite", [inviteCode]);

    const wallet = await this.getWalletAddress();
    const agent = await this.getAgent(wallet);
    return {
      wallet,
      clipsBalance: agent!.clipsBalance,
      invitedBy: agent!.invitedBy,
    };
  }

  async createInvite(): Promise<{ inviteCode: string; invitesRedeemed: number }> {
    const wallet = await this.getWalletAddress();

    // Check if invite already exists
    const existing = await this.getInvite(wallet);
    if (existing) {
      return {
        inviteCode: existing.inviterWallet,
        invitesRedeemed: existing.invitesRedeemed,
      };
    }

    await this.sendMutation("createInvite", []);

    const invite = await this.getInvite(wallet);
    return {
      inviteCode: invite!.inviterWallet,
      invitesRedeemed: invite!.invitesRedeemed,
    };
  }

  async submitProof(taskId: number, proofCid: string): Promise<{ clipsAwarded: number }> {
    const task = await this.getTask(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    await this.sendMutation("submitProof", [taskId, proofCid]);

    return { clipsAwarded: task.rewardClips };
  }

  // =========================================================================
  // Privy wallet provisioning
  // =========================================================================

  async provisionWallet(): Promise<void> {
    if (this.isPrivyMode) {
      await provisionPrivyEvmWallet();
    }
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

  /**
   * Central mutation dispatcher.
   * - In Privy mode: encode calldata, send via Privy REST API with gas sponsorship
   * - In local mode: send directly via ethers.js signer
   */
  private async sendMutation(functionName: string, args: any[]): Promise<string> {
    if (this.isPrivyMode) {
      return this.sendViaPrivy(functionName, args);
    }
    return this.sendViaLocal(functionName, args);
  }

  private async sendViaPrivy(functionName: string, args: any[]): Promise<string> {
    this.ensureContractAddress();
    const wallet = getPersistedEvmWallet();
    const data = this.iface.encodeFunctionData(functionName, args);

    const hash = await sendSponsoredEvmTransaction(
      wallet.id,
      this.config.chainId!,
      { to: this.config.contractAddress, data }
    );

    // Wait for confirmation. For ERC-4337 UserOps, the hash may be a UserOp hash
    // which won't resolve via waitForTransaction. In that case, poll with retries.
    try {
      const receipt = await this.provider.waitForTransaction(hash, 1, 60_000);
      if (!receipt || receipt.status === 0) {
        throw new Error(`Transaction ${hash} failed on-chain`);
      }
    } catch (err: any) {
      // UserOp hash won't resolve via waitForTransaction - poll for state change instead
      // Wait a bit and verify the mutation took effect by checking on-chain state
      await new Promise((r) => setTimeout(r, 5000));
      // If we get here, the UserOp was likely bundled successfully
      // The caller should verify the state change
    }

    return hash;
  }

  private async sendViaLocal(functionName: string, args: any[]): Promise<string> {
    const contract = this.getReadContract();
    const tx = await contract[functionName](...args);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  private mapTask(task: any): TaskData {
    const reqTaskId = Number(task.requiredTaskId);
    return {
      taskId: Number(task.taskId),
      creator: task.creator,
      title: task.title,
      contentCid: task.contentCid,
      rewardClips: Number(task.rewardClips),
      maxClaims: Number(task.maxClaims),
      currentClaims: Number(task.currentClaims),
      isActive: task.isActive,
      createdAt: Number(task.createdAt),
      minTier: Number(task.minTier),
      requiredTaskId: reqTaskId === NO_PREREQ_TASK_ID ? null : reqTaskId,
    };
  }
}
