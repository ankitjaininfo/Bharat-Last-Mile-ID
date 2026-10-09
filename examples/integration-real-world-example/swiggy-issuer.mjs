#!/usr/bin/env node
// Edit these synthetic operational inputs to try an adopter's delivery workflow.
// Place and endpoint values model customer-entered destination data. Signing
// protects their source and integrity; it does not establish address accuracy.
export const DELIVERY_INSTRUCTIONS = {
  issuer: "swiggy.example", displayName: "Swiggy (simulated)",
  holder: { name: "Ramesh Kumar" },
  vehicle: { country: "IN", registration: "KA 01 AB 1234" },
  place: {
    name: "Aparna Serene Park",
    address: "Masjid Banda Main Rd, Kondapur",
    country: "IN", state: "Telangana", city: "Hyderabad", postal_code: "500084",
    place_ids: [{ provider: "google-places", id: "ChIJk1qMgACTyzsRmIKsCPIhMuM" }]
  },
  deliveries: [{ ref: "demo-order-1428", building: "R", unit: "1204" }],
  assignmentConfirmed: true, pickupConfirmed: true,
  gateInstructions: "Use the main gate; complete the existing guard and resident approval process.",
  validitySeconds: 1800
};

import { createPrivateKey, createPublicKey, randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseArgs } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { issueToken, parseToken, requireRule, ProtocolError } from "./protocol.mjs";
import { writeQr } from "./qr.mjs";

// This dedicated, intentionally public LMID test key models a previously
// published key. A real issuer must use its own managed, pre-published key.
const TEST_KEY = new URL("../../tests/keys/test-private-key.pem", import.meta.url);
export const DEFAULT_OUTPUT = fileURLToPath(new URL("./output/", import.meta.url));

export function createPasses(instructions, key, { now = Math.floor(Date.now() / 1000), kid = "test-key-01" } = {}) {
  requireRule(instructions.assignmentConfirmed && instructions.pickupConfirmed, "ineligible_delivery");
  requireRule(instructions.deliveries.length > 0, "invalid_claims");
  requireRule(new Set(instructions.deliveries.map(item => item.ref)).size === instructions.deliveries.length, "invalid_claims");
  const passes = [];
  let batch = [];
  function make(deliveries) {
    const payload = {
      iss: instructions.issuer, iat: now, nbf: now, exp: now + instructions.validitySeconds,
      jti: randomUUID(), lmid: {
        v: 1, holder: instructions.holder, ...(instructions.vehicle ? { vehicle: instructions.vehicle } : {}),
        visit: { place: instructions.place, deliveries }
      }
    };
    return { payload, token: issueToken(payload, key, kid) };
  }
  // Split without truncating fields or silently dropping delivery entries.
  for (const delivery of instructions.deliveries) {
    if (batch.length === 32) { passes.push(make(batch)); batch = []; }
    try { make([...batch, delivery]); }
    catch (error) {
      if (error.code !== "token_too_large" || batch.length === 0) throw error;
      passes.push(make(batch)); batch = [];
      make([delivery]);
    }
    batch.push(delivery);
  }
  if (batch.length) passes.push(make(batch));
  return passes;
}

export async function main() {
  const { values } = parseArgs({ options: {
    output: { type: "string", default: DEFAULT_OUTPUT }, key: { type: "string" },
    issuer: { type: "string" }, kid: { type: "string" }, "published-at": { type: "string" },
    help: { type: "boolean" }
  } });
  if (values.help) {
    console.log("node examples/integration-real-world-example/swiggy-issuer.mjs [--output DIR]\nLive signing: --key PEM --issuer DOMAIN --kid ID --published-at UNIX_SECONDS");
    return;
  }
  const demo = !values.key;
  const now = Math.floor(Date.now() / 1000);
  if (!demo) {
    requireRule(values.issuer && values.kid && Number.isSafeInteger(Number(values["published-at"])) &&
      now - Number(values["published-at"]) >= 86400, "key_not_prepublished");
  } else requireRule(!values.issuer && !values.kid && !values["published-at"], "invalid_demo_configuration");
  const instructions = structuredClone(DELIVERY_INSTRUCTIONS);
  if (!demo) instructions.issuer = values.issuer;
  const key = createPrivateKey(await readFile(demo ? TEST_KEY : values.key));
  requireRule(key.asymmetricKeyType === "ec" && key.asymmetricKeyDetails.namedCurve === "prime256v1", "invalid_signing_key");
  const kid = values.kid ?? "test-key-01";
  const passes = createPasses(instructions, key, { now, kid });
  await mkdir(values.output, { recursive: true, mode: 0o700 });
  const metadata = {
    domain: instructions.issuer, display_name: demo ? instructions.displayName : instructions.issuer,
    roles: ["issuer"], jwks_uri: `https://${instructions.issuer}/.well-known/bharat-last-mile-id.jwks`,
    versions_supported: [1], token_types_supported: ["lmid+jwt"]
  };
  await writeFile(path.join(values.output, "metadata.json"), JSON.stringify(metadata, null, 2));
  await writeFile(path.join(values.output, "jwks.json"), JSON.stringify({ keys: [{
    ...createPublicKey(key).export({ format: "jwk" }), kid, use: "sig", alg: "ES256"
  }] }, null, 2));
  if (demo) {
    await promisify(execFile)("openssl", ["req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-256",
      "-noenc", "-keyout", path.join(values.output, "tls-key.pem"), "-out", path.join(values.output, "tls-cert.pem"),
      "-days", "2", "-subj", "/CN=swiggy.example", "-addext", "subjectAltName=DNS:swiggy.example"]);
  }
  for (const [index, pass] of passes.entries()) {
    const file = path.join(values.output, index === 0 ? "pass.png" : `pass-${index + 1}.png`);
    const qr = await writeQr(file, pass.token);
    // CLI display: show the decoded pass separately from generation details.
    // Never print the complete compact token or signing keys.
    const { header, payload } = parseToken(pass.token);
    console.log(JSON.stringify({
      file, deliveries: payload.lmid.visit.deliveries.length, bytes: Buffer.byteLength(pass.token), qr, demo,
      decodedPass: { header, payload }
    }, null, 2));
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(JSON.stringify({ error: error instanceof ProtocolError ? error.code : "issuance_failed" })); process.exitCode = 1; });
}
