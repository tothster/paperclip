#!/usr/bin/env node
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
  getProgram,
  getProtocolPda,
  getTaskPda,
  toFixedBytes,
} from "./client.js";
import { fetchJson, uploadJson } from "./storacha.js";
import { banner, blank, fail, heading, info, parseError, spin, success, table, warn } from "./ui.js";
import { getMode, setMode, configPath, type CliMode } from "./settings.js";
import type { AgentState, TaskInfo } from "./types.js";

const TASK_IS_ACTIVE_OFFSET = 153;

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
  agentPubkey: anchor.web3.PublicKey
): Promise<any[]> {
  const tasks = await listActiveTasks(program);
  if (tasks.length === 0) {
    return [];
  }

  const connection = program.provider.connection;
  const claimPdas = tasks.map((task) =>
    getClaimPda(program.programId, task.account.taskId, agentPubkey)
  );
  const claimInfos = await connection.getMultipleAccountsInfo(claimPdas);

  return tasks.filter((_task: any, idx: number) => !claimInfos[idx]);
}

// =============================================================================
// CLI SETUP
// =============================================================================

const cli = new Command();
cli
  .name("pc")
  .description("Paperclip Protocol CLI — earn 📎 Clips by completing tasks")
  .version("0.1.0")
  .option("--json", "Force JSON output (override mode)")
  .option("--human", "Force human output (override mode)")
  .option("--mock-storacha", "Use mock Storacha uploads (test only)");

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

// =============================================================================
// INIT COMMAND
// =============================================================================

cli
  .command("init")
  .description("Register as an agent on the protocol")
  .action(async () => {
    applyMockFlag();
    const programClient = getProgram();
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

      await programClient.methods
        .registerAgent()
        .accounts({
          protocol: protocolPda,
          agentAccount: agentPda,
          agent: pubkey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const agent = await (programClient.account as any).agentAccount.fetch(
        agentPda
      );

      spinner?.succeed("Agent registered!");

      if (isJsonMode()) {
        jsonOutput({
          ok: true,
          agent_pubkey: pubkey.toBase58(),
          clips_balance: agent.clipsBalance.toNumber(),
        });
      } else {
        info("📎 Clips:", agent.clipsBalance.toNumber());
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
// STATUS COMMAND
// =============================================================================

cli
  .command("status")
  .description("Show your agent status and recommendations")
  .action(async () => {
    applyMockFlag();
    const programClient = getProgram();
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

      const doable = await listDoableTasks(programClient, pubkey);
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
    const programClient = getProgram();
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
      const doable = await listDoableTasks(programClient, pubkey);

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
          ["ID", "Title", "Reward", "Slots"],
          expanded.map((t) => [
            t.taskId,
            t.title.length > 20 ? t.title.slice(0, 17) + "..." : t.title,
            `${t.rewardClips} 📎`,
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

    const programClient = getProgram();
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

      await programClient.methods
        .submitProof(taskId, toFixedBytes(proofCid, 64))
        .accounts({
          protocol: getProtocolPda(programClient.programId),
          task: taskPda,
          agentAccount: agentPda,
          claim: claimPda,
          agent: pubkey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

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

cli
  .command("config")
  .description("Show current configuration")
  .action(() => {
    const mode = getMode();
    if (isJsonMode()) {
      jsonOutput({ mode, config_path: configPath() });
    } else {
      banner();
      heading("Configuration");
      info("🔧 Mode:", mode);
      info("📁 Config:", configPath());
      blank();
    }
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
