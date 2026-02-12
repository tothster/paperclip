const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const anchor = require("@coral-xyz/anchor");

const ROOT = path.resolve(__dirname, "..", "..");
const CLI_BIN = path.resolve(__dirname, "..", "dist", "index.js");
const STORACHA = path.resolve(__dirname, "..", "dist", "storacha.js");
const CONFIG = path.resolve(__dirname, "..", "dist", "config.js");
const NO_PREREQ_TASK_ID = 0xffffffff;

function runCli(args, envOverrides = {}) {
  const result = spawnSync("node", [CLI_BIN, ...args], {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, ...envOverrides },
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(
      `CLI failed: ${result.stderr || result.stdout || "unknown error"}`
    );
  }

  try {
    return JSON.parse(result.stdout);
  } catch (err) {
    throw new Error(`Failed to parse CLI output: ${result.stdout}`);
  }
}

function toFixedBytes(input, size) {
  const buf = Buffer.alloc(size);
  const data = Buffer.from(input, "utf8");
  if (data.length > size) {
    throw new Error(`Input exceeds ${size} bytes`);
  }
  data.copy(buf);
  return Array.from(buf);
}

function taskIdBytes(taskId) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(taskId, 0);
  return buf;
}

function getProtocolPda(programId) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("protocol")],
    programId
  )[0];
}

function getTaskPda(programId, taskId) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("task"), taskIdBytes(taskId)],
    programId
  )[0];
}

async function ensureProtocol(program) {
  const protocolPda = getProtocolPda(program.programId);
  try {
    await program.account.protocolState.fetch(protocolPda);
    return protocolPda;
  } catch {
    await program.methods
      .initialize(new anchor.BN(100))
      .accounts({
        protocol: protocolPda,
        authority: program.provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    return protocolPda;
  }
}

async function main() {
  if (!fs.existsSync(CLI_BIN)) {
    throw new Error(
      `CLI not built. Run: cd cli && npm install && npm run build`
    );
  }
  if (!fs.existsSync(STORACHA)) {
    throw new Error(`Storacha module not built: ${STORACHA}`);
  }
  if (!fs.existsSync(CONFIG)) {
    throw new Error(`Config module not built: ${CONFIG}`);
  }

  const useMock = process.env.PAPERCLIP_TEST_USE_MOCK_STORACHA === "1";

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const idlPath = path.resolve(
    ROOT,
    "target",
    "idl",
    "paperclip_protocol.json"
  );
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const programId = new anchor.web3.PublicKey(
    process.env.PAPERCLIP_PROGRAM_ID ||
      "29kNcBm1gE7xn3ksX2VTQmwoJR8y8vxPhbF9MZYwjLgo"
  );
  const program = new anchor.Program(idl, programId, provider);

  const rpcUrl =
    process.env.ANCHOR_PROVIDER_URL ||
    process.env.PAPERCLIP_RPC_URL ||
    "http://127.0.0.1:8899";
  const rpcTimeoutMs = 3000;
  const rpcCheck = provider.connection
    .getLatestBlockhash()
    .then(() => true)
    .catch((err) => {
      throw new Error(
        `RPC not reachable at ${rpcUrl}. Start a local validator or set ANCHOR_PROVIDER_URL. Original error: ${
          err.message || err
        }`
      );
    });
  await Promise.race([
    rpcCheck,
    new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `RPC timeout after ${rpcTimeoutMs}ms at ${rpcUrl}. Start a local validator or set ANCHOR_PROVIDER_URL.`
            )
          ),
        rpcTimeoutMs
      )
    ),
  ]);

  const programAccount = await provider.connection.getAccountInfo(programId);
  if (!programAccount) {
    throw new Error(
      `Program not deployed at ${programId.toBase58()}. Run: anchor deploy`
    );
  }

  const { W3UP_DATA_SPACE_DID, W3UP_DATA_SPACE_PROOF } = require(CONFIG);
  if (!useMock) {
    if (!W3UP_DATA_SPACE_DID || !W3UP_DATA_SPACE_PROOF) {
      throw new Error(
        "Storacha not configured. Set W3UP_DATA_SPACE_DID and W3UP_DATA_SPACE_PROOF, or run with PAPERCLIP_TEST_USE_MOCK_STORACHA=1."
      );
    }
  }

  const protocolPda = await ensureProtocol(program);

  const taskId = Math.floor(Math.random() * 0xffffffff);
  const taskPda = getTaskPda(program.programId, taskId);

  let contentCid = "mock-cid";
  let cliArgsPrefix = [];
  let cliEnv = {};

  if (useMock) {
    cliArgsPrefix = ["--mock-storacha"];
    cliEnv = {
      PAPERCLIP_MOCK_TASK_JSON: JSON.stringify({
        version: "0.1.0",
        task_id: String(taskId),
        title: "Integration Task",
        description: "Mock task for integration test",
        instructions: ["Do the thing"],
      }),
    };
  } else {
    const { uploadJson } = require(STORACHA);
    contentCid = await uploadJson({
      version: "0.1.0",
      task_id: String(taskId),
      title: "Integration Task",
      description: "Real Storacha upload for integration test",
      instructions: ["Do the thing"],
    });
  }

  await program.methods
    .createTask(
      taskId,
      toFixedBytes("Integration Task", 32),
      toFixedBytes(contentCid, 64),
      new anchor.BN(50),
      1,
      0,
      NO_PREREQ_TASK_ID
    )
    .accounts({
      protocol: protocolPda,
      authority: provider.wallet.publicKey,
      task: taskPda,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  const initOut = runCli([...cliArgsPrefix, "init"], cliEnv);
  assert.equal(initOut.ok, true);

  const tasksOut = runCli([...cliArgsPrefix, "tasks"], cliEnv);
  assert.ok(Array.isArray(tasksOut));
  assert.ok(tasksOut.find((t) => t.taskId === taskId || t.task_id === taskId));

  const proofOut = runCli(
    [
      ...cliArgsPrefix,
      "do",
      String(taskId),
      "--proof",
      JSON.stringify({ summary: "Completed", steps: ["step1"] }),
    ],
    cliEnv
  );

  assert.equal(proofOut.ok, true);
  assert.ok(typeof proofOut.proof_cid === "string");

  const statusOut = runCli([...cliArgsPrefix, "status"], cliEnv);
  assert.equal(statusOut.agent.tasks_completed >= 1, true);

  console.log("CLI integration test passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
