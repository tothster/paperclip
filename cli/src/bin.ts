#!/usr/bin/env node
/**
 * CLI entry point — suppresses Node ≥ 21 punycode deprecation (DEP0040)
 * before any dependency can trigger it, then hands off to the real CLI.
 */

const originalEmit = process.emit;
process.emit = function (event: string, ...args: unknown[]) {
  const warning = args[0] as { name?: string; code?: string } | undefined;
  if (
    event === "warning" &&
    warning?.name === "DeprecationWarning" &&
    warning?.code === "DEP0040"
  ) {
    return false;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (originalEmit as any).apply(process, [event, ...args]);
};

await import("./index.js");
