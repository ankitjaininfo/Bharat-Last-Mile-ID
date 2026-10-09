#!/usr/bin/env node
// ADDA's local directory and policy are independent of issuer-supplied values.
// Building managers maintain the canonical endpoint labels and approved aliases.
export const GATE_CONFIGURATION = {
  acceptedIssuers: ["swiggy.example"],
  place: {
    name: "Aparna Serene Park",
    address: "Masjid Banda Main Rd, Kondapur",
    country: "IN", state: "Telangana", city: "Hyderabad", postal_code: "500084"
  },
  placeIds: [{ provider: "google-places", id: "ChIJk1qMgACTyzsRmIKsCPIhMuM" }],
  endpoints: [{ id: "local-unit-R-1204", label: "R-1204", building: "R", unit: "1204" }],
  residentApproval: "pending", entryDecision: "pending", clockTolerance: 0
};

import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { readQr } from "./qr.mjs";
import { parseToken, verifySignature, validateClaims, ProtocolError, httpsUrl, requireRule } from "./protocol.mjs";
import { Discovery, startDemoServer } from "./discovery.mjs";
import { DEFAULT_OUTPUT } from "./swiggy-issuer.mjs";

const comparison = value => value.normalize("NFC").toLowerCase().replace(/\s+/gu, " ").trim();
const escapePattern = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function permutations(values) {
  if (values.length < 2) return [values];
  return values.flatMap((value, index) => permutations(values.filter((_, i) => i !== index)).map(rest => [value, ...rest]));
}
function compoundLabelMatches(value, endpoint) {
  const fields = ["building", "block", "floor", "unit"].filter(key => typeof endpoint[key] === "string");
  if (!fields.includes("unit") || fields.length < 2) return false;
  const prefixes = { building: "building", block: "block", floor: "floor", unit: "(?:unit|flat)" };
  const tokens = fields.map(key => `(?:${prefixes[key]}\\s+)?${escapePattern(comparison(endpoint[key]))}`);
  // Match whole components in either order. Separators may differ, but suffixes
  // and punctuation inside each directory value remain significant.
  return permutations(tokens).some(parts => new RegExp(`^${parts.join("[\\s,-]+")}$`, "u").test(comparison(value)));
}
export function reconcile(place, delivery, directory) {
  const placeMatches = typeof directory.place.address === "string" && directory.place.address.trim().length > 0 && Object.keys(directory.place).every(key =>
    typeof place[key] === "string" && comparison(place[key]) === comparison(directory.place[key]));
  const supportedIds = (place.place_ids ?? []).filter(id => ["google-places", "digipin", "openstreetmap"].includes(id.provider));
  const curated = supportedIds.some(id => directory.placeIds?.some(local =>
    id.provider === local.provider && id.id === local.id));
  // A supplied supported ID must resolve; matching text cannot hide that failure.
  if (supportedIds.length && !curated) return { state: "unmatched", code: "destination_unmatched" };
  // A curated ID never overrides a conflict in an explicitly supplied field.
  if (curated && Object.keys(directory.place).some(key => Object.hasOwn(place, key) &&
    comparison(place[key]) !== comparison(directory.place[key]))) return { state: "conflict", code: "destination_conflict" };
  if (!placeMatches && !curated) return { state: "unmatched", code: "destination_unmatched" };
  const keys = ["building", "block", "floor", "unit"].filter(key => Object.hasOwn(delivery, key));
  // Parse against actual local records; do not guess a building from a number.
  // Curated aliases remain available for formats outside this small grammar.
  const compoundMatches = directory.endpoints.filter(endpoint => typeof delivery.unit === "string" &&
    (compoundLabelMatches(delivery.unit, endpoint) ||
      [endpoint.label, ...(endpoint.aliases ?? [])].filter(Boolean).some(label => comparison(label) === comparison(delivery.unit))) &&
    keys.filter(key => key !== "unit").every(key => typeof endpoint[key] === "string" &&
      comparison(endpoint[key]) === comparison(delivery[key])));
  if (compoundMatches.length === 1) return {
    state: "exact", code: "destination_exact", localId: compoundMatches[0].id,
    localLabel: compoundMatches[0].label,
    evidence: compoundLabelMatches(delivery.unit, compoundMatches[0]) ? "deterministic_compound_label" : "property_approved_alias"
  };
  if (compoundMatches.length > 1) return {
    state: "suggested", code: "destination_suggested", candidates: compoundMatches.map(item => item.id)
  };
  const candidates = directory.endpoints.filter(endpoint => keys.every(key =>
    typeof endpoint[key] === "string" && comparison(endpoint[key]) === comparison(delivery[key])));
  // A supplied unit may uniquely identify a record in this known property.
  // Local components remain local facts; they are not added to the signed data.
  const complete = candidates.filter(endpoint => Object.hasOwn(delivery, "unit") ||
    (!Object.hasOwn(endpoint, "unit") && ["building", "block", "floor"].every(key =>
      !Object.hasOwn(endpoint, key) || Object.hasOwn(delivery, key))));
  if (complete.length === 1 && candidates.length === 1) return { state: "exact", code: "destination_exact", localId: complete[0].id, localLabel: complete[0].label };
  if (candidates.length) return { state: "suggested", code: "destination_suggested", candidates: candidates.map(item => item.id) };
  return { state: "unmatched", code: "destination_unmatched" };
}

export async function verifyPass(token, discovery, { now = Math.floor(Date.now() / 1000), config = GATE_CONFIGURATION } = {}) {
  const parsed = parseToken(token);
  const { metadata, key } = await discovery.discover(parsed.payload.iss, parsed.header.kid);
  verifySignature(parsed, key);
  validateClaims(parsed.payload, now, config.clockTolerance);
  const { holder, vehicle, visit } = parsed.payload.lmid;
  if (holder.photo) {
    const origin = httpsUrl(holder.photo.uri).origin;
    requireRule((origin === `https://${parsed.payload.iss}` && !holder.photo.uri.split("/")[2].includes(":")) ||
      (metadata.photo_origins ?? []).some(value => httpsUrl(value).origin === origin), "invalid_claims");
  }
  const accepted = config.acceptedIssuers.includes(parsed.payload.iss);
  const destinations = visit.deliveries.map(delivery => ({
    signed: { ...visit.place, ...delivery }, match: reconcile(visit.place, delivery, config)
  }));
  const resolved = destinations.every(item => item.match.state === "exact");
  return {
    signature: "signature_verified", policy: accepted ? "policy_accepted" : "policy_denied",
    issuer: { displayName: metadata.display_name, domain: metadata.domain },
    holder: { name: holder.name }, photo: holder.photo ? "not_requested" : "not_supplied",
    ...(vehicle ? { vehicle } : {}), deliveryCount: visit.deliveries.length, destinations,
    idCard: !resolved ? { status: "rejected", reason: "unit_not_found" }
      : !accepted ? { status: "rejected", reason: "policy_denied" } : { status: "resolved" },
    approval: config.residentApproval, entry: config.entryDecision,
    manualEntryAvailable: true,
    workflow: accepted && resolved ? "autofill_ready" : "manual_handling"
  };
}

export async function main() {
  const { values } = parseArgs({ options: {
    file: { type: "string", default: path.join(DEFAULT_OUTPUT, "pass.png") },
    directory: { type: "string", default: DEFAULT_OUTPUT },
    cache: { type: "string" }, offline: { type: "boolean" }, online: { type: "boolean" },
    help: { type: "boolean" }
  } });
  if (values.help) {
    console.log("node examples/integration-real-world-example/adda-reader.mjs [--file PNG] [--directory DIR] [--cache DIR] [--offline] [--online]\nDefault: isolated local HTTPS demo. --online: public HTTPS discovery/cache, without demo routing or CA. Add --offline for cached public verification.");
    return;
  }
  const demo = !values.online;
  const cacheDir = values.cache ?? path.join(values.directory, demo ? "demo-cache" : "online-cache");
  let service;
  try {
    const token = await readQr(values.file);
    if (demo && !values.offline) service = await startDemoServer(values.directory);
    const discovery = new Discovery({ cacheDir, offline: values.offline, demo: service, realm: demo ? "demo" : "public_https" });
    const result = await verifyPass(token, discovery);
    console.log(JSON.stringify({ verifier: "ADDA (simulated)", transport: demo ? "demo" : "public_https", ...result }, null, 2));
    if (result.workflow === "manual_handling") process.exitCode = 2;
  } finally {
    if (service) await new Promise((resolve, reject) => service.server.close(error => error ? reject(error) : resolve()));
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(JSON.stringify({ error: error instanceof ProtocolError ? error.code : "reader_failed", signature: "not_verified", manualEntryAvailable: true }));
    process.exitCode = 1;
  });
}
