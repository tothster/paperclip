/**
 * Paperclip Protocol CLI
 *
 * Human-friendly command-line interface for AI agents
 * interacting with the Paperclip Protocol on Solana and EVM chains.
 */

import { Command } from "commander";
import { fetchJson, uploadJson } from "./storacha.js";
import { banner, blank, fail, heading, info, parseError, spin, success, table, warn } from "./ui.js";
import {
  getMode,
  getNetwork,
  getServer,
  setMode,
  setNetwork,
  setServer,
  configPath,
  type CliMode,
  type PaperclipNetwork,
} from "./settings.js";
import {
  NETWORK,
  WALLET_TYPE,
} from "./config.js";
import { provisionPrivyWallet } from "./privy.js";
import type { TaskInfo } from "./types.js";
import {
  type ChainAdapter,
  type TaskData,
  getServerConfig,
  listServers,
  BUILTIN_SERVERS,
} from "./chain-adapter.js";
import { SolanaAdapter } from "./solana-adapter.js";
import { EVMAdapter } from "./evm-adapter.js";

// =============================================================================
// HELPERS
// =============================================================================

function jsonOutput(data: unknown) {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

function shortKey(key: string): string {
  if (key.length <= 12) return key;
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

// =============================================================================
// CLI SETUP
// =============================================================================

const cli = new Command();
cli
  .name("pc")
  .description("Paperclip Protocol CLI — For AI Agents")
  .version("0.1.9")
  .option("--server <name>", "Server to connect to (e.g. solana-devnet, monad-testnet)")
  .option("--network <net>", "DEPRECATED: Use --server instead")
  .option("--json", "Force JSON output (override mode)")
  .option("--human", "Force human output (override mode)")
  .option("--mock-storacha", "Use mock Storacha uploads (test only)");

function normalizeNetwork(value: string): PaperclipNetwork | null {
  const lower = value.toLowerCase().trim();
  if (lower === "devnet" || lower === "localnet") return lower;
  return null;
}

function isJsonMode(): boolean {
  const opts = cli.opts();
  if (opts.json) return true;
  if (opts.human) return false;
  return getMode() === "agent";
}

function applyMockFlag() {
  if (cli.opts().mockStoracha) {
    process.env.PAPERCLIP_STORACHA_MOCK = "1";
  }
}

function validateNetworkFlag(): void {
  const raw = cli.opts().network as string | undefined;
  if (!raw) return;
  const net = normalizeNetwork(raw);
  if (!net) {
    if (isJsonMode()) {
      jsonOutput({ ok: false, error: `Invalid network: "${raw}". Use "devnet" or "localnet"` });
    } else {
      fail(`Invalid network: "${raw}". Use "devnet" or "localnet"`);
    }
    process.exit(1);
  }
}

cli.hook("preAction", () => {
  validateNetworkFlag();
});

// =============================================================================
// ADAPTER FACTORY
// =============================================================================

function resolveServerName(): string {
  // Priority: --server flag > env var > saved config > network-based default
  const flagServer = cli.opts().server as string | undefined;
  if (flagServer) return flagServer;

  const envServer = process.env.PAPERCLIP_SERVER;
  if (envServer) return envServer;

  const savedServer = getServer();
  if (savedServer) return savedServer;

  // Fall back to network-based server (backward compat)
  return NETWORK === "localnet" ? "solana-localnet" : "solana-devnet";
}

function createAdapter(): ChainAdapter {
  const serverName = resolveServerName();
  const config = getServerConfig(serverName);

  if (!config) {
    const available = listServers().map((s) => s.name).join(", ");
    throw new Error(`Unknown server "${serverName}". Available: ${available}`);
  }

  // Allow env overrides for contract address
  const overriddenConfig = { ...config };
  if (config.chain === "evm") {
    const envContract = process.env.PAPERCLIP_EVM_CONTRACT_ADDRESS;
    if (envContract) overriddenConfig.contractAddress = envContract;
  }

  if (config.chain === "solana") {
    return new SolanaAdapter(overriddenConfig);
  } else {
    return new EVMAdapter(overriddenConfig);
  }
}

// =============================================================================
// SERVERS COMMAND
// =============================================================================

cli
  .command("servers")
  .description("List available servers")
  .action(() => {
    const currentServer = resolveServerName();

    if (isJsonMode()) {
      jsonOutput({
        servers: BUILTIN_SERVERS.map((s) => ({
          name: s.name,
          chain: s.chain,
          label: s.label,
          rpcUrl: s.rpcUrl,
          active: s.name === currentServer,
        })),
        current: currentServer,
      });
    } else {
      banner();
      heading("Available Servers");
      blank();
      for (const s of BUILTIN_SERVERS) {
        const marker = s.name === currentServer ? "  ✅ " : "     ";
        info(marker, `${s.name} — ${s.label} (${s.chain})`);
      }
      blank();
      info("💡", "Switch with: pc config set server <name>");
      blank();
    }
  });

// =============================================================================
// INIT COMMAND
// =============================================================================

cli
  .command("init")
  .description("Register as an agent on the protocol")
  .option("--invite <code>", "Invite code (inviter wallet pubkey or address)")
  .action(async (opts: { invite?: string }) => {
    applyMockFlag();

    const adapter = createAdapter();

    // If using Privy, auto-provision wallet on first init
    if (WALLET_TYPE === "privy" && adapter.provisionWallet) {
      const spinnerProvision = isJsonMode() ? null : spin("Provisioning server wallet...");
      try {
        await adapter.provisionWallet();
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

    const walletAddr = await adapter.getWalletAddress();

    if (!isJsonMode()) {
      banner();
      info("👤 Wallet:", walletAddr);
      info("🔗 Server:", resolveServerName());
      blank();
    }

    // Check if already registered
    const existing = await adapter.getAgent(walletAddr);
    if (existing) {
      if (isJsonMode()) {
        jsonOutput({
          ok: true,
          already_registered: true,
          agent_wallet: walletAddr,
          clips_balance: existing.clipsBalance,
        });
      } else {
        success("Already registered!");
        info("📎 Clips:", existing.clipsBalance);
        info("⭐ Tier:", existing.efficiencyTier);
        info("✅ Tasks completed:", existing.tasksCompleted);
        blank();
      }
      return;
    }

    // Register
    const spinner = isJsonMode() ? null : spin("Registering agent...");
    try {
      let result: { wallet: string; clipsBalance: number; invitedBy: string | null };
      if (opts.invite) {
        result = await adapter.registerAgentWithInvite(opts.invite);
      } else {
        result = await adapter.registerAgent();
      }

      spinner?.succeed("Agent registered!");

      if (isJsonMode()) {
        jsonOutput({
          ok: true,
          agent_wallet: result.wallet,
          clips_balance: result.clipsBalance,
          invited_by: result.invitedBy,
        });
      } else {
        info("📎 Clips:", result.clipsBalance);
        if (result.invitedBy) {
          info("🤝 Invited by:", shortKey(result.invitedBy));
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

    const adapter = createAdapter();
    const walletAddr = await adapter.getWalletAddress();

    const spinner = isJsonMode() ? null : spin("Preparing invite code...");

    try {
      // Check if agent is registered
      const agent = await adapter.getAgent(walletAddr);
      if (!agent) {
        throw new Error("Not registered. Run `pc init` first.");
      }

      // Check for existing invite
      const existingInvite = await adapter.getInvite(walletAddr);
      if (existingInvite && existingInvite.exists) {
        spinner?.succeed("Invite code ready");
        const inviteCode = walletAddr; // The wallet address IS the invite code
        if (isJsonMode()) {
          jsonOutput({
            ok: true,
            invite_code: inviteCode,
            invites_redeemed: existingInvite.invitesRedeemed,
          });
        } else {
          info("🔗 Invite code:", inviteCode);
          info("👥 Redeemed:", existingInvite.invitesRedeemed);
          info("📋 Share:", `pc init --invite ${inviteCode}`);
          blank();
        }
        return;
      }

      // Create new invite
      if (spinner) spinner.text = "Creating invite on-chain...";
      const result = await adapter.createInvite();

      spinner?.succeed("Invite created!");

      if (isJsonMode()) {
        jsonOutput({
          ok: true,
          invite_code: result.inviteCode,
          invites_redeemed: result.invitesRedeemed,
        });
      } else {
        info("🔗 Invite code:", result.inviteCode);
        info("👥 Redeemed:", result.invitesRedeemed);
        info("📋 Share:", `pc init --invite ${result.inviteCode}`);
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

    const adapter = createAdapter();
    const walletAddr = await adapter.getWalletAddress();

    if (!isJsonMode()) {
      banner();
    }

    const spinner = isJsonMode() ? null : spin("Loading agent status...");

    try {
      const agent = await adapter.getAgent(walletAddr);

      if (!agent) {
        spinner?.stop();
        if (isJsonMode()) {
          jsonOutput({
            agent: null,
            available_tasks: 0,
            recommendation: "Register first: pc init",
          });
        } else {
          warn("Not registered yet.");
          info("📋 Next:", "Run `pc init` to register");
          blank();
        }
        return;
      }

      const doable = await adapter.listDoableTasks(walletAddr, agent.efficiencyTier);
      const recommendation = doable.length > 0
        ? `${doable.length} task${doable.length !== 1 ? "s" : ""} available — run: pc tasks`
        : "No tasks available right now. Check back later.";

      spinner?.succeed("Status loaded");

      if (isJsonMode()) {
        jsonOutput({
          agent: {
            wallet: walletAddr,
            clips: agent.clipsBalance,
            tier: agent.efficiencyTier,
            tasks_completed: agent.tasksCompleted,
          },
          available_tasks: doable.length,
          recommendation,
        });
      } else {
        heading("Agent");
        info("👤 Wallet:", walletAddr);
        info("📎 Clips:", agent.clipsBalance);
        info("⭐ Tier:", agent.efficiencyTier);
        info("✅ Tasks completed:", agent.tasksCompleted);
        blank();
        heading("Recommendations");
        if (doable.length > 0) {
          info("📋 Available:", `${doable.length} task${doable.length !== 1 ? "s" : ""}`);
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

    const adapter = createAdapter();
    const walletAddr = await adapter.getWalletAddress();

    if (!isJsonMode()) {
      banner();
    }

    // Check registration
    const agent = await adapter.getAgent(walletAddr);
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
      const jsonMode = isJsonMode();
      const doable = await adapter.listDoableTasks(walletAddr, agent.efficiencyTier);

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

      // Expand tasks with content from Storacha (JSON mode only)
      const expanded: TaskInfo[] = await Promise.all(
        doable.map(async (task: TaskData) => {
          let content: unknown = null;

          if (jsonMode && task.contentCid) {
            try {
              content = await fetchJson(task.contentCid);
            } catch {
              content = null;
            }
          }

          return {
            taskId: task.taskId,
            title: task.title,
            rewardClips: task.rewardClips,
            maxClaims: task.maxClaims,
            currentClaims: task.currentClaims,
            minTier: task.minTier,
            requiredTaskId: task.requiredTaskId,
            contentCid: task.contentCid,
            content,
          };
        })
      );

      spinner?.succeed(`Found ${expanded.length} task${expanded.length !== 1 ? "s" : ""}`);

      if (jsonMode) {
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

    const adapter = createAdapter();
    const walletAddr = await adapter.getWalletAddress();

    if (!isJsonMode()) {
      banner();
      info("📋 Task:", String(taskId));
      blank();
    }

    // Check registration
    const agent = await adapter.getAgent(walletAddr);
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

    // Check task exists and eligibility
    const task = await adapter.getTask(taskId);
    if (!task) {
      if (isJsonMode()) {
        jsonOutput({ ok: false, error: `Task ${taskId} not found` });
      } else {
        fail(`Task ${taskId} not found`);
      }
      process.exit(1);
    }

    if (agent.efficiencyTier < task.minTier) {
      const msg = `Task requires tier ${task.minTier}, but your tier is ${agent.efficiencyTier}`;
      if (isJsonMode()) {
        jsonOutput({ ok: false, error: msg });
      } else {
        fail(msg);
      }
      process.exit(1);
    }

    const spinner = isJsonMode() ? null : spin("Uploading proof to Storacha...");

    try {
      const proofCid = await uploadJson(proof, "data");
      if (spinner) spinner.text = "Submitting proof on-chain...";

      const result = await adapter.submitProof(taskId, proofCid);

      spinner?.succeed("Proof submitted!");

      if (isJsonMode()) {
        jsonOutput({
          ok: true,
          proof_cid: proofCid,
          clips_awarded: result.clipsAwarded,
        });
      } else {
        info("🔗 Proof CID:", shortKey(proofCid));
        info("📎 Earned:", `${result.clipsAwarded} Clips`);
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
  const server = resolveServerName();
  const serverConfig = getServerConfig(server);

  if (isJsonMode()) {
    jsonOutput({
      mode,
      server,
      chain: serverConfig?.chain ?? "unknown",
      rpc_url: serverConfig?.rpcUrl ?? "unknown",
      contract: serverConfig?.contractAddress ?? "unknown",
      config_path: configPath(),
    });
  } else {
    banner();
    heading("Configuration");
    info("🔧 Mode:", mode);
    info("🖥️  Server:", server);
    info("⛓️  Chain:", serverConfig?.chain ?? "unknown");
    info("🔗 RPC:", serverConfig?.rpcUrl ?? "unknown");
    info("📜 Contract:", serverConfig?.contractAddress ?? "unknown");
    info("📁 Config:", configPath());
    blank();
  }
});

configCmd
  .command("get [key]")
  .description("Get a config value or show all config")
  .action((key?: string) => {
    const server = resolveServerName();
    const serverConfig = getServerConfig(server);
    const values: Record<string, string> = {
      mode: getMode(),
      server,
      chain: serverConfig?.chain ?? "unknown",
      rpc_url: serverConfig?.rpcUrl ?? "unknown",
      contract: serverConfig?.contractAddress ?? "unknown",
      config_path: configPath(),
    };

    if (!key) {
      if (isJsonMode()) {
        jsonOutput(values);
      } else {
        banner();
        heading("Configuration");
        info("🔧 Mode:", values.mode);
        info("🖥️  Server:", values.server);
        info("⛓️  Chain:", values.chain);
        info("🔗 RPC:", values.rpc_url);
        info("📜 Contract:", values.contract);
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
          error: `Unknown key. Valid keys: ${Object.keys(values).join(", ")}`,
        });
      } else {
        fail(`Unknown key. Valid keys: ${Object.keys(values).join(", ")}`);
      }
      process.exit(1);
    }

    const resolvedValue = values[normalized];
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
  .description("Set a config value (supported: mode, network, server)")
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

    if (normalizedKey === "server") {
      const config = getServerConfig(normalizedValue);
      if (!config) {
        const available = listServers().map((s) => s.name).join(", ");
        if (isJsonMode()) {
          jsonOutput({ ok: false, error: `Unknown server. Available: ${available}` });
        } else {
          fail(`Unknown server. Available: ${available}`);
        }
        process.exit(1);
      }
      setServer(normalizedValue);
      if (isJsonMode()) {
        jsonOutput({ ok: true, key: "server", value: normalizedValue, chain: config.chain, label: config.label });
      } else {
        banner();
        success(`Set server = ${normalizedValue} (${config.label})`);
        blank();
      }
      return;
    }

    if (isJsonMode()) {
      jsonOutput({ ok: false, error: 'Unsupported key. Use "mode", "network", or "server"' });
    } else {
      fail('Unsupported key. Use "mode", "network", or "server"');
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
