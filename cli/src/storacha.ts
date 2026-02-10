import { create } from "@storacha/client";
import { StoreMemory } from "@storacha/client/stores/memory";
import * as Proof from "@storacha/client/proof";
import { Signer } from "@storacha/client/principal/ed25519";
import { File } from "@web-std/file";
import {
  STORACHA_GATEWAY_URL,
  STORACHA_AGENT_KEY,
  W3UP_SPACE_DID,
  W3UP_SPACE_PROOF,
} from "./config.js";
import fs from "fs";
import crypto from "crypto";

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

async function ensureSpace(client: Awaited<ReturnType<typeof create>>) {
  const current = client.currentSpace();
  if (current) {
    return;
  }

  const proofStr = W3UP_SPACE_PROOF;
  if (!proofStr) {
    throw new Error("W3UP_SPACE_PROOF is required to upload to Storacha");
  }

  const delegation = await Proof.parse(proofStr);
  const space = await client.addSpace(delegation);
  const spaceDid = (W3UP_SPACE_DID || space.did()) as `did:${string}:${string}`;
  await client.setCurrentSpace(spaceDid);
}

function normalizeGateway(base: string): string {
  return base.endsWith("/") ? base : `${base}/`;
}

export async function uploadJson(
  data: Record<string, unknown>
): Promise<string> {
  if (process.env.PAPERCLIP_STORACHA_MOCK === "1") {
    const payload = JSON.stringify(data);
    const hash = crypto.createHash("sha256").update(payload).digest("hex");
    return `mock-${hash.slice(0, 16)}`;
  }

  const client = await createClient();
  await ensureSpace(client);

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
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch CID ${cid}: ${res.status}`);
  }
  return res.json();
}
