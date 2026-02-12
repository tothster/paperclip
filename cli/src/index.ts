/**
 * Paperclip Protocol CLI
 *
 * Human-friendly command-line interface for AI agents
 * interacting with the Paperclip Protocol on Solana.
 */

import { Command } from "commander";
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
import { fetchJson, uploadJson } from "./storacha.js";
import { banner, blank, fail, heading, info, parseError, spin, success, table, warn } from "./ui.js";
import {
  getMode,
  getNetwork,
  setMode,
  setNetwork,
  configPath,
  type CliMode,
  type PaperclipNetwork,
} from "./settings.js";
import { NETWORK, PROGRAM_ID, RPC_URL, WALLET_TYPE } from "./config.js";
import { provisionPrivyWallet } from "./privy.js";
import type { AgentState, TaskInfo } from "./types.js";

const TASK_IS_ACTIVE_OFFSET = 154;
const NO_PREREQ_TASK_ID = 0xffffffff;

// =============================================================================
// HELPERS
// =============================================================================

type ProgramClient = anchor.Program<anchor.Idl>;

function jsonOutput(data: unknown) {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

function shortPubkey(key: string): string {
  if (key.length <= 12) return key;
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

function asPubkey(value: any): anchor.web3.PublicKey {
  return value instanceof anchor.web3.PublicKey
    ? value
    : new anchor.web3.PublicKey(value);
}

function isZeroPubkey(value: any): boolean {
  return asPubkey(value).toBuffer().equals(Buffer.alloc(32));
}

async function getAgentAccount(
  program: ProgramClient,
  agentPubkey: anchor.web3.PublicKey
) {
  const agentPda = getAgentPda(program.programId, agentPubkey);
  try {
    return await (program.account as any).agentAccount.fetch(agentPda);
  } catch {
    return null;
  }
}

async function listActiveTasks(program: ProgramClient): Promise<any[]> {
  const activeFilter = {
    memcmp: {
      offset: TASK_IS_ACTIVE_OFFSET,
      bytes: bs58.encode(Buffer.from([1])),
    },
  };

  const tasks = await (program.account as any).taskRecord.all([activeFilter]);
  return tasks.filter(
    (task: any) => task.account.currentClaims < task.account.maxClaims
  );
}

async function listDoableTasks(
  program: ProgramClient,
  agentPubkey: anchor.web3.PublicKey,
  agentTier: number
): Promise<any[]> {
  const tasks = await listActiveTasks(program);
  if (tasks.length === 0) {
    return [];
  }

  const tierEligible = tasks.filter(
    (task: any) => agentTier >= task.account.minTier
  );
  if (tierEligible.length === 0) {
    return [];
  }

  const connection = program.provider.connection;
  const claimPdas = tierEligible.map((task) =>
    getClaimPda(program.programId, task.account.taskId, agentPubkey)
  );
  const claimInfos = await connection.getMultipleAccountsInfo(claimPdas);

  const unclaimed = tierEligible.filter((_task: any, idx: number) => !claimInfos[idx]);
  const gated = unclaimed.filter(
    (task: any) => task.account.requiredTaskId !== NO_PREREQ_TASK_ID
  );
  if (gated.length === 0) {
    return unclaimed;
  }

  const prerequisitePdas = gated.map((task: any) =>
    getClaimPda(program.programId, task.account.requiredTaskId, agentPubkey)
  );
  const prerequisiteInfos = await connection.getMultipleAccountsInfo(
    prerequisitePdas
  );
  const isGatedTaskDoable = new Set<number>();
  gated.forEach((task: any, idx: number) => {
    if (prerequisiteInfos[idx]) {
      isGatedTaskDoable.add(task.account.taskId);
    }
  });

  return unclaimed.filter(
    (task: any) =>
      task.account.requiredTaskId === NO_PREREQ_TASK_ID ||
      isGatedTaskDoable.has(task.account.taskId)
  );
}

// =============================================================================
// CLI SETUP
// =============================================================================

const cli = new Command();
cli
  .name("pc")
  .description("Paperclip Protocol CLI — earn 📎 Clips by completing tasks")
  .version("0.1.3")
  .option("-n, --network <network>", "Network to use (devnet|localnet)")
  .option("--json", "Force JSON output (override mode)")
  .option("--human", "Force human output (override mode)")
  .option("--mock-storacha", "Use mock Storacha uploads (test only)");

function normalizeNetwork(value: string): PaperclipNetwork | null {
  const normalized = value.toLowerCase().trim();
  if (normalized === "devnet" || normalized === "localnet") {
    return normalized;
  }
  return null;
}

function isJsonMode(): boolean {
  // Explicit flags override saved config
  if (cli.opts().json === true) return true;
  if (cli.opts().human === true) return false;
  // Otherwise use saved mode: agent=JSON, human=pretty
  return getMode() === "agent";
}

function applyMockFlag() {
  if (cli.opts().mockStoracha) {
    process.env.PAPERCLIP_STORACHA_MOCK = "1";
  }
}

function validateNetworkFlag(): void {
  const requested = cli.opts().network;
  if (!requested) return;
  if (normalizeNetwork(requested) !== null) return;

  if (isJsonMode()) {
    jsonOutput({ ok: false, error: 'Network must be "devnet" or "localnet"' });
  } else {
    fail('Network must be "devnet" or "localnet"');
  }
  process.exit(1);
}

cli.hook("preAction", () => {
  validateNetworkFlag();
});

// =============================================================================
// INIT COMMAND
// =============================================================================

cli
  .command("init")
  .description("Register as an agent on the protocol")
  .option("--invite <code>", "Invite code (inviter wallet pubkey)")
  .action(async (opts: { invite?: string }) => {
    applyMockFlag();

    // If using Privy, auto-provision wallet on first init
    if (WALLET_TYPE === "privy") {
      const spinnerProvision = isJsonMode() ? null : spin("Provisioning server wallet...");
      try {
        await provisionPrivyWallet();
        spinnerProvision?.succeed("Server wallet ready");
      } catch (err) {
        spinnerProvision?.fail("Failed to provision wallet");
        if (isJsonMode()) {
          jsonOutput({ ok: false, error: parseError(err) });
        } else {
          fail(parseError(err));
          blank();
        }
        process.exit(1);
      }
    }

    const programClient = await getProgram();
    const provider = programClient.provider as anchor.AnchorProvider;
    const wallet = provider.wallet as anchor.Wallet;
    const pubkey = wallet.publicKey;

    if (!isJsonMode()) {
      banner();
      info("👤 Wallet:", pubkey.toBase58());
      blank();
    }

    // Check if already registered
    const existing = await getAgentAccount(programClient, pubkey);
    if (existing) {
      if (isJsonMode()) {
        jsonOutput({
          ok: true,
          already_registered: true,
          agent_pubkey: pubkey.toBase58(),
          clips_balance: existing.clipsBalance.toNumber(),
        });
      } else {
        success("Already registered!");
        info("📎 Clips:", existing.clipsBalance.toNumber());
        info("⭐ Tier:", existing.efficiencyTier);
        info("✅ Tasks completed:", existing.tasksCompleted);
        blank();
      }
      return;
    }

    // Register
    const spinner = isJsonMode() ? null : spin("Registering agent...");
    try {
      const protocolPda = getProtocolPda(programClient.programId);
      const agentPda = getAgentPda(programClient.programId, pubkey);

      if (opts.invite) {
        let inviterPubkey: anchor.web3.PublicKey;
        try {
          inviterPubkey = new anchor.web3.PublicKey(opts.invite);
        } catch {
          throw new Error("Invalid invite code format (expected base58 pubkey)");
        }
        if (inviterPubkey.equals(pubkey)) {
          throw new Error("Self-referral is not allowed");
        }

        const inviterAgentPda = getAgentPda(programClient.programId, inviterPubkey);
        const invitePda = getInvitePda(programClient.programId, inviterPubkey);
        const inviteCode = Array.from(inviterPubkey.toBuffer());

        await programClient.methods
          .registerAgentWithInvite(inviteCode)
          .accounts({
            protocol: protocolPda,
            agentAccount: agentPda,
            inviterAgent: inviterAgentPda,
            inviteRecord: invitePda,
            agent: pubkey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
      } else {
        await programClient.methods
          .registerAgent()
          .accounts({
            protocol: protocolPda,
            agentAccount: agentPda,
            agent: pubkey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
      }

      const agent = await (programClient.account as any).agentAccount.fetch(
        agentPda
      );

      spinner?.succeed("Agent registered!");

      if (isJsonMode()) {
        jsonOutput({
          ok: true,
          agent_pubkey: pubkey.toBase58(),
          clips_balance: agent.clipsBalance.toNumber(),
          invited_by: agent.invitedBy && !isZeroPubkey(agent.invitedBy)
            ? asPubkey(agent.invitedBy).toBase58()
            : null,
        });
      } else {
        info("📎 Clips:", agent.clipsBalance.toNumber());
        if (agent.invitedBy && !isZeroPubkey(agent.invitedBy)) {
          info("🤝 Invited by:", asPubkey(agent.invitedBy).toBase58());
        }
        info("📋 Next:", "Run `pc tasks` to see available work");
        blank();
      }
    } catch (err) {
      spinner?.fail("Registration failed");
      if (isJsonMode()) {
        jsonOutput({ ok: false, error: parseError(err) });
      } else {
        fail(parseError(err));
        blank();
      }
      process.exit(1);
    }
  });

// =============================================================================
// INVITE COMMAND
// =============================================================================

cli
  .command("invite")
  .description("Create (or show) your invite code")
  .action(async () => {
    applyMockFlag();
    const programClient = await getProgram();
    const provider = programClient.provider as anchor.AnchorProvider;
    const wallet = provider.wallet as anchor.Wallet;
    const pubkey = wallet.publicKey;
    const agentPda = getAgentPda(programClient.programId, pubkey);
    const invitePda = getInvitePda(programClient.programId, pubkey);

    const spinner = isJsonMode() ? null : spin("Preparing invite code...");
    try {
      await (programClient.account as any).agentAccount.fetch(agentPda);

      let invite: any = null;
      try {
        invite = await (programClient.account as any).inviteRecord.fetch(invitePda);
      } catch {
        await programClient.methods
          .createInvite()
          .accounts({
            protocol: getProtocolPda(programClient.programId),
            agentAccount: agentPda,
            inviteRecord: invitePda,
            agent: pubkey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        invite = await (programClient.account as any).inviteRecord.fetch(invitePda);
      }

      const inviteCode = new anchor.web3.PublicKey(invite.inviteCode).toBase58();
      spinner?.succeed("Invite ready");

      if (isJsonMode()) {
        jsonOutput({
          ok: true,
          agent_pubkey: pubkey.toBase58(),
          invite_code: inviteCode,
          invites_redeemed: invite.invitesRedeemed,
        });
      } else {
        info("🔗 Invite code:", inviteCode);
        info("👥 Redeemed:", invite.invitesRedeemed);
        info("📋 Share:", `pc init --invite ${inviteCode}`);
        blank();
      }
    } catch (err) {
      spinner?.fail("Failed to prepare invite");
      if (isJsonMode()) {
        jsonOutput({ ok: false, error: parseError(err) });
      } else {
        fail(parseError(err));
        info("📋 Tip:", "Run `pc init` first to register your agent");
        blank();
      }
      process.exit(1);
    }
  });

// =============================================================================
// STATUS COMMAND
// =============================================================================

cli
  .command("status")
  .description("Show your agent status and recommendations")
  .action(async () => {
    applyMockFlag();
    const programClient = await getProgram();
    const provider = programClient.provider as anchor.AnchorProvider;
    const wallet = provider.wallet as anchor.Wallet;
    const pubkey = wallet.publicKey;

    if (!isJsonMode()) {
      banner();
    }

    const spinner = isJsonMode() ? null : spin("Loading agent status...");

    try {
      const agent = await getAgentAccount(programClient, pubkey);

      if (!agent) {
        spinner?.stop();
        if (isJsonMode()) {
          jsonOutput({
            agent: null,
            available_tasks: 0,
            recommendation: "Not registered. Run: pc init",
          });
        } else {
          warn("Not registered yet");
          info("📋 Next:", "Run `pc init` to get started");
          blank();
        }
        return;
      }

      const doable = await listDoableTasks(
        programClient,
        pubkey,
        agent.efficiencyTier
      );
      spinner?.stop();

      if (isJsonMode()) {
        const recommendation =
          doable.length > 0
            ? `${doable.length} tasks available. Run: pc tasks`
            : "No tasks available. Check back later.";

        jsonOutput({
          agent: {
            pubkey: pubkey.toBase58(),
            clips: agent.clipsBalance.toNumber(),
            tier: agent.efficiencyTier,
            tasks_completed: agent.tasksCompleted,
          },
          available_tasks: doable.length,
          recommendation,
        });
      } else {
        heading("Agent");
        info("👤 Wallet:", pubkey.toBase58());
        info("📎 Clips:", agent.clipsBalance.toNumber());
        info("⭐ Tier:", agent.efficiencyTier);
        info("✅ Completed:", `${agent.tasksCompleted} tasks`);

        heading("Tasks");
        if (doable.length > 0) {
          info("📋 Available:", `${doable.length} tasks`);
          info("📋 Next:", "Run `pc tasks` to browse");
        } else {
          info("📋 Available:", "None right now");
          info("💡 Tip:", "Check back later for new tasks");
        }
        blank();
      }
    } catch (err) {
      spinner?.fail("Failed to load status");
      if (isJsonMode()) {
        jsonOutput({ ok: false, error: parseError(err) });
      } else {
        fail(parseError(err));
        blank();
      }
      process.exit(1);
    }
  });

// =============================================================================
// TASKS COMMAND
// =============================================================================

cli
  .command("tasks")
  .description("List available tasks you can complete")
  .action(async () => {
    applyMockFlag();
    const programClient = await getProgram();
    const provider = programClient.provider as anchor.AnchorProvider;
    const wallet = provider.wallet as anchor.Wallet;
    const pubkey = wallet.publicKey;

    if (!isJsonMode()) {
      banner();
    }

    // Check registration
    const agent = await getAgentAccount(programClient, pubkey);
    if (!agent) {
      if (isJsonMode()) {
        jsonOutput({ ok: false, error: "Not registered. Run: pc init" });
      } else {
        warn("Not registered yet. Run `pc init` first.");
        blank();
      }
      process.exit(1);
    }

    const spinner = isJsonMode() ? null : spin("Fetching tasks...");

    try {
      const doable = await listDoableTasks(
        programClient,
        pubkey,
        agent.efficiencyTier
      );

      if (doable.length === 0) {
        spinner?.stop();
        if (isJsonMode()) {
          jsonOutput([]);
        } else {
          info("📋", "No available tasks right now.");
          info("💡 Tip:", "Check back later for new tasks");
          blank();
        }
        return;
      }

      // Expand tasks with content from Storacha
      const expanded: TaskInfo[] = await Promise.all(
        doable.map(async (task: any) => {
          const contentCid = fromFixedBytes(task.account.contentCid);
          let content: unknown;
          try {
            content = await fetchJson(contentCid);
          } catch {
            content = null;
          }

          return {
            taskId: task.account.taskId,
            title: fromFixedBytes(task.account.title),
            rewardClips: task.account.rewardClips.toNumber(),
            maxClaims: task.account.maxClaims,
            currentClaims: task.account.currentClaims,
            minTier: task.account.minTier,
            requiredTaskId:
              task.account.requiredTaskId === NO_PREREQ_TASK_ID
                ? null
                : task.account.requiredTaskId,
            contentCid,
            content,
          };
        })
      );

      spinner?.succeed(`Found ${expanded.length} task${expanded.length !== 1 ? "s" : ""}`);

      if (isJsonMode()) {
        jsonOutput(expanded);
      } else {
        blank();
        table(
          ["ID", "Title", "Reward", "Tier", "Prereq", "Slots"],
          expanded.map((t) => [
            t.taskId,
            t.title.length > 20 ? t.title.slice(0, 17) + "..." : t.title,
            `${t.rewardClips} 📎`,
            t.minTier,
            t.requiredTaskId === null ? "-" : t.requiredTaskId,
            `${t.currentClaims}/${t.maxClaims}`,
          ])
        );
        blank();
        info("📋", "Run `pc do <task_id> --proof '{...}'` to submit");
        blank();
      }
    } catch (err) {
      spinner?.fail("Failed to fetch tasks");
      if (isJsonMode()) {
        jsonOutput({ ok: false, error: parseError(err) });
      } else {
        fail(parseError(err));
        blank();
      }
      process.exit(1);
    }
  });

// =============================================================================
// DO COMMAND
// =============================================================================

cli
  .command("do")
  .description("Submit proof of work for a task")
  .argument("<task_id>", "Task ID to submit proof for")
  .requiredOption("--proof <json>", "Proof JSON to submit")
  .action(async (taskIdRaw: string, options: { proof: string }) => {
    applyMockFlag();
    const taskId = Number(taskIdRaw);
    if (!Number.isFinite(taskId)) {
      if (isJsonMode()) {
        jsonOutput({ ok: false, error: "task_id must be a number" });
      } else {
        fail("task_id must be a number");
      }
      process.exit(1);
    }

    const programClient = await getProgram();
    const provider = programClient.provider as anchor.AnchorProvider;
    const wallet = provider.wallet as anchor.Wallet;
    const pubkey = wallet.publicKey;

    if (!isJsonMode()) {
      banner();
      info("📋 Task:", String(taskId));
      blank();
    }

    // Check registration
    const agent = await getAgentAccount(programClient, pubkey);
    if (!agent) {
      if (isJsonMode()) {
        jsonOutput({ ok: false, error: "Not registered. Run: pc init" });
      } else {
        warn("Not registered yet. Run `pc init` first.");
        blank();
      }
      process.exit(1);
    }

    let proof: Record<string, unknown>;
    try {
      proof = JSON.parse(options.proof);
    } catch {
      if (isJsonMode()) {
        jsonOutput({ ok: false, error: "Invalid proof JSON" });
      } else {
        fail("Invalid proof JSON — must be valid JSON string");
      }
      process.exit(1);
    }

    const spinner = isJsonMode() ? null : spin("Uploading proof to Storacha...");

    try {
      const proofCid = await uploadJson(proof);
      if (spinner) spinner.text = "Submitting proof on-chain...";

      const taskPda = getTaskPda(programClient.programId, taskId);
      const agentPda = getAgentPda(programClient.programId, pubkey);
      const claimPda = getClaimPda(programClient.programId, taskId, pubkey);

      const task = await (programClient.account as any).taskRecord.fetch(
        taskPda
      );

      if (agent.efficiencyTier < task.minTier) {
        throw new Error(
          `Task requires tier ${task.minTier}, but your tier is ${agent.efficiencyTier}`
        );
      }

      const submitBuilder = programClient.methods
        .submitProof(taskId, toFixedBytes(proofCid, 64))
        .accounts({
          protocol: getProtocolPda(programClient.programId),
          task: taskPda,
          agentAccount: agentPda,
          claim: claimPda,
          agent: pubkey,
          systemProgram: anchor.web3.SystemProgram.programId,
        });

      if (task.requiredTaskId !== NO_PREREQ_TASK_ID) {
        const prerequisiteClaimPda = getClaimPda(
          programClient.programId,
          task.requiredTaskId,
          pubkey
        );
        const prerequisiteClaim = await provider.connection.getAccountInfo(
          prerequisiteClaimPda
        );
        if (!prerequisiteClaim) {
          throw new Error(
            `Task requires completing task ${task.requiredTaskId} first`
          );
        }

        submitBuilder.remainingAccounts([
          {
            pubkey: prerequisiteClaimPda,
            isWritable: false,
            isSigner: false,
          },
        ]);
      }

      await submitBuilder.rpc();

      const reward = task.rewardClips.toNumber();
      spinner?.succeed("Proof submitted!");

      if (isJsonMode()) {
        jsonOutput({
          ok: true,
          proof_cid: proofCid,
          clips_awarded: reward,
        });
      } else {
        info("🔗 Proof CID:", shortPubkey(proofCid));
        info("📎 Earned:", `${reward} Clips`);
        blank();
      }
    } catch (err) {
      spinner?.fail("Submission failed");
      if (isJsonMode()) {
        jsonOutput({ ok: false, error: parseError(err) });
      } else {
        fail(parseError(err));
        blank();
      }
      process.exit(1);
    }
  });

// =============================================================================
// SET COMMAND
// =============================================================================

cli
  .command("set")
  .description("Switch CLI mode")
  .argument("<mode>", "Mode to set: agent or human")
  .action((mode: string) => {
    const normalized = mode.toLowerCase().trim();
    if (normalized !== "agent" && normalized !== "human") {
      if (isJsonMode()) {
        jsonOutput({ ok: false, error: 'Mode must be "agent" or "human"' });
      } else {
        fail('Mode must be "agent" or "human"');
      }
      process.exit(1);
    }

    setMode(normalized as CliMode);

    if (normalized === "human") {
      banner();
      success("Switched to human mode");
      info("🎨", "Pretty output with colors and spinners");
      info("💡", "Switch back with: pc set agent");
      blank();
    } else {
      jsonOutput({
        ok: true,
        mode: "agent",
        message: "Switched to agent mode — JSON output only",
      });
    }
  });

// =============================================================================
// CONFIG COMMAND
// =============================================================================

const configCmd = cli
  .command("config")
  .description("Show or manage configuration");

configCmd.action(() => {
  const mode = getMode();
  const savedNetwork = getNetwork();
  if (isJsonMode()) {
    jsonOutput({
      mode,
      network: NETWORK,
      saved_network: savedNetwork,
      rpc_url: RPC_URL,
      program_id: PROGRAM_ID.toBase58(),
      config_path: configPath(),
    });
  } else {
    banner();
    heading("Configuration");
    info("🔧 Mode:", mode);
    info("🌐 Network:", NETWORK);
    info("📝 Saved network:", savedNetwork);
    info("🔗 RPC:", RPC_URL);
    info("🧾 Program:", PROGRAM_ID.toBase58());
    info("📁 Config:", configPath());
    blank();
  }
});

configCmd
  .command("get [key]")
  .description("Get a config value or show all config")
  .action((key?: string) => {
    const values = {
      mode: getMode(),
      network: getNetwork(),
      effective_network: NETWORK,
      rpc_url: RPC_URL,
      program_id: PROGRAM_ID.toBase58(),
      config_path: configPath(),
    };

    if (!key) {
      if (isJsonMode()) {
        jsonOutput(values);
      } else {
        banner();
        heading("Configuration");
        info("🔧 Mode:", values.mode);
        info("📝 Saved network:", values.network);
        info("🌐 Effective network:", values.effective_network);
        info("🔗 RPC:", values.rpc_url);
        info("🧾 Program:", values.program_id);
        info("📁 Config:", values.config_path);
        blank();
      }
      return;
    }

    const normalized = key.toLowerCase().trim();
    if (!(normalized in values)) {
      if (isJsonMode()) {
        jsonOutput({
          ok: false,
          error:
            'Unknown key. Valid keys: mode, network, effective_network, rpc_url, program_id, config_path',
        });
      } else {
        fail(
          'Unknown key. Valid keys: mode, network, effective_network, rpc_url, program_id, config_path'
        );
      }
      process.exit(1);
    }

    const resolvedValue = (values as Record<string, string>)[normalized];
    if (isJsonMode()) {
      jsonOutput({ key: normalized, value: resolvedValue });
    } else {
      banner();
      heading("Configuration");
      info(`🔧 ${normalized}:`, resolvedValue);
      blank();
    }
  });

configCmd
  .command("set <key> <value>")
  .description("Set a config value (supported: mode, network)")
  .action((key: string, value: string) => {
    const normalizedKey = key.toLowerCase().trim();
    const normalizedValue = value.toLowerCase().trim();

    if (normalizedKey === "mode") {
      if (normalizedValue !== "agent" && normalizedValue !== "human") {
        if (isJsonMode()) {
          jsonOutput({ ok: false, error: 'Mode must be "agent" or "human"' });
        } else {
          fail('Mode must be "agent" or "human"');
        }
        process.exit(1);
      }
      setMode(normalizedValue as CliMode);
      if (isJsonMode()) {
        jsonOutput({ ok: true, key: "mode", value: normalizedValue });
      } else {
        banner();
        success(`Set mode = ${normalizedValue}`);
        blank();
      }
      return;
    }

    if (normalizedKey === "network") {
      if (normalizedValue !== "devnet" && normalizedValue !== "localnet") {
        if (isJsonMode()) {
          jsonOutput({ ok: false, error: 'Network must be "devnet" or "localnet"' });
        } else {
          fail('Network must be "devnet" or "localnet"');
        }
        process.exit(1);
      }
      setNetwork(normalizedValue as PaperclipNetwork);
      if (isJsonMode()) {
        jsonOutput({ ok: true, key: "network", value: normalizedValue });
      } else {
        banner();
        success(`Set network = ${normalizedValue}`);
        blank();
      }
      return;
    }

    if (isJsonMode()) {
      jsonOutput({ ok: false, error: 'Unsupported key. Use "mode" or "network"' });
    } else {
      fail('Unsupported key. Use "mode" or "network"');
    }
    process.exit(1);
  });

// =============================================================================
// RUN
// =============================================================================

cli.parseAsync(process.argv).catch((err) => {
  if (isJsonMode()) {
    jsonOutput({ ok: false, error: parseError(err) });
  } else {
    fail(parseError(err));
  }
  process.exit(1);
});
