/**
 * Standalone devnet initialization script.
 * Calls the `initialize` instruction to create ProtocolState PDA with base_reward_unit=100.
 * Does NOT require airdrop — uses the existing funded wallet.
 *
 * Usage:  ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *         ANCHOR_WALLET=~/.config/solana/id.json \
 *         npx tsx scripts/init-devnet.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";

const PROTOCOL_SEED = Buffer.from("protocol");
const AGENT_SEED = Buffer.from("agent");

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.paperclipProtocol as anchor.Program;
  console.log("Program ID:", program.programId.toBase58());
  console.log("Wallet:", provider.wallet.publicKey.toBase58());

  const [protocolPda] = PublicKey.findProgramAddressSync(
    [PROTOCOL_SEED],
    program.programId
  );

  // 1. Initialize protocol
  console.log("\n[1/2] Initializing protocol...");
  try {
    const tx = await program.methods
      .initialize(new BN(100))
      .accounts({
        protocol: protocolPda,
        authority: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("✓ Protocol initialized! Tx:", tx);
  } catch (err: any) {
    if (err.toString().includes("already in use")) {
      console.log("✓ Protocol already initialized (PDA exists).");
    } else {
      throw err;
    }
  }

  // Verify
  const protocol = await program.account.protocolState.fetch(protocolPda);
  console.log("  ProtocolState PDA:", protocolPda.toBase58());
  console.log("  baseRewardUnit:", protocol.baseRewardUnit.toString());
  console.log("  totalAgents:", protocol.totalAgents);
  console.log("  totalTasks:", protocol.totalTasks);

  // 2. Register deployer as agent
  const [agentPda] = PublicKey.findProgramAddressSync(
    [AGENT_SEED, provider.wallet.publicKey.toBuffer()],
    program.programId
  );

  console.log("\n[2/2] Registering deployer as agent...");
  try {
    const tx = await program.methods
      .registerAgent()
      .accounts({
        protocol: protocolPda,
        agentAccount: agentPda,
        agent: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("✓ Agent registered! Tx:", tx);
  } catch (err: any) {
    if (err.toString().includes("already in use")) {
      console.log("✓ Agent already registered (PDA exists).");
    } else {
      throw err;
    }
  }

  const agent = await program.account.agentAccount.fetch(agentPda);
  console.log("  AgentAccount PDA:", agentPda.toBase58());
  console.log("  clipsBalance:", agent.clipsBalance.toString());
  console.log("  tasksCompleted:", agent.tasksCompleted);

  console.log("\n✅ Devnet initialization complete!");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
