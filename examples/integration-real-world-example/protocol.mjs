import { createPublicKey, sign, verify } from "node:crypto";
import { readFile } from "node:fs/promises";
import Ajv from "ajv/dist/2020.js";
import { parseTree } from "jsonc-parser";

export class ProtocolError extends Error {
  constructor(code) { super(code); this.code = code; }
}
export function requireRule(value, code) {
  if (!value) throw new ProtocolError(code);
}

// JSON.parse alone silently accepts duplicate members, including escaped names.
export function strictJson(bytes) {
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new ProtocolError("invalid_json"); }
  requireRule(!text.startsWith("\uFEFF"), "invalid_json");
  const errors = [];
  const tree = parseTree(text, errors, { allowTrailingComma: false, disallowComments: true });
  requireRule(tree && !errors.length, "invalid_json");
  function walk(node) {
    if (node.type === "object") {
      const names = new Set();
      for (const property of node.children ?? []) {
        const name = property.children[0].value;
        requireRule(!names.has(name), "duplicate_json_member");
        names.add(name);
      }
    }
    for (const child of node.children ?? []) walk(child);
  }
  walk(tree);
  requireRule(tree.type === "object", "invalid_json");
  // Use ordinary JSON objects after syntax/duplicate checks. AJV's uniqueItems
  // comparison does not handle jsonc-parser's null-prototype object values.
  return JSON.parse(text);
}

const ajv = new Ajv({ strict: true, strictRequired: false, validateFormats: false });
const schemas = {};
for (const [name, file] of Object.entries({
  header: "lmid-jws-header", payload: "lmid-pass-payload", metadata: "lmid-participant-metadata"
})) {
  schemas[name] = ajv.compile(JSON.parse(await readFile(new URL(`../../schemas/${file}.schema.json`, import.meta.url))));
}
export function schema(name, value, code) { requireRule(schemas[name](value), code); }
export function base64url(value) {
  requireRule(typeof value === "string" && /^[A-Za-z0-9_-]+$/.test(value), "invalid_base64url");
  const bytes = Buffer.from(value, "base64url");
  requireRule(bytes.toString("base64url") === value, "invalid_base64url");
  return bytes;
}
export function textProfile(value) {
  requireRule(value === value.normalize("NFC") && value.trim() === value, "invalid_claims");
  for (const character of value) {
    const n = character.codePointAt(0);
    requireRule(!(n <= 31 || (n >= 127 && n <= 159) || n === 0x2028 || n === 0x2029 ||
      (n >= 0x202a && n <= 0x202e) || (n >= 0x2066 && n <= 0x2069) ||
      (n >= 0xd800 && n <= 0xdfff) || (n >= 0xfdd0 && n <= 0xfdef) || (n & 0xffff) >= 0xfffe), "invalid_claims");
  }
}
export function httpsUrl(value) {
  requireRule(typeof value === "string" && !/[\s#]/u.test(value), "invalid_claims");
  let url;
  try { url = new URL(value); } catch { throw new ProtocolError("invalid_claims"); }
  requireRule(url.protocol === "https:" && !url.username && !url.password && !url.hash, "invalid_claims");
  requireRule(!value.split("/")[2]?.includes("@"), "invalid_claims");
  return url;
}
export function validateMetadata(value, issuer) {
  schema("metadata", value, "metadata_unavailable");
  requireRule(value.domain === issuer, "metadata_domain_mismatch");
  requireRule(value.roles.includes("issuer") && value.versions_supported.includes(1) &&
    value.token_types_supported?.includes("lmid+jwt"), "metadata_unavailable");
  textProfile(value.display_name);
  httpsUrl(value.jwks_uri);
  for (const origin of value.photo_origins ?? []) {
    const url = httpsUrl(origin);
    requireRule(!url.search && url.pathname === "/", "metadata_unavailable");
  }
  if (value.event_receiver) httpsUrl(value.event_receiver.uri);
}
export function parseToken(token) {
  requireRule(Buffer.byteLength(token) <= 2048, "token_too_large");
  requireRule(/^[\x00-\x7f]*$/.test(token), "malformed_qr");
  const parts = token.split(".");
  requireRule(parts.length === 3 && parts.every(Boolean), "malformed_qr");
  const header = strictJson(base64url(parts[0]));
  const payload = strictJson(base64url(parts[1]));
  schema("header", header, "unsupported_header");
  if (payload.lmid && Object.hasOwn(payload.lmid, "v")) requireRule(payload.lmid.v === 1, "unsupported_version");
  schema("payload", payload, "invalid_claims");
  return { header, payload, parts };
}
export function validateClaims(payload, now, tolerance = 0) {
  schema("payload", payload, "invalid_claims");
  requireRule(Number.isSafeInteger(now) && Number.isInteger(tolerance) && tolerance >= 0 && tolerance <= 300, "invalid_claims");
  const { iat, nbf, exp, lmid } = payload;
  requireRule(iat <= nbf && nbf < exp && exp - iat <= 43200, "invalid_claims");
  requireRule(now + tolerance >= nbf, "not_yet_valid");
  requireRule(now - tolerance < exp, "expired");
  textProfile(lmid.holder.name);
  const place = lmid.visit.place;
  for (const key of ["name", "address", "state", "district", "city", "area", "street", "landmark", "postal_code"]) {
    if (Object.hasOwn(place, key)) textProfile(place[key]);
  }
  const refs = new Set();
  for (const delivery of lmid.visit.deliveries) {
    requireRule(!refs.has(delivery.ref), "invalid_claims");
    refs.add(delivery.ref);
    for (const key of ["building", "block"]) if (Object.hasOwn(delivery, key)) textProfile(delivery[key]);
  }
  // Google Place IDs are opaque: do not require a particular prefix or length.
  // The 256-character limit is LMID's bound, not Google's published limit.
  const patterns = {
    "google-places": /^[\x21-\x7e]{1,256}$/,
    digipin: /^[23456789CJKLMPTF]{10}$/, openstreetmap: /^(node|way|relation)\/[1-9][0-9]*$/
  };
  for (const id of place.place_ids ?? []) {
    if (patterns[id.provider]) requireRule(patterns[id.provider].test(id.id), "invalid_place_id");
  }
  if (lmid.holder.photo) httpsUrl(lmid.holder.photo.uri);
}
export function signingKey(jwks, kid) {
  requireRule(Array.isArray(jwks.keys), "key_unavailable");
  const keys = [];
  for (const jwk of jwks.keys) {
    if (jwk.kid !== kid || jwk.kty !== "EC" || jwk.crv !== "P-256" || jwk.use !== "sig" || jwk.alg !== "ES256") continue;
    if (["d", "p", "q", "dp", "dq", "qi", "oth", "k"].some(key => Object.hasOwn(jwk, key))) continue;
    if (jwk.key_ops && (!Array.isArray(jwk.key_ops) || !jwk.key_ops.includes("verify") || jwk.key_ops.some(op => op !== "verify"))) continue;
    try {
      if (base64url(jwk.x).length !== 32 || base64url(jwk.y).length !== 32) continue;
      keys.push(createPublicKey({ key: jwk, format: "jwk" }));
    } catch { /* Malformed points and encodings cannot be signing keys. */ }
  }
  requireRule(keys.length === 1, "key_unavailable");
  return keys[0];
}
export function verifySignature(parsed, key) {
  const signature = base64url(parsed.parts[2]);
  requireRule(signature.length === 64, "invalid_signature");
  requireRule(verify("sha256", Buffer.from(parsed.parts.slice(0, 2).join("."), "ascii"),
    { key, dsaEncoding: "ieee-p1363" }, signature), "invalid_signature");
}
export function issueToken(payload, key, kid) {
  validateClaims(payload, payload.iat);
  const header = { alg: "ES256", kid, typ: "lmid+jwt" };
  schema("header", header, "unsupported_header");
  const input = [header, payload].map(value => Buffer.from(JSON.stringify(value)).toString("base64url")).join(".");
  const signature = sign("sha256", Buffer.from(input, "ascii"), { key, dsaEncoding: "ieee-p1363" });
  const token = `${input}.${signature.toString("base64url")}`;
  requireRule(Buffer.byteLength(token) <= 2048, "token_too_large");
  return token;
}
