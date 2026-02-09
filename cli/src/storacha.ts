import { create } from "@web3-storage/w3up-client";
import { File } from "@web-std/file";
import { importDAG } from "@ucanto/core/delegation";
import { CarReader } from "@ipld/car";
import {
  STORACHA_GATEWAY_URL,
  W3UP_SPACE_DID,
  W3UP_SPACE_PROOF,
} from "./config";
import fs from "fs";
import crypto from "crypto";

async function ensureSpace(client: Awaited<ReturnType<typeof create>>) {
  const current = client.currentSpace();
  if (current) {
    return;
  }

  const proof = W3UP_SPACE_PROOF;
  if (!proof) {
    throw new Error("W3UP_SPACE_PROOF is required to upload to Storacha");
  }

  const bytes = Buffer.from(proof, "base64");
  const car = await CarReader.fromBytes(bytes);
  const delegation = await importDAG(car as any);
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

  const client = await create();
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
