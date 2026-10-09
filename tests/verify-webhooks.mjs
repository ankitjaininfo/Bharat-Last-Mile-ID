import { createHash, createPublicKey, verify } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(testsDir, "webhooks", "gate-check-in");
const source = JSON.parse(await readFile(path.join(fixtureDir, "source.json"), "utf8"));
const fixture = JSON.parse(await readFile(path.join(fixtureDir, "fixture.json"), "utf8"));
const jwks = JSON.parse(await readFile(path.join(testsDir, "keys", "jwks.json"), "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const field of ["id", "title", "description", "event", "source_metadata", "receiver_metadata"]) {
  assert(JSON.stringify(fixture[field]) === JSON.stringify(source[field]), `webhook fixture ${field} differs from source.json`);
}

const body = JSON.stringify(source.event);
assert(fixture.request.body === body, "webhook body is not the exact compact serialization of the source event");
assert(Buffer.byteLength(body, "utf8") <= 65536, "webhook body exceeds 64 KiB");
assert(fixture.request.method === "POST", "webhook method must be POST");
assert(fixture.request.headers["content-type"] === "application/cloudevents+json", "webhook content type is invalid");

const expectedDigest = `sha-256=:${createHash("sha256").update(body, "utf8").digest("base64")}:`;
assert(fixture.request.headers["content-digest"] === expectedDigest, "webhook Content-Digest is invalid");

const sourceUrl = new URL(source.event.source);
assert(sourceUrl.protocol === "https:", "event source must use HTTPS");
assert(sourceUrl.username === "" && sourceUrl.password === "", "event source contains user information");
assert(sourceUrl.port === "" && sourceUrl.pathname === "/" && sourceUrl.search === "" && sourceUrl.hash === "", "event source must be an HTTPS origin without an explicit port");
assert(sourceUrl.hostname === source.source_metadata.domain, "event source does not match source metadata domain");

const receiverUrl = new URL(source.receiver_metadata.event_receiver.uri);
assert(receiverUrl.host === source.request.authority, "webhook authority differs from receiver metadata");
assert(receiverUrl.pathname === source.request.path && receiverUrl.search === "", "webhook path differs from receiver metadata");
assert(source.receiver_metadata.event_receiver.types_supported.includes("gate_check_in"), "receiver metadata does not support gate_check_in");

assert(source.request.expires > source.request.created, "signature expiry must follow signature creation");
assert(source.request.expires - source.request.created <= 300, "signature validity exceeds 300 seconds");
const coveredComponents = "(\"@method\" \"@authority\" \"@path\" \"content-type\" \"content-digest\")";
const signatureParameters = `${coveredComponents};created=${source.request.created};expires=${source.request.expires};keyid=\"${source.request.keyid}\";tag=\"lmid-gate-check-in\"`;
assert(fixture.request.headers["signature-input"] === `lmid=${signatureParameters}`, "Signature-Input is invalid");

const expectedSignatureBase = [
  `\"@method\": ${source.request.method}`,
  `\"@authority\": ${source.request.authority}`,
  `\"@path\": ${source.request.path}`,
  `\"content-type\": ${fixture.request.headers["content-type"]}`,
  `\"content-digest\": ${fixture.request.headers["content-digest"]}`,
  `\"@signature-params\": ${signatureParameters}`
].join("\n");
assert(fixture.signature_base === expectedSignatureBase, "webhook signature base is invalid");

const signatureMatch = /^lmid=:([A-Za-z0-9+/]+={0,2}):$/.exec(fixture.request.headers.signature);
assert(signatureMatch, "Signature field is not the required lmid byte sequence");
const signature = Buffer.from(signatureMatch[1], "base64");
assert(signature.length === 64, "HTTP message signature must be a 64-byte P-256 signature");
const jwk = jwks.keys.find((key) => key.kid === source.request.keyid);
assert(jwk, "webhook signing key is absent from the discovered JWK Set");
const valid = verify(
  "sha256",
  Buffer.from(expectedSignatureBase, "ascii"),
  { key: createPublicKey({ key: jwk, format: "jwk" }), dsaEncoding: "ieee-p1363" },
  signature
);
assert(valid, "HTTP message signature verification failed");

assert(source.event.type === "gate_check_in", "event type must be gate_check_in");
assert(Number.isFinite(Date.parse(source.event.time)), "event time is invalid");
assert(source.event.data.deliveries.length >= 1 && source.event.data.deliveries.length <= 32, "event delivery count is invalid");
const refs = source.event.data.deliveries.map((delivery) => delivery.ref);
assert(new Set(refs).size === refs.length, "event contains duplicate delivery references");

console.log("Verified 1 signed LMID gate_check_in webhook fixture.");
