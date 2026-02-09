#!/usr/bin/env node
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
} from "./client";
import { fetchJson, uploadJson } from "./storacha";

const TASK_IS_ACTIVE_OFFSET = 153;

function output(data: unknown) {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

type ProgramClient = anchor.Program<anchor.Idl>;

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

  return tasks.filter((task: any, idx: number) => !claimInfos[idx]);
}

async function ensureRegistered(
  program: ProgramClient,
  agentPubkey: anchor.web3.PublicKey
) {
  const agent = await getAgentAccount(program, agentPubkey);
  if (!agent) {
    output({
      ok: false,
      error: "You are not registered. Run: pc init",
    });
    process.exit(1);
  }
  return agent;
}

const program = new Command();
program
  .name("pc")
  .description("Paperclip Protocol CLI")
  .version("0.1.0")
  .option("--mock-storacha", "Use mock Storacha uploads (test only)");

function applyMockFlag() {
  const opts = program.opts();
  if (opts.mockStoracha) {
    process.env.PAPERCLIP_STORACHA_MOCK = "1";
  }
}

program
  .command("init")
  .description("Register agent")
  .action(async () => {
    applyMockFlag();
    const programClient = getProgram();
    const provider = programClient.provider as anchor.AnchorProvider;
    const wallet = provider.wallet as anchor.Wallet;

    const protocolPda = getProtocolPda(programClient.programId);
    const agentPda = getAgentPda(programClient.programId, wallet.publicKey);

    await programClient.methods
      .registerAgent()
      .accounts({
        protocol: protocolPda,
        agentAccount: agentPda,
        agent: wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const agent = await (programClient.account as any).agentAccount.fetch(
      agentPda
    );
    output({
      ok: true,
      agent_pubkey: wallet.publicKey.toBase58(),
      clips_balance: agent.clipsBalance.toNumber(),
    });
  });

program
  .command("status")
  .description("Agent state + recommendation")
  .action(async () => {
    applyMockFlag();
    const programClient = getProgram();
    const provider = programClient.provider as anchor.AnchorProvider;
    const wallet = provider.wallet as anchor.Wallet;

    const agent = await getAgentAccount(programClient, wallet.publicKey);
    if (!agent) {
      output({
        agent: null,
        available_tasks: 0,
        recommendation: "You are not registered. Run: pc init",
      });
      return;
    }

    const doable = await listDoableTasks(programClient, wallet.publicKey);
    const recommendation =
      doable.length > 0
        ? `${doable.length} tasks you haven't completed. Run: pc tasks`
        : "No tasks available. Check back later.";

    output({
      agent: {
        pubkey: wallet.publicKey.toBase58(),
        clips: agent.clipsBalance.toNumber(),
        tier: agent.efficiencyTier,
        tasks_completed: agent.tasksCompleted,
      },
      available_tasks: doable.length,
      recommendation,
    });
  });

program
  .command("tasks")
  .description("List active tasks")
  .action(async () => {
    applyMockFlag();
    const programClient = getProgram();
    const provider = programClient.provider as anchor.AnchorProvider;
    const wallet = provider.wallet as anchor.Wallet;

    await ensureRegistered(programClient, wallet.publicKey);
    const doable = await listDoableTasks(programClient, wallet.publicKey);

    const expanded = await Promise.all(
      doable.map(async (task: any) => {
        const contentCid = fromFixedBytes(task.account.contentCid);
        const content = await fetchJson(contentCid);

        return {
          task_id: task.account.taskId,
          title: fromFixedBytes(task.account.title),
          reward_clips: task.account.rewardClips.toNumber(),
          max_claims: task.account.maxClaims,
          current_claims: task.account.currentClaims,
          content_cid: contentCid,
          content,
        };
      })
    );

    output(expanded);
  });

program
  .command("do")
  .description("Submit proof for a task")
  .argument("<task_id>")
  .requiredOption("--proof <json>")
  .action(async (taskIdRaw: string, options: { proof: string }) => {
    applyMockFlag();
    const taskId = Number(taskIdRaw);
    if (!Number.isFinite(taskId)) {
      throw new Error("task_id must be a number");
    }

    const programClient = getProgram();
    const provider = programClient.provider as anchor.AnchorProvider;
    const wallet = provider.wallet as anchor.Wallet;

    await ensureRegistered(programClient, wallet.publicKey);

    const proof = JSON.parse(options.proof);
    const proofCid = await uploadJson(proof);

    const taskPda = getTaskPda(programClient.programId, taskId);
    const agentPda = getAgentPda(programClient.programId, wallet.publicKey);
    const claimPda = getClaimPda(
      programClient.programId,
      taskId,
      wallet.publicKey
    );

    const task = await (programClient.account as any).taskRecord.fetch(taskPda);

    await programClient.methods
      .submitProof(taskId, toFixedBytes(proofCid, 64))
      .accounts({
        protocol: getProtocolPda(programClient.programId),
        task: taskPda,
        agentAccount: agentPda,
        claim: claimPda,
        agent: wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    output({
      ok: true,
      proof_cid: proofCid,
      clips_awarded: task.rewardClips.toNumber(),
    });
  });

program.parseAsync(process.argv).catch((err) => {
  output({ ok: false, error: err.message || String(err) });
  process.exit(1);
});
