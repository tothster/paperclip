/**
 * UI helpers — spinners, colored output, error parsing, formatted tables.
 */

import ora, { type Ora } from "ora";
import chalk from "chalk";

// =============================================================================
// BRANDING
// =============================================================================

const BRAND = chalk.bold.magenta("📎 Paperclip");
const DIVIDER = chalk.dim("━".repeat(50));

export function banner() {
  console.log();
  console.log(DIVIDER);
  console.log(`  ${BRAND} ${chalk.dim("Protocol CLI")}`);
  console.log(DIVIDER);
}

// =============================================================================
// SPINNERS
// =============================================================================

export function spin(text: string): Ora {
  return ora({ text, color: "magenta" }).start();
}

// =============================================================================
// OUTPUT HELPERS
// =============================================================================

export function success(msg: string) {
  console.log(chalk.green(`  ✅ ${msg}`));
}

export function info(label: string, value: string | number) {
  console.log(`  ${chalk.dim(label)} ${chalk.white(String(value))}`);
}

export function warn(msg: string) {
  console.log(chalk.yellow(`  ⚠️  ${msg}`));
}

export function fail(msg: string) {
  console.log(chalk.red(`  ❌ ${msg}`));
}

export function heading(title: string) {
  console.log();
  console.log(`  ${chalk.bold(title)}`);
  console.log(`  ${chalk.dim("─".repeat(40))}`);
}

export function blank() {
  console.log();
}

// =============================================================================
// TABLE
// =============================================================================

export function table(headers: string[], rows: (string | number)[][]) {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i] ?? "").length))
  );

  const sep = widths.map((w) => "─".repeat(w + 2)).join("┼");
  const headerRow = headers
    .map((h, i) => ` ${chalk.bold(h.padEnd(widths[i]))} `)
    .join("│");
  const dataRows = rows.map((r) =>
    r.map((c, i) => ` ${String(c).padEnd(widths[i])} `).join("│")
  );

  console.log(
    `  ${chalk.dim("┌" + widths.map((w) => "─".repeat(w + 2)).join("┬") + "┐")}`
  );
  console.log(`  ${chalk.dim("│")}${headerRow}${chalk.dim("│")}`);
  console.log(`  ${chalk.dim("├" + sep + "┤")}`);
  for (const row of dataRows) {
    console.log(`  ${chalk.dim("│")}${row}${chalk.dim("│")}`);
  }
  console.log(
    `  ${chalk.dim("└" + widths.map((w) => "─".repeat(w + 2)).join("┴") + "┘")}`
  );
}

// =============================================================================
// ERROR PARSING
// =============================================================================

/** Known Anchor program errors from the IDL */
const PROGRAM_ERRORS: Record<number, string> = {
  6000: "Unauthorized — only the protocol authority can do this",
  6001: "Task is not active",
  6002: "Task has reached its maximum claims",
  6003: "Math overflow",
  6004: "Agent tier is too low for this task",
  6005: "Complete the prerequisite task before submitting this one",
  6006: "Invalid prerequisite account",
  6007: "Task cannot require itself as a prerequisite",
  6008: "Invalid invite code",
  6009: "Invite is inactive",
  6010: "Self-referral is not allowed",
};

/** System-level Solana errors */
const SYSTEM_ERRORS: Record<string, string> = {
  "already in use": "Account already exists — you may already be registered",
  "insufficient funds":
    "Not enough SOL in your wallet to pay for the transaction",
  AccountNotFound: "Account not found on-chain",
};

/**
 * Parse a raw Anchor/Solana error into a human-readable message.
 */
export function parseError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);

  const maybeLogs = (err as any)?.logs || (err as any)?.transactionLogs;
  if (Array.isArray(maybeLogs) && maybeLogs.length > 0) {
    const tail = maybeLogs.slice(-3).join(" | ");
    return `${msg} Logs: ${tail}`;
  }

  // Check program errors (custom error code)
  const codeMatch = msg.match(/custom program error: 0x([0-9a-fA-F]+)/);
  if (codeMatch) {
    const code = parseInt(codeMatch[1], 16);
    if (code === 0) {
      // System program error 0x0 = account already in use
      if (msg.includes("already in use")) {
        return "Agent already registered. Run: pc status";
      }
      return "Account already exists on-chain";
    }
    const known = PROGRAM_ERRORS[code];
    if (known) return known;
    return `Program error 0x${codeMatch[1]} (${code})`;
  }

  // Check named Anchor errors
  const anchorMatch = msg.match(/Error Code: (\w+)\. .* Error Message: (.+)\./);
  if (anchorMatch) {
    return anchorMatch[2];
  }

  // Check system-level patterns
  for (const [pattern, human] of Object.entries(SYSTEM_ERRORS)) {
    if (msg.toLowerCase().includes(pattern.toLowerCase())) {
      return human;
    }
  }

  // Fallback: return first meaningful line
  const first = msg.split("\n")[0];
  return first.length > 120 ? first.slice(0, 117) + "..." : first;
}
