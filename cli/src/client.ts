import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { PROGRAM_ID, RPC_URL, WALLET_PATH } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROTOCOL_SEED = Buffer.from("protocol");
const AGENT_SEED = Buffer.from("agent");
const TASK_SEED = Buffer.from("task");
const CLAIM_SEED = Buffer.from("claim");

export function loadKeypair(filePath: string): Keypair {
  const raw = fs.readFileSync(filePath, "utf8");
  const bytes = Uint8Array.from(JSON.parse(raw));
  return Keypair.fromSecretKey(bytes);
}

export function getProvider(): anchor.AnchorProvider {
  const connection = new anchor.web3.Connection(RPC_URL, "confirmed");
  const keypair = loadKeypair(WALLET_PATH);
  const wallet = new anchor.Wallet(keypair);
  return new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
}

export function getProgram(): anchor.Program<anchor.Idl> {
  const provider = getProvider();
  anchor.setProvider(provider);

  const idlPath = path.resolve(
    __dirname,
    "..",
    "..",
    "target",
    "idl",
    "paperclip_protocol.json"
  );
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8")) as anchor.Idl;
  // Override address with env-configurable PROGRAM_ID
  (idl as any).address = PROGRAM_ID.toBase58();
  return new anchor.Program(idl, provider);
}

export function toFixedBytes(input: string, size: number): number[] {
  const buf = Buffer.alloc(size);
  const data = Buffer.from(input, "utf8");
  if (data.length > size) {
    throw new Error(`Input exceeds ${size} bytes`);
  }
  data.copy(buf);
  return Array.from(buf);
}

export function fromFixedBytes(data: number[]): string {
  const buf = Buffer.from(data);
  const end = buf.indexOf(0);
  return buf.slice(0, end === -1 ? buf.length : end).toString("utf8");
}

export function taskIdBytes(taskId: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(taskId, 0);
  return buf;
}

export function getProtocolPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([PROTOCOL_SEED], programId)[0];
}

export function getAgentPda(programId: PublicKey, agent: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [AGENT_SEED, agent.toBuffer()],
    programId
  )[0];
}

export function getTaskPda(programId: PublicKey, taskId: number): PublicKey {
  return PublicKey.findProgramAddressSync(
    [TASK_SEED, taskIdBytes(taskId)],
    programId
  )[0];
}

export function getClaimPda(
  programId: PublicKey,
  taskId: number,
  agent: PublicKey
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [CLAIM_SEED, taskIdBytes(taskId), agent.toBuffer()],
    programId
  )[0];
}
