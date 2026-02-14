/**
 * Solana Adapter
 *
 * Wraps the existing Anchor client code into the ChainAdapter interface.
 * No logic changes — just reorganization of existing code from index.ts and client.ts.
 */

import * as anchor from "@coral-xyz/anchor";
import bs58 from "bs58";
import {
  fromFixedBytes,
  getAgentPda,
  getClaimPda,
  getInvitePda,
  getProgram,
  getProtocolPda,
  getTaskPda,
  toFixedBytes,
} from "./client.js";
import { provisionPrivyWallet } from "./privy.js";
import { WALLET_TYPE } from "./config.js";
import type {
  ChainAdapter,
  AgentData,
  TaskData,
  ClaimData,
  InviteData,
  ServerConfig,
} from "./chain-adapter.js";

const NO_PREREQ_TASK_ID = 0xffffffff;
const TASK_IS_ACTIVE_OFFSET = 154;

type ProgramClient = anchor.Program<anchor.Idl>;

export class SolanaAdapter implements ChainAdapter {
  readonly chain = "solana" as const;
  readonly serverName: string;
  private serverConfig: ServerConfig;
  private _program: ProgramClient | null = null;

  constructor(config: ServerConfig) {
    this.serverConfig = config;
    this.serverName = config.name;
  }

  private async program(): Promise<ProgramClient> {
    if (!this._program) {
      this._program = await getProgram();
    }
    return this._program;
  }

  private async provider(): Promise<anchor.AnchorProvider> {
    const p = await this.program();
    return p.provider as anchor.AnchorProvider;
  }

  private async pubkey(): Promise<anchor.web3.PublicKey> {
    const prov = await this.provider();
    return (prov.wallet as anchor.Wallet).publicKey;
  }

  async getWalletAddress(): Promise<string> {
    return (await this.pubkey()).toBase58();
  }

  async getAgent(wallet: string): Promise<AgentData | null> {
    const p = await this.program();
    const walletPubkey = new anchor.web3.PublicKey(wallet);
    const agentPda = getAgentPda(p.programId, walletPubkey);
    try {
      const acct = await (p.account as any).agentAccount.fetch(agentPda);
      return {
        exists: true,
        wallet,
        clipsBalance: acct.clipsBalance.toNumber(),
        efficiencyTier: acct.efficiencyTier,
        tasksCompleted: acct.tasksCompleted,
        registeredAt: acct.registeredAt?.toNumber?.() ?? acct.registeredAt,
        lastActiveAt: acct.lastActiveAt?.toNumber?.() ?? acct.lastActiveAt,
        invitesSent: acct.invitesSent,
        invitesRedeemed: acct.invitesRedeemed,
        invitedBy: this.isZeroPubkey(acct.invitedBy) ? null : this.asPubkeyStr(acct.invitedBy),
      };
    } catch {
      return null;
    }
  }

  async getTask(taskId: number): Promise<TaskData | null> {
    const p = await this.program();
    const taskPda = getTaskPda(p.programId, taskId);
    try {
      const acct = await (p.account as any).taskRecord.fetch(taskPda);
      return this.mapTask(acct);
    } catch {
      return null;
    }
  }

  async getClaim(taskId: number, agent: string): Promise<ClaimData | null> {
    const p = await this.program();
    const agentPubkey = new anchor.web3.PublicKey(agent);
    const claimPda = getClaimPda(p.programId, taskId, agentPubkey);
    try {
      const acct = await (p.account as any).claimRecord.fetch(claimPda);
      return {
        exists: true,
        taskId: acct.taskId,
        agent,
        proofCid: fromFixedBytes(acct.proofCid),
        clipsAwarded: acct.clipsAwarded.toNumber(),
        completedAt: acct.completedAt?.toNumber?.() ?? acct.completedAt,
      };
    } catch {
      return null;
    }
  }

  async getInvite(inviter: string): Promise<InviteData | null> {
    const p = await this.program();
    const inviterPubkey = new anchor.web3.PublicKey(inviter);
    const invitePda = getInvitePda(p.programId, inviterPubkey);
    try {
      const acct = await (p.account as any).inviteRecord.fetch(invitePda);
      return {
        exists: true,
        inviterWallet: this.asPubkeyStr(acct.inviterWallet),
        invitesRedeemed: acct.invitesRedeemed,
        createdAt: acct.createdAt?.toNumber?.() ?? acct.createdAt,
        isActive: acct.isActive,
      };
    } catch {
      return null;
    }
  }

  async listActiveTasks(): Promise<TaskData[]> {
    const p = await this.program();
    const activeFilter = {
      memcmp: {
        offset: TASK_IS_ACTIVE_OFFSET,
        bytes: bs58.encode(Buffer.from([1])),
      },
    };
    const tasks = await (p.account as any).taskRecord.all([activeFilter]);
    return tasks
      .filter((t: any) => t.account.currentClaims < t.account.maxClaims)
      .map((t: any) => this.mapTask(t.account));
  }

  async listDoableTasks(agentWallet: string, agentTier: number): Promise<TaskData[]> {
    const p = await this.program();
    const agentPubkey = new anchor.web3.PublicKey(agentWallet);
    const allActive = await this.listActiveTasks();
    if (allActive.length === 0) return [];

    const tierEligible = allActive.filter((t) => agentTier >= t.minTier);
    if (tierEligible.length === 0) return [];

    // Batch check claims
    const claimPdas = tierEligible.map((t) =>
      getClaimPda(p.programId, t.taskId, agentPubkey)
    );
    const connection = p.provider.connection;
    const claimInfos = await connection.getMultipleAccountsInfo(claimPdas);

    const unclaimed = tierEligible.filter((_t, idx) => !claimInfos[idx]);

    // Check prerequisites
    const gated = unclaimed.filter((t) => t.requiredTaskId !== null);
    if (gated.length === 0) return unclaimed;

    const prereqPdas = gated.map((t) =>
      getClaimPda(p.programId, t.requiredTaskId!, agentPubkey)
    );
    const prereqInfos = await connection.getMultipleAccountsInfo(prereqPdas);
    const doableGated = new Set<number>();
    gated.forEach((t, idx) => {
      if (prereqInfos[idx]) doableGated.add(t.taskId);
    });

    return unclaimed.filter(
      (t) => t.requiredTaskId === null || doableGated.has(t.taskId)
    );
  }

  async registerAgent(): Promise<{ wallet: string; clipsBalance: number; invitedBy: string | null }> {
    const p = await this.program();
    const pk = await this.pubkey();
    const protocolPda = getProtocolPda(p.programId);
    const agentPda = getAgentPda(p.programId, pk);

    await p.methods
      .registerAgent()
      .accounts({
        protocol: protocolPda,
        agentAccount: agentPda,
        agent: pk,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const agent = await (p.account as any).agentAccount.fetch(agentPda);
    return {
      wallet: pk.toBase58(),
      clipsBalance: agent.clipsBalance.toNumber(),
      invitedBy: this.isZeroPubkey(agent.invitedBy) ? null : this.asPubkeyStr(agent.invitedBy),
    };
  }

  async registerAgentWithInvite(inviteCode: string): Promise<{ wallet: string; clipsBalance: number; invitedBy: string | null }> {
    const p = await this.program();
    const pk = await this.pubkey();

    const inviterPubkey = new anchor.web3.PublicKey(inviteCode);
    const protocolPda = getProtocolPda(p.programId);
    const agentPda = getAgentPda(p.programId, pk);
    const inviterAgentPda = getAgentPda(p.programId, inviterPubkey);
    const invitePda = getInvitePda(p.programId, inviterPubkey);

    await p.methods
      .registerAgentWithInvite(Array.from(inviterPubkey.toBuffer()))
      .accounts({
        protocol: protocolPda,
        agentAccount: agentPda,
        inviterAgent: inviterAgentPda,
        inviteRecord: invitePda,
        agent: pk,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const agent = await (p.account as any).agentAccount.fetch(agentPda);
    return {
      wallet: pk.toBase58(),
      clipsBalance: agent.clipsBalance.toNumber(),
      invitedBy: this.isZeroPubkey(agent.invitedBy) ? null : this.asPubkeyStr(agent.invitedBy),
    };
  }

  async createInvite(): Promise<{ inviteCode: string; invitesRedeemed: number }> {
    const p = await this.program();
    const pk = await this.pubkey();
    const agentPda = getAgentPda(p.programId, pk);
    const invitePda = getInvitePda(p.programId, pk);

    // Check if invite already exists
    try {
      const existing = await (p.account as any).inviteRecord.fetch(invitePda);
      const code = new anchor.web3.PublicKey(existing.inviteCode).toBase58();
      return { inviteCode: code, invitesRedeemed: existing.invitesRedeemed };
    } catch {
      // Invite doesn't exist yet — create it
    }

    await p.methods
      .createInvite()
      .accounts({
        protocol: getProtocolPda(p.programId),
        agentAccount: agentPda,
        inviteRecord: invitePda,
        agent: pk,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const invite = await (p.account as any).inviteRecord.fetch(invitePda);
    const code = new anchor.web3.PublicKey(invite.inviteCode).toBase58();
    return { inviteCode: code, invitesRedeemed: invite.invitesRedeemed };
  }

  async submitProof(taskId: number, proofCid: string): Promise<{ clipsAwarded: number }> {
    const p = await this.program();
    const pk = await this.pubkey();
    const prov = await this.provider();

    const taskPda = getTaskPda(p.programId, taskId);
    const agentPda = getAgentPda(p.programId, pk);
    const claimPda = getClaimPda(p.programId, taskId, pk);
    const protocolPda = getProtocolPda(p.programId);

    const task = await (p.account as any).taskRecord.fetch(taskPda);

    const submitBuilder = p.methods
      .submitProof(taskId, toFixedBytes(proofCid, 64))
      .accounts({
        protocol: protocolPda,
        task: taskPda,
        agentAccount: agentPda,
        claim: claimPda,
        agent: pk,
        systemProgram: anchor.web3.SystemProgram.programId,
      });

    if (task.requiredTaskId !== NO_PREREQ_TASK_ID) {
      const prereqClaimPda = getClaimPda(p.programId, task.requiredTaskId, pk);
      const prereqInfo = await prov.connection.getAccountInfo(prereqClaimPda);
      if (!prereqInfo) {
        throw new Error(`Task requires completing task ${task.requiredTaskId} first`);
      }
      submitBuilder.remainingAccounts([
        { pubkey: prereqClaimPda, isWritable: false, isSigner: false },
      ]);
    }

    await submitBuilder.rpc();
    return { clipsAwarded: task.rewardClips.toNumber() };
  }

  async provisionWallet(): Promise<void> {
    if (WALLET_TYPE === "privy") {
      await provisionPrivyWallet();
    }
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

  private mapTask(acct: any): TaskData {
    return {
      taskId: acct.taskId,
      creator: this.asPubkeyStr(acct.creator),
      title: fromFixedBytes(acct.title),
      contentCid: fromFixedBytes(acct.contentCid),
      rewardClips: acct.rewardClips.toNumber(),
      maxClaims: acct.maxClaims,
      currentClaims: acct.currentClaims,
      isActive: acct.isActive,
      createdAt: acct.createdAt?.toNumber?.() ?? acct.createdAt,
      minTier: acct.minTier,
      requiredTaskId: acct.requiredTaskId === NO_PREREQ_TASK_ID ? null : acct.requiredTaskId,
    };
  }

  private asPubkeyStr(value: any): string {
    if (typeof value === "string") return value;
    if (value instanceof anchor.web3.PublicKey) return value.toBase58();
    return new anchor.web3.PublicKey(value).toBase58();
  }

  private isZeroPubkey(value: any): boolean {
    try {
      const pk = value instanceof anchor.web3.PublicKey
        ? value
        : new anchor.web3.PublicKey(value);
      return pk.toBuffer().equals(Buffer.alloc(32));
    } catch {
      return true;
    }
  }
}
