import test from "node:test";
import assert from "node:assert/strict";
import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import { readFile, writeFile, mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import QRCode from "qrcode";
import { PNG } from "pngjs";
import { issueToken, parseToken, validateClaims, signingKey, strictJson, verifySignature } from "../examples/integration-real-world-example/protocol.mjs";
import { readQr, writeQr } from "../examples/integration-real-world-example/qr.mjs";
import { Discovery, fetchDocument, resolvePublic, startDemoServer } from "../examples/integration-real-world-example/discovery.mjs";
import { DELIVERY_INSTRUCTIONS, createPasses } from "../examples/integration-real-world-example/swiggy-issuer.mjs";
import { GATE_CONFIGURATION, verifyPass, reconcile } from "../examples/integration-real-world-example/adda-reader.mjs";

const run = promisify(execFile);
const root = new URL("../", import.meta.url);
const key = createPrivateKey(await readFile(new URL("keys/test-private-key.pem", import.meta.url)));
const jwk = { ...createPublicKey(key).export({ format: "jwk" }), kid: "test-key-01", use: "sig", alg: "ES256" };
const now = Math.floor(Date.now() / 1000);
const instructions = structuredClone(DELIVERY_INSTRUCTIONS);
const payload = createPasses(instructions, key, { now })[0].payload;
const header = { alg: "ES256", kid: jwk.kid, typ: "lmid+jwt" };
function rawToken(claims, protectedHeader = header) {
  const input = [protectedHeader, claims].map(value => Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url")).join(".");
  return `${input}.${sign("sha256", Buffer.from(input), { key, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
}
const errorCode = code => error => error.code === code;
const stub = { discover: async () => ({
  key: createPublicKey(key), metadata: { domain: payload.iss, display_name: "Swiggy (simulated)" }
}) };

test("JavaScript issuer and reader: protocol, QR, discovery, and local workflow", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "lmid-example-"));
  t.after(() => rm(directory, { recursive: true, force: true }));

  await t.test("two default CLIs exchange an actual PNG through authenticated HTTPS", async () => {
    const issuer = await run(process.execPath, [new URL("examples/integration-real-world-example/swiggy-issuer.mjs", root).pathname, "--output", directory]);
    const summary = JSON.parse(issuer.stdout);
    assert(summary.bytes <= 2048);
    assert.equal(summary.qr.pixelsPerModule, 6);
    const image = PNG.sync.read(await readFile(summary.file));
    assert.equal(image.width, (summary.qr.modules + 8) * 6);
    const token = await readQr(summary.file);
    const parsed = parseToken(token);
    assert.deepEqual(summary.decodedPass, { header: parsed.header, payload: parsed.payload });
    assert.equal(parsed.payload.lmid.visit.place.place_ids[0].id, "ChIJk1qMgACTyzsRmIKsCPIhMuM");
    for (const field of ["transport", "policy", "deliveryCount"]) assert(!Object.hasOwn(summary.decodedPass.payload, field));
    const { stdout } = await run(process.execPath, [new URL("examples/integration-real-world-example/adda-reader.mjs", root).pathname,
      "--file", summary.file, "--directory", directory]);
    const result = JSON.parse(stdout);
    assert.equal(result.signature, "signature_verified");
    assert.equal(result.destinations[0].match.localId, "local-unit-R-1204");
    assert.equal(result.approval, "pending");
    assert.equal(result.entry, "pending");
    assert.equal(result.idCard.status, "resolved");
    assert(!issuer.stdout.includes(token) && !stdout.includes(token));
    const offline = await run(process.execPath, [new URL("examples/integration-real-world-example/adda-reader.mjs", root).pathname,
      "--file", summary.file, "--directory", directory, "--offline"]);
    assert.equal(JSON.parse(offline.stdout).signature, "signature_verified");
  });

  await t.test("independently generated repository fixtures all verify", async () => {
    for (const scenario of await readdir(new URL("scenarios/", import.meta.url))) {
      const fixture = JSON.parse(await readFile(new URL(`scenarios/${scenario}/case.json`, import.meta.url)));
      const parsed = parseToken(fixture.token);
      verifySignature(parsed, signingKey({ keys: [jwk] }, parsed.header.kid));
      validateClaims(parsed.payload, fixture.verification_time, 300);
    }
  });

  await t.test("oversize, padding, non-ASCII, and non-canonical base64url rejected", () => {
    assert.throws(() => parseToken("a".repeat(2049)), errorCode("token_too_large"));
    assert.throws(() => parseToken("a=.b.c"), errorCode("invalid_base64url"));
    assert.throws(() => parseToken("é.b.c"), errorCode("malformed_qr"));
    assert.throws(() => parseToken("A.b.c"), errorCode("invalid_base64url"));
  });
  await t.test("strict JSON rejects nested/escaped duplicates, BOM, comments, and invalid UTF-8", () => {
    for (const text of ['{"a":1,"\\u0061":2}', '{"nested":{"x":1,"x":2}}']) {
      assert.throws(() => strictJson(Buffer.from(text)), errorCode("duplicate_json_member"));
    }
    for (const value of [Buffer.from('\uFEFF{}'), Buffer.from('{"x":1,}'), Buffer.from('{/*comment*/}'), Buffer.from([0xff])]) {
      assert.throws(() => strictJson(value), errorCode("invalid_json"));
    }
  });
  await t.test("unknown claims, wrong algorithms, compression, version, domain rejected before discovery", () => {
    assert.throws(() => parseToken(rawToken({ ...payload, phone: "not-allowed" })), errorCode("invalid_claims"));
    assert.throws(() => parseToken(rawToken(payload, { ...header, alg: "HS256" })), errorCode("unsupported_header"));
    assert.throws(() => parseToken(rawToken(payload, { ...header, zip: "DEF" })), errorCode("unsupported_header"));
    assert.throws(() => parseToken(rawToken({ ...payload, lmid: { ...payload.lmid, v: 2 } })), errorCode("unsupported_version"));
    assert.throws(() => parseToken(rawToken({ ...payload, iss: "Swiggy.example" })), errorCode("invalid_claims"));
  });
  await t.test("tampering fails while JSON member ordering is not canonicalized", async () => {
    const token = rawToken(payload);
    const parts = token.split(".");
    parts[2] = (parts[2][0] === "A" ? "B" : "A") + parts[2].slice(1);
    await assert.rejects(verifyPass(parts.join("."), stub, { now }), errorCode("invalid_signature"));
    const reversed = Object.fromEntries(Object.entries(payload).reverse());
    assert.equal((await verifyPass(rawToken(reversed), stub, { now })).signature, "signature_verified");
  });
  await t.test("expiry, not-before, maximum lifetime, and tolerance boundaries", () => {
    assert.throws(() => validateClaims(payload, payload.exp), errorCode("expired"));
    validateClaims(payload, payload.exp + 299, 300);
    assert.throws(() => validateClaims(payload, payload.exp + 300, 300), errorCode("expired"));
    assert.throws(() => validateClaims(payload, payload.nbf - 1), errorCode("not_yet_valid"));
    assert.throws(() => validateClaims({ ...payload, exp: payload.iat + 43201 }, now), errorCode("invalid_claims"));
    assert.throws(() => validateClaims(payload, now, 301), errorCode("invalid_claims"));
  });
  await t.test("Unicode normalization, noncharacters, duplicate refs, and endpoint sufficiency", () => {
    for (const name of ["e\u0301", "\u202eRamesh", "\ud800", "\ufdd0", " Ramesh"]) {
      const copy = structuredClone(payload); copy.lmid.holder.name = name;
      assert.throws(() => validateClaims(copy, now), errorCode("invalid_claims"));
    }
    const copy = structuredClone(payload);
    copy.lmid.visit.deliveries.push(copy.lmid.visit.deliveries[0]);
    assert.throws(() => validateClaims(copy, now), errorCode("invalid_claims"));
    copy.lmid.visit.deliveries = [{ ref: "delivery-1", floor: "12" }];
    assert.throws(() => validateClaims(copy, now), errorCode("invalid_claims"));
  });
  await t.test("unknown providers ignored; malformed supported values reject credential verification", () => {
    const copy = structuredClone(payload);
    copy.lmid.visit.place.place_ids = [{ provider: "unknown-provider", id: "opaque-value" }];
    validateClaims(copy, now);
    copy.lmid.visit.place.place_ids = [{ provider: "digipin", id: "invalid" }];
    assert.throws(() => validateClaims(copy, now), errorCode("invalid_place_id"));
  });
  await t.test("agreed Google provider and 256-character place-ID boundary", async () => {
    const registry = JSON.parse(await readFile(new URL("../data/place-id-providers.json", import.meta.url)));
    const google = registry.providers.find(provider => provider.id === "google-places");
    assert.equal(google.status, "active");
    assert.equal(google.example, instructions.place.place_ids[0].id);
    const copy = structuredClone(payload);
    copy.lmid.visit.place.place_ids = [{ provider: "google-places", id: "x".repeat(256) }];
    validateClaims(copy, now);
    copy.lmid.visit.place.place_ids[0].id += "x";
    assert.throws(() => validateClaims(copy, now), errorCode("invalid_claims"));
    copy.lmid.visit.place.place_ids = [{ provider: "unknown-provider", id: "x".repeat(257) }];
    assert.throws(() => validateClaims(copy, now), errorCode("invalid_claims"));
  });
  await t.test("private/duplicate/wrong-curve JWKs are not usable", () => {
    for (const keys of [[{ ...jwk, d: "private" }], [jwk, jwk], [{ ...jwk, crv: "P-384" }], [{ ...jwk, x: "AA" }]]) {
      assert.throws(() => signingKey({ keys }, jwk.kid), errorCode("key_unavailable"));
    }
  });
  await t.test("compound endpoint labels resolve deterministically without aliases or changing signed data", async () => {
    for (const unit of ["R 1204", "R-1204", "r  1204", "1204, Building R", "Building R, Flat 1204"]) {
      const copy = structuredClone(payload);
      copy.lmid.visit.deliveries = [{ ref: "delivery-1", unit }];
      const result = await verifyPass(rawToken(copy), stub, { now });
      assert.equal(result.destinations[0].match.localLabel, "R-1204");
      assert.equal(result.destinations[0].match.state, "exact");
      assert.equal(result.destinations[0].match.evidence, "deterministic_compound_label");
      assert.equal(result.destinations[0].signed.unit, unit);
      assert(!Object.hasOwn(result.destinations[0].signed, "building"));
    }
    const place = payload.lmid.visit.place;
    assert.equal(reconcile(place, { ref: "delivery-1", building: "X", unit: "R 1204" }, GATE_CONFIGURATION).state, "unmatched");
    assert.equal(reconcile(place, { ref: "delivery-1", unit: "R 1204A" }, GATE_CONFIGURATION).state, "unmatched");
    assert.equal(reconcile(place, { ref: "delivery-1", unit: "1204, Block R" }, GATE_CONFIGURATION).state, "unmatched");
    const blockDirectory = { ...GATE_CONFIGURATION, endpoints: [{ id: "block-R-1204", block: "R", unit: "1204" }] };
    assert.equal(reconcile(place, { ref: "delivery-1", unit: "1204, Block R" }, blockDirectory).state, "exact");
    assert.equal(reconcile(place, { ref: "delivery-1", unit: "1204" }, GATE_CONFIGURATION).state, "exact");
    const ambiguous = { ...GATE_CONFIGURATION, endpoints: [...GATE_CONFIGURATION.endpoints,
      { id: "duplicate-record", building: "R", unit: "1204" }] };
    assert.equal(reconcile(place, { ref: "delivery-1", unit: "R 1204" }, ambiguous).state, "suggested");
  });
  await t.test("policy denial does not change signature result or grant entry", async () => {
    const config = { ...GATE_CONFIGURATION, acceptedIssuers: [] };
    const result = await verifyPass(rawToken(payload), stub, { now, config });
    assert.equal(result.signature, "signature_verified"); assert.equal(result.policy, "policy_denied");
    assert.equal(result.workflow, "manual_handling"); assert.equal(result.entry, "pending");
  });
  await t.test("failed building or unit resolution rejects the ID card while preserving signature state", async () => {
    const unknownUnit = structuredClone(payload);
    unknownUnit.lmid.visit.deliveries[0].unit = "9999";
    const unknownPlace = structuredClone(payload);
    unknownPlace.lmid.visit.place.place_ids[0].id = "another-opaque-place-id";
    const batch = structuredClone(payload);
    batch.lmid.visit.deliveries.push({ ref: "delivery-missing", building: "R", unit: "9999" });
    const incomplete = structuredClone(payload);
    incomplete.lmid.visit.deliveries = [{ ref: "delivery-1", building: "R" }];
    for (const claims of [unknownUnit, unknownPlace, batch, incomplete]) {
      const result = await verifyPass(rawToken(claims), stub, { now });
      assert.equal(result.signature, "signature_verified");
      assert.deepEqual(result.idCard, { status: "rejected", reason: "unit_not_found" });
      assert.equal(result.workflow, "manual_handling");
      assert.equal(result.entry, "pending");
    }
  });
  await t.test("reconciliation preserves suffixes, signed strings, missing fields, and ID conflicts", () => {
    const { place, deliveries } = payload.lmid.visit;
    assert.equal(reconcile(place, { ...deliveries[0], unit: "1204A" }, GATE_CONFIGURATION).state, "unmatched");
    assert.equal(reconcile(place, { ref: "delivery-1", building: "R" }, GATE_CONFIGURATION).state, "suggested");
    assert.equal(reconcile({ ...place, city: "Different City" }, deliveries[0], GATE_CONFIGURATION).state, "conflict");
    assert.equal(deliveries[0].unit, "1204");
    const nameOnlyDirectory = { ...GATE_CONFIGURATION, place: { name: place.name }, placeIds: [] };
    assert.equal(reconcile({ name: place.name }, deliveries[0], nameOnlyDirectory).state, "unmatched");
    const addressOnly = structuredClone(place);
    delete addressOnly.place_ids;
    assert.equal(reconcile(addressOnly, deliveries[0], GATE_CONFIGURATION).state, "exact");
  });
  await t.test("optional photo not fetched; disallowed origin rejected", async () => {
    const copy = structuredClone(payload);
    copy.lmid.holder.photo = { uri: "https://swiggy.example/photo.png", sha256: "0".repeat(64) };
    assert.equal((await verifyPass(rawToken(copy), stub, { now })).photo, "not_requested");
    copy.lmid.holder.photo.uri = "https://foreign.example/photo.png";
    await assert.rejects(verifyPass(rawToken(copy), stub, { now }), errorCode("invalid_claims"));
  });
  await t.test("batch splitting keeps all entries and respects size; ineligible issuance refused", () => {
    const batch = { ...instructions, deliveries: Array.from({ length: 40 }, (_, i) => ({ ref: `delivery-${i}`, building: "R", unit: `${1204 + i}` })) };
    const passes = createPasses(batch, key, { now });
    assert(passes.length > 1);
    assert.equal(passes.flatMap(pass => pass.payload.lmid.visit.deliveries).length, 40);
    for (const pass of passes) assert(Buffer.byteLength(pass.token) <= 2048 && pass.payload.lmid.visit.deliveries.length <= 32);
    assert.throws(() => createPasses({ ...instructions, pickupConfirmed: false }, key), errorCode("ineligible_delivery"));
  });
  await t.test("decoder handles all Model 2 versions 1..40, rejects non-M and non-byte symbols", async () => {
    const file = path.join(directory, "profile.png");
    for (let version = 1; version <= 40; version++) {
      await QRCode.toFile(file, [{ data: "abc", mode: "byte" }], { version, errorCorrectionLevel: "M", scale: 4, margin: 4 });
      assert.equal(await readQr(file), "abc");
    }
    await QRCode.toFile(file, [{ data: "abc", mode: "byte" }], { errorCorrectionLevel: "H", scale: 4 });
    await assert.rejects(readQr(file), errorCode("malformed_qr"));
    await QRCode.toFile(file, [{ data: "123456789", mode: "numeric" }], { errorCorrectionLevel: "M", scale: 4 });
    await assert.rejects(readQr(file), errorCode("malformed_qr"));
    const token = rawToken(payload);
    await writeQr(file, token);
    assert.equal(await readQr(file), token);
  });
  await t.test("public discovery blocks private addresses and unsafe/origin-changing URLs", async () => {
    for (const host of ["127.0.0.1", "::1", "10.0.0.1", "169.254.169.254", "::ffff:127.0.0.1"]) {
      await assert.rejects(resolvePublic(host), errorCode("metadata_unavailable"));
    }
    for (const url of ["http://swiggy.example/", "https://user:secret@swiggy.example/", "https://swiggy.example/#fragment"]) {
      await assert.rejects(fetchDocument(url, { limit: 64, origins: ["https://swiggy.example"] }));
    }
    await assert.rejects(fetchDocument("https://foreign.example/", { limit: 64, origins: ["https://swiggy.example"] }), errorCode("metadata_unavailable"));
  });
  await t.test("HTTPS authentication, metadata binding, bounded responses, cache expiry, and rotation", async () => {
    const service = await startDemoServer(directory);
    const cacheDir = path.join(directory, "cache-tests");
    try {
      await assert.rejects(fetchDocument("https://swiggy.example/.well-known/bharat-last-mile-id", {
        origins: ["https://swiggy.example"], limit: 65536, demo: { ...service, ca: undefined }
      }));
      await assert.rejects(fetchDocument("https://swiggy.example/.well-known/bharat-last-mile-id", {
        origins: ["https://swiggy.example"], limit: 10, demo: service
      }));
      const discovery = new Discovery({ cacheDir, demo: service, realm: "demo" });
      await discovery.discover(payload.iss, jwk.kid);
      const metadataFile = path.join(cacheDir, "swiggy.example-metadata.json");
      const snapshot = JSON.parse(await readFile(metadataFile));
      assert(snapshot.freshUntil - snapshot.retrievedAt <= 300);
      await assert.rejects(new Discovery({ cacheDir, offline: true }).discover(payload.iss, jwk.kid), errorCode("metadata_unavailable"));
      const keysFile = path.join(directory, "jwks.json");
      await writeFile(keysFile, JSON.stringify({ keys: [jwk, { ...jwk, kid: "rotated-key" }] }));
      let requests = 0; service.server.on("request", () => requests++);
      await discovery.discover(payload.iss, "rotated-key");
      assert.equal(requests, 1, "unknown cached kid triggers exactly one refresh");
      snapshot.retrievedAt -= 86400;
      await writeFile(metadataFile, JSON.stringify(snapshot));
      await assert.rejects(new Discovery({ cacheDir, offline: true, realm: "demo" }).discover(payload.iss, jwk.kid), errorCode("metadata_unavailable"));
      const metadataPath = path.join(directory, "metadata.json");
      const metadata = JSON.parse(await readFile(metadataPath));
      await writeFile(metadataPath, JSON.stringify({ ...metadata, domain: "other.example" }));
      await assert.rejects(new Discovery({ cacheDir: path.join(directory, "mismatch"), demo: service }).discover(payload.iss, jwk.kid), errorCode("metadata_domain_mismatch"));
    } finally { await new Promise(resolve => service.server.close(resolve)); }
  });
});
