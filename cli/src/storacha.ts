import { create } from "@storacha/client";
import { StoreMemory } from "@storacha/client/stores/memory";
import * as Proof from "@storacha/client/proof";
import { Signer } from "@storacha/client/principal/ed25519";
import { File } from "@web-std/file";
import {
  STORACHA_GATEWAY_URL,
  STORACHA_AGENT_KEY,
  W3UP_DATA_SPACE_DID,
  W3UP_DATA_SPACE_PROOF,
  W3UP_MESSAGES_SPACE_DID,
  W3UP_MESSAGES_SPACE_PROOF,
  W3UP_TASKS_SPACE_DID,
  W3UP_TASKS_SPACE_PROOF,
} from "./config.js";
import fs from "fs";
import crypto from "crypto";

export type StorachaScope = "data" | "tasks" | "messages";
const FETCH_TIMEOUT_MS = 7000;

/**
 * Create a Storacha client with the correct principal key.
 *
 * If STORACHA_AGENT_KEY is set, uses that as the agent identity.
 * Otherwise falls back to auto-generated key (may fail if proof
 * audience doesn't match).
 */
async function createClient() {
  if (STORACHA_AGENT_KEY) {
    const principal = Signer.parse(STORACHA_AGENT_KEY);
    const store = new StoreMemory();
    return create({ principal, store });
  }

  return create();
}

function resolveSpace(scope: StorachaScope): { did: string; proof: string } {
  if (scope === "data") {
    return { did: W3UP_DATA_SPACE_DID, proof: W3UP_DATA_SPACE_PROOF };
  }

  if (scope === "tasks") {
    return { did: W3UP_TASKS_SPACE_DID, proof: W3UP_TASKS_SPACE_PROOF };
  }

  return { did: W3UP_MESSAGES_SPACE_DID, proof: W3UP_MESSAGES_SPACE_PROOF };
}

async function ensureSpace(
  client: Awaited<ReturnType<typeof create>>,
  scope: StorachaScope
) {
  const { did, proof } = resolveSpace(scope);
  const proofStr = proof;
  if (!proofStr) {
    throw new Error(
      `No Storacha delegation proof configured for "${scope}" uploads. Set W3UP_${scope.toUpperCase()}_SPACE_PROOF.`
    );
  }

  const delegation = await Proof.parse(proofStr);
  const space = await client.addSpace(delegation);
  const targetDid = (did || space.did()) as `did:${string}:${string}`;
  const currentDid = currentSpaceDid(client);

  if (currentDid !== targetDid) {
    await client.setCurrentSpace(targetDid);
  }
}

function normalizeGateway(base: string): string {
  return base.endsWith("/") ? base : `${base}/`;
}

function currentSpaceDid(client: Awaited<ReturnType<typeof create>>): string | undefined {
  const current = client.currentSpace() as unknown;
  if (!current) {
    return undefined;
  }
  if (typeof current === "string") {
    return current;
  }
  if (typeof (current as { did?: () => string }).did === "function") {
    return (current as { did: () => string }).did();
  }
  return undefined;
}

export async function uploadJson(
  data: Record<string, unknown>,
  scope: StorachaScope = "data"
): Promise<string> {
  if (process.env.PAPERCLIP_STORACHA_MOCK === "1") {
    const payload = JSON.stringify(data);
    const hash = crypto.createHash("sha256").update(payload).digest("hex");
    return `mock-${hash.slice(0, 16)}`;
  }

  const client = await createClient();
  await ensureSpace(client, scope);

  const payload = JSON.stringify(data, null, 2);
  const file = new File([payload], "proof.json", {
    type: "application/json",
  });
  const cid = await client.uploadFile(file);
  return typeof cid === "string" ? cid : cid.toString();
}

export async function fetchJson(cid: string): Promise<unknown> {
  if (process.env.PAPERCLIP_STORACHA_MOCK === "1") {
    const inline = process.env.PAPERCLIP_MOCK_TASK_JSON;
    if (inline) {
      return JSON.parse(inline);
    }
    const path = process.env.PAPERCLIP_MOCK_TASK_JSON_PATH;
    if (path && fs.existsSync(path)) {
      return JSON.parse(fs.readFileSync(path, "utf8"));
    }
    return { mock: true, cid };
  }

  const base = normalizeGateway(STORACHA_GATEWAY_URL);
  const url = `${base}${cid}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const res = await fetch(url, { signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch CID ${cid}: ${res.status}`);
  }
  return res.json();
}
