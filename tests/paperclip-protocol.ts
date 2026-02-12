import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PaperclipProtocol } from "../target/types/paperclip_protocol";
import { assert } from "chai";

const { PublicKey, SystemProgram, Keypair, LAMPORTS_PER_SOL } = anchor.web3;

const PROTOCOL_SEED = Buffer.from("protocol");
const AGENT_SEED = Buffer.from("agent");
const TASK_SEED = Buffer.from("task");
const CLAIM_SEED = Buffer.from("claim");
const NO_PREREQ_TASK_ID = 0xffffffff;

function toFixedBytes(input: string, size: number): number[] {
  const buf = Buffer.alloc(size);
  const data = Buffer.from(input, "utf8");
  if (data.length > size) {
    throw new Error(`Input exceeds ${size} bytes`);
  }
  data.copy(buf);
  return Array.from(buf);
}

function taskIdBytes(taskId: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(taskId, 0);
  return buf;
}

function getProtocolPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([PROTOCOL_SEED], programId)[0];
}

function getAgentPda(programId: PublicKey, agent: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [AGENT_SEED, agent.toBuffer()],
    programId
  )[0];
}

function getTaskPda(programId: PublicKey, taskId: number): PublicKey {
  return PublicKey.findProgramAddressSync(
    [TASK_SEED, taskIdBytes(taskId)],
    programId
  )[0];
}

function getClaimPda(
  programId: PublicKey,
  taskId: number,
  agent: PublicKey
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [CLAIM_SEED, taskIdBytes(taskId), agent.toBuffer()],
    programId
  )[0];
}

async function airdrop(
  connection: anchor.web3.Connection,
  pubkey: PublicKey,
  amount = 2 * LAMPORTS_PER_SOL
) {
  const sig = await connection.requestAirdrop(pubkey, amount);
  await connection.confirmTransaction(sig, "confirmed");
}

describe("paperclip-protocol", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace
    .paperclipProtocol as Program<PaperclipProtocol>;
  const protocolPda = getProtocolPda(program.programId);

  const baseUnit = new anchor.BN(100);
  const task1Id = 1;
  const task2Id = 2;
  const task3Id = 3;
  const task4Id = 4;
  const task5Id = 5;

  const unauthorized = Keypair.generate();
  const agent2 = Keypair.generate();
  const agent3 = Keypair.generate();
  const agent4 = Keypair.generate();

  before(async () => {
    await airdrop(provider.connection, unauthorized.publicKey);
    await airdrop(provider.connection, agent2.publicKey);
    await airdrop(provider.connection, agent3.publicKey);
    await airdrop(provider.connection, agent4.publicKey);
  });

  it("Initializes protocol", async () => {
    await program.methods
      .initialize(baseUnit)
      .accounts({
        protocol: protocolPda,
        authority: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const protocol = await program.account.protocolState.fetch(protocolPda);
    assert.equal(protocol.layoutVersion, 1);
    assert.equal(protocol.reserved.length, 64);
    assert.equal(protocol.baseRewardUnit.toNumber(), 100);
    assert.equal(protocol.totalAgents, 0);
    assert.equal(protocol.totalTasks, 0);
  });

  it("Registers agent and airdrops clips", async () => {
    const agentPda = getAgentPda(program.programId, provider.wallet.publicKey);
    await program.methods
      .registerAgent()
      .accounts({
        protocol: protocolPda,
        agentAccount: agentPda,
        agent: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const agent = await program.account.agentAccount.fetch(agentPda);
    assert.equal(agent.layoutVersion, 1);
    assert.equal(agent.reserved.length, 128);
    assert.equal(agent.clipsBalance.toNumber(), 100);
    assert.equal(agent.efficiencyTier, 0);
    assert.equal(agent.tasksCompleted, 0);
  });

  it("Creates task (authority only)", async () => {
    const taskPda = getTaskPda(program.programId, task1Id);
    await program.methods
      .createTask(
        task1Id,
        toFixedBytes("Task One", 32),
        toFixedBytes("bafy-task-one", 64),
        new anchor.BN(50),
        2,
        0,
        NO_PREREQ_TASK_ID
      )
      .accounts({
        protocol: protocolPda,
        authority: provider.wallet.publicKey,
        task: taskPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const task = await program.account.taskRecord.fetch(taskPda);
    assert.equal(task.layoutVersion, 1);
    assert.equal(task.reserved.length, 128);
    assert.equal(task.taskId, task1Id);
    assert.equal(task.rewardClips.toNumber(), 50);
    assert.equal(task.maxClaims, 2);
    assert.equal(task.currentClaims, 0);
    assert.equal(task.isActive, true);
    assert.equal(task.minTier, 0);
    assert.equal(task.requiredTaskId, NO_PREREQ_TASK_ID);
  });

  it("Rejects non-authority create_task", async () => {
    const taskPda = getTaskPda(program.programId, 99);
    try {
      await program.methods
        .createTask(
          99,
          toFixedBytes("Unauthorized", 32),
          toFixedBytes("bafy-unauthorized", 64),
          new anchor.BN(10),
          1,
          0,
          NO_PREREQ_TASK_ID
        )
        .accounts({
          protocol: protocolPda,
          authority: unauthorized.publicKey,
          task: taskPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([unauthorized])
        .rpc();
      assert.fail("Expected unauthorized create_task to fail");
    } catch (err) {
      const message = (err as Error).toString();
      assert.include(message, "Unauthorized");
    }
  });

  it("Rejects self-referential task prerequisite", async () => {
    const taskPda = getTaskPda(program.programId, 777);
    try {
      await program.methods
        .createTask(
          777,
          toFixedBytes("Bad Prereq", 32),
          toFixedBytes("bafy-bad-prereq", 64),
          new anchor.BN(10),
          1,
          0,
          777
        )
        .accounts({
          protocol: protocolPda,
          authority: provider.wallet.publicKey,
          task: taskPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("Expected self-referential prerequisite to fail");
    } catch (err) {
      const message = (err as Error).toString();
      assert.include(message, "Task cannot require itself as a prerequisite");
    }
  });

  it("Rejects non-authority deactivate_task", async () => {
    const taskPda = getTaskPda(program.programId, task5Id);
    await program.methods
      .createTask(
        task5Id,
        toFixedBytes("Deactivatable", 32),
        toFixedBytes("bafy-deactivatable", 64),
        new anchor.BN(20),
        3,
        0,
        NO_PREREQ_TASK_ID
      )
      .accounts({
        protocol: protocolPda,
        authority: provider.wallet.publicKey,
        task: taskPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    try {
      await program.methods
        .deactivateTask(task5Id)
        .accounts({
          protocol: protocolPda,
          task: taskPda,
          authority: unauthorized.publicKey,
        })
        .signers([unauthorized])
        .rpc();
      assert.fail("Expected unauthorized deactivate_task to fail");
    } catch (err) {
      const message = (err as Error).toString();
      assert.include(message, "Unauthorized");
    }
  });

  it("Deactivates task and blocks submit_proof", async () => {
    const taskPda = getTaskPda(program.programId, task5Id);
    await program.methods
      .deactivateTask(task5Id)
      .accounts({
        protocol: protocolPda,
        task: taskPda,
        authority: provider.wallet.publicKey,
      })
      .rpc();

    const task = await program.account.taskRecord.fetch(taskPda);
    assert.equal(task.isActive, false);

    const agentPda = getAgentPda(program.programId, provider.wallet.publicKey);
    const claimPda = getClaimPda(
      program.programId,
      task5Id,
      provider.wallet.publicKey
    );

    try {
      await program.methods
        .submitProof(task5Id, toFixedBytes("bafy-proof-inactive", 64))
        .accounts({
          protocol: protocolPda,
          task: taskPda,
          agentAccount: agentPda,
          claim: claimPda,
          agent: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("Expected submit on inactive task to fail");
    } catch (err) {
      const message = (err as Error).toString();
      assert.include(message, "Task is not active");
    }
  });

  it("Submits proof and awards clips", async () => {
    const taskPda = getTaskPda(program.programId, task1Id);
    const agentPda = getAgentPda(program.programId, provider.wallet.publicKey);
    const claimPda = getClaimPda(
      program.programId,
      task1Id,
      provider.wallet.publicKey
    );

    await program.methods
      .submitProof(task1Id, toFixedBytes("bafy-proof-one", 64))
      .accounts({
        protocol: protocolPda,
        task: taskPda,
        agentAccount: agentPda,
        claim: claimPda,
        agent: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const agent = await program.account.agentAccount.fetch(agentPda);
    const task = await program.account.taskRecord.fetch(taskPda);
    const claim = await program.account.claimRecord.fetch(claimPda);
    assert.equal(claim.layoutVersion, 1);
    assert.equal(claim.reserved.length, 64);

    assert.equal(agent.clipsBalance.toNumber(), 150);
    assert.equal(agent.tasksCompleted, 1);
    assert.equal(task.currentClaims, 1);
    assert.equal(claim.taskId, task1Id);
  });

  it("Rejects double claim for same agent", async () => {
    const taskPda = getTaskPda(program.programId, task1Id);
    const agentPda = getAgentPda(program.programId, provider.wallet.publicKey);
    const claimPda = getClaimPda(
      program.programId,
      task1Id,
      provider.wallet.publicKey
    );

    try {
      await program.methods
        .submitProof(task1Id, toFixedBytes("bafy-proof-one", 64))
        .accounts({
          protocol: protocolPda,
          task: taskPda,
          agentAccount: agentPda,
          claim: claimPda,
          agent: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("Expected double claim to fail");
    } catch (err) {
      const message = (err as Error).toString();
      assert.include(message.toLowerCase(), "already in use");
    }
  });

  it("Enforces minimum tier on submit_proof", async () => {
    const taskPda = getTaskPda(program.programId, task3Id);
    await program.methods
      .createTask(
        task3Id,
        toFixedBytes("Tier One Task", 32),
        toFixedBytes("bafy-tier-one-task", 64),
        new anchor.BN(30),
        5,
        1,
        NO_PREREQ_TASK_ID
      )
      .accounts({
        protocol: protocolPda,
        authority: provider.wallet.publicKey,
        task: taskPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const agentPda = getAgentPda(program.programId, provider.wallet.publicKey);
    const claimPda = getClaimPda(
      program.programId,
      task3Id,
      provider.wallet.publicKey
    );

    try {
      await program.methods
        .submitProof(task3Id, toFixedBytes("bafy-tier-fail", 64))
        .accounts({
          protocol: protocolPda,
          task: taskPda,
          agentAccount: agentPda,
          claim: claimPda,
          agent: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("Expected tier gate to fail");
    } catch (err) {
      const message = (err as Error).toString();
      assert.include(message, "Agent tier is too low for this task");
    }
  });

  it("Enforces prerequisite task completion", async () => {
    const taskPda = getTaskPda(program.programId, task4Id);
    await program.methods
      .createTask(
        task4Id,
        toFixedBytes("Requires Task One", 32),
        toFixedBytes("bafy-requires-task-one", 64),
        new anchor.BN(40),
        5,
        0,
        task1Id
      )
      .accounts({
        protocol: protocolPda,
        authority: provider.wallet.publicKey,
        task: taskPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const agent4Pda = getAgentPda(program.programId, agent4.publicKey);
    await program.methods
      .registerAgent()
      .accounts({
        protocol: protocolPda,
        agentAccount: agent4Pda,
        agent: agent4.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([agent4])
      .rpc();

    const agent4ClaimPda = getClaimPda(program.programId, task4Id, agent4.publicKey);
    const missingPrereqClaimPda = getClaimPda(program.programId, task1Id, agent4.publicKey);

    try {
      await program.methods
        .submitProof(task4Id, toFixedBytes("bafy-no-prereq", 64))
        .accounts({
          protocol: protocolPda,
          task: taskPda,
          agentAccount: agent4Pda,
          claim: agent4ClaimPda,
          agent: agent4.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts([
          { pubkey: missingPrereqClaimPda, isWritable: false, isSigner: false },
        ])
        .signers([agent4])
        .rpc();
      assert.fail("Expected prerequisite gate to fail");
    } catch (err) {
      const message = (err as Error).toString();
      assert.include(message, "Required prerequisite task has not been completed");
    }

    const providerAgentPda = getAgentPda(program.programId, provider.wallet.publicKey);
    const providerClaimPda = getClaimPda(program.programId, task4Id, provider.wallet.publicKey);
    const providerPrereqClaimPda = getClaimPda(program.programId, task1Id, provider.wallet.publicKey);

    await program.methods
      .submitProof(task4Id, toFixedBytes("bafy-with-prereq", 64))
      .accounts({
        protocol: protocolPda,
        task: taskPda,
        agentAccount: providerAgentPda,
        claim: providerClaimPda,
        agent: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts([
        { pubkey: providerPrereqClaimPda, isWritable: false, isSigner: false },
      ])
      .rpc();

    const providerClaim = await program.account.claimRecord.fetch(providerClaimPda);
    assert.equal(providerClaim.taskId, task4Id);
  });

  it("Rejects claims when max_claims reached", async () => {
    const taskPda = getTaskPda(program.programId, task2Id);
    await program.methods
      .createTask(
        task2Id,
        toFixedBytes("Task Two", 32),
        toFixedBytes("bafy-task-two", 64),
        new anchor.BN(25),
        1,
        0,
        NO_PREREQ_TASK_ID
      )
      .accounts({
        protocol: protocolPda,
        authority: provider.wallet.publicKey,
        task: taskPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const agent2Pda = getAgentPda(program.programId, agent2.publicKey);
    await program.methods
      .registerAgent()
      .accounts({
        protocol: protocolPda,
        agentAccount: agent2Pda,
        agent: agent2.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([agent2])
      .rpc();

    const claimPda = getClaimPda(program.programId, task2Id, agent2.publicKey);
    await program.methods
      .submitProof(task2Id, toFixedBytes("bafy-proof-two", 64))
      .accounts({
        protocol: protocolPda,
        task: taskPda,
        agentAccount: agent2Pda,
        claim: claimPda,
        agent: agent2.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([agent2])
      .rpc();

    const agent3Pda = getAgentPda(program.programId, agent3.publicKey);
    await program.methods
      .registerAgent()
      .accounts({
        protocol: protocolPda,
        agentAccount: agent3Pda,
        agent: agent3.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([agent3])
      .rpc();

    const agent3ClaimPda = getClaimPda(
      program.programId,
      task2Id,
      agent3.publicKey
    );

    try {
      await program.methods
        .submitProof(task2Id, toFixedBytes("bafy-proof-three", 64))
        .accounts({
          protocol: protocolPda,
          task: taskPda,
          agentAccount: agent3Pda,
          claim: agent3ClaimPda,
          agent: agent3.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([agent3])
        .rpc();
      assert.fail("Expected max claims to fail");
    } catch (err) {
      const message = (err as Error).toString();
      assert.include(message, "Task is fully claimed");
    }
  });
});
