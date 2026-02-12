/**
 * Standalone devnet initialization script.
 * Publishes IDL (init/upgrade) then calls `initialize` to create ProtocolState PDA
 * with base_reward_unit=100.
 * Does NOT require airdrop — uses the existing funded wallet.
 *
 * Usage:  ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *         ANCHOR_WALLET=~/.config/solana/id.json \
 *         npx tsx scripts/init-devnet.ts
 */

import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const IDL_PATH = path.resolve(ROOT_DIR, "target", "idl", "paperclip_protocol.json");
const DEFAULT_WALLET_PATH = path.join(os.homedir(), ".config", "solana", "id.json");

const PROTOCOL_SEED = Buffer.from("protocol");
const AGENT_SEED = Buffer.from("agent");

function runAnchorCommand(args: string[]): void {
  const result = spawnSync("anchor", args, {
    stdio: "inherit",
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`anchor ${args.join(" ")} failed with exit code ${result.status ?? 1}`);
  }
}

function hasIdlAccount(programId: string, cluster: string, walletPath: string): boolean {
  const result = spawnSync(
    "anchor",
    [
      "idl",
      "fetch",
      "--provider.cluster",
      cluster,
      "--provider.wallet",
      walletPath,
      programId,
    ],
    {
      stdio: "ignore",
      encoding: "utf8",
    }
  );
  return result.status === 0;
}

function publishIdl(programId: string, cluster: string, walletPath: string): void {
  if (!fs.existsSync(IDL_PATH)) {
    throw new Error(`IDL file not found at ${IDL_PATH}. Run \`anchor build\` first.`);
  }

  console.log("\n[1/3] Publishing IDL...");
  const action = hasIdlAccount(programId, cluster, walletPath) ? "upgrade" : "init";

  runAnchorCommand([
    "idl",
    action,
    "--provider.cluster",
    cluster,
    "--provider.wallet",
    walletPath,
    "--filepath",
    IDL_PATH,
    programId,
  ]);

  console.log(`✓ IDL ${action === "init" ? "initialized" : "upgraded"} from ${IDL_PATH}`);
}

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.paperclipProtocol as anchor.Program;
  const cluster = process.env.ANCHOR_PROVIDER_URL || provider.connection.rpcEndpoint;
  const walletPath = process.env.ANCHOR_WALLET || DEFAULT_WALLET_PATH;

  console.log("Program ID:", program.programId.toBase58());
  console.log("Wallet:", provider.wallet.publicKey.toBase58());
  console.log("RPC:", cluster);

  publishIdl(program.programId.toBase58(), cluster, walletPath);

  const [protocolPda] = PublicKey.findProgramAddressSync(
    [PROTOCOL_SEED],
    program.programId
  );

  // 2. Initialize protocol
  console.log("\n[2/3] Initializing protocol...");
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

  // 3. Register deployer as agent
  const [agentPda] = PublicKey.findProgramAddressSync(
    [AGENT_SEED, provider.wallet.publicKey.toBuffer()],
    program.programId
  );

  console.log("\n[3/3] Registering deployer as agent...");
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
