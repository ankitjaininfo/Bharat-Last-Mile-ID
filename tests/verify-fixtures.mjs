import { createPublicKey, verify } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.dirname(testsDir);
const scenariosDir = path.join(testsDir, "scenarios");
const jwks = JSON.parse(await readFile(path.join(testsDir, "keys", "jwks.json"), "utf8"));
const publicPem = await readFile(path.join(testsDir, "keys", "test-public-key.pem"), "utf8");
const providers = JSON.parse(await readFile(path.join(rootDir, "data", "place-id-providers.json"), "utf8"));
const providerMap = new Map(providers.providers.map((provider) => [provider.id, provider]));

const allowedHeaderKeys = new Set(["alg", "kid", "typ"]);
const allowedPayloadKeys = new Set(["iss", "iat", "nbf", "exp", "jti", "lmid"]);
const allowedLmidKeys = new Set(["v", "holder", "vehicle", "visit"]);
const allowedHolderKeys = new Set(["name", "photo"]);
const allowedPhotoKeys = new Set(["uri", "sha256"]);
const allowedVehicleKeys = new Set(["registration", "country"]);
const allowedVisitKeys = new Set(["place", "deliveries"]);
const allowedPlaceKeys = new Set([
  "name", "address", "country", "state", "district", "city", "area", "street",
  "landmark", "postal_code", "place_ids"
]);
const deliveryDestinationKeys = ["building", "block", "floor", "unit"];
const allowedDeliveryKeys = new Set(["ref", ...deliveryDestinationKeys]);
const opaquePattern = /^[A-Za-z0-9._~-]{8,128}$/;
const kidPattern = /^[A-Za-z0-9._~-]{1,64}$/;
const providerPattern = /^[a-z][a-z0-9-]{1,63}$/;
const countryPattern = /^[A-Z]{2}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const registrationPattern = /^[A-Za-z0-9 -]{1,32}$/;
const restrictedDestinationPattern = /^[A-Za-z0-9][A-Za-z0-9 ._/#()+&-]{0,63}$/;
const unitPattern = /^[A-Za-z0-9][A-Za-z0-9 ._/#(),+&-]{0,63}$/;
const domainPattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const prohibitedUnicodePattern = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufffe\uffff]/u;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const pemJwk = createPublicKey(publicPem).export({ format: "jwk" });
const publishedJwk = jwks.keys.find((key) => key.kid === "test-key-01");
assert(publishedJwk, "test-key-01 is absent from jwks.json");
for (const field of ["kty", "crv", "x", "y"]) {
  assert(pemJwk[field] === publishedJwk[field], `test public PEM and JWK disagree on ${field}`);
}

function assertObject(value, label) {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
}

function assertExactKeys(object, allowed, required, label) {
  assertObject(object, label);
  for (const key of Object.keys(object)) assert(allowed.has(key), `${label}.${key} is not allowed`);
  for (const key of required) assert(Object.hasOwn(object, key), `${label}.${key} is required`);
}

function assertText(value, min, max, label) {
  assert(typeof value === "string", `${label} must be a string`);
  assert([...value].length >= min && [...value].length <= max, `${label} length is outside ${min}..${max}`);
  assert(!prohibitedUnicodePattern.test(value), `${label} contains a prohibited Unicode character`);
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    assert(!(codePoint >= 0xd800 && codePoint <= 0xdfff), `${label} contains an unpaired surrogate`);
    assert(!(codePoint >= 0xfdd0 && codePoint <= 0xfdef), `${label} contains a Unicode noncharacter`);
    assert((codePoint & 0xffff) < 0xfffe, `${label} contains a Unicode noncharacter`);
  }
  assert(value === value.normalize("NFC"), `${label} is not NFC-normalized`);
  assert(value.trim() === value, `${label} has leading or trailing whitespace`);
}

function validateHeader(header) {
  assertExactKeys(header, allowedHeaderKeys, allowedHeaderKeys, "header");
  assert(header.alg === "ES256", "header.alg must be ES256");
  assert(kidPattern.test(header.kid), "header.kid is invalid");
  assert(header.typ === "lmid+jwt", "header.typ must be lmid+jwt");
}

function validatePlaceId(placeId, label) {
  assertExactKeys(placeId, new Set(["provider", "id"]), new Set(["provider", "id"]), label);
  assert(providerPattern.test(placeId.provider), `${label}.provider is invalid`);
  assertText(placeId.id, 1, 256, `${label}.id`);
  const provider = providerMap.get(placeId.provider);
  if (provider?.pattern) assert(new RegExp(provider.pattern).test(placeId.id), `${label}.id violates provider pattern`);
}

function validatePlace(place) {
  assertExactKeys(place, allowedPlaceKeys, new Set(["address"]), "lmid.visit.place");
  for (const key of ["name", "street", "landmark"]) if (Object.hasOwn(place, key)) assertText(place[key], 1, 256, `place.${key}`);
  if (Object.hasOwn(place, "address")) assertText(place.address, 1, 512, "place.address");
  for (const key of ["state", "district", "city", "area"]) {
    if (Object.hasOwn(place, key)) assertText(place[key], 1, 128, `place.${key}`);
  }
  if (Object.hasOwn(place, "postal_code")) assertText(place.postal_code, 1, 32, "place.postal_code");
  if (Object.hasOwn(place, "country")) assert(countryPattern.test(place.country), "place.country is invalid");
  if (Object.hasOwn(place, "place_ids")) {
    assert(Array.isArray(place.place_ids) && place.place_ids.length >= 1 && place.place_ids.length <= 8, "place.place_ids length is invalid");
    place.place_ids.forEach((placeId, index) => validatePlaceId(placeId, `place.place_ids[${index}]`));
    const unique = new Set(place.place_ids.map((item) => JSON.stringify(item)));
    assert(unique.size === place.place_ids.length, "place.place_ids contains a duplicate");
  }
}

function validatePayload(payload) {
  assertExactKeys(payload, allowedPayloadKeys, allowedPayloadKeys, "payload");
  assert(typeof payload.iss === "string" && domainPattern.test(payload.iss), "iss must be a canonical bare domain name");
  for (const key of ["iat", "nbf", "exp"]) assert(Number.isSafeInteger(payload[key]) && payload[key] >= 0, `${key} must be a non-negative integer`);
  assert(payload.iat <= payload.nbf && payload.nbf < payload.exp, "time ordering is invalid");
  assert(payload.exp - payload.iat <= 43200, "validity exceeds 12 hours");
  assert(opaquePattern.test(payload.jti), "jti is invalid");

  assertExactKeys(payload.lmid, allowedLmidKeys, new Set(["v", "holder", "visit"]), "lmid");
  assert(payload.lmid.v === 1, "lmid.v must be 1");
  assertExactKeys(payload.lmid.holder, allowedHolderKeys, new Set(["name"]), "lmid.holder");
  assertText(payload.lmid.holder.name, 1, 128, "lmid.holder.name");

  if (payload.lmid.holder.photo) {
    const photo = payload.lmid.holder.photo;
    assertExactKeys(photo, allowedPhotoKeys, allowedPhotoKeys, "lmid.holder.photo");
    const photoUrl = new URL(photo.uri);
    assert(photoUrl.protocol === "https:", "photo.uri must use HTTPS");
    assert(digestPattern.test(photo.sha256), "photo.sha256 is invalid");
  }

  if (payload.lmid.vehicle) {
    const vehicle = payload.lmid.vehicle;
    assertExactKeys(vehicle, allowedVehicleKeys, allowedVehicleKeys, "lmid.vehicle");
    assert(registrationPattern.test(vehicle.registration), "vehicle.registration is invalid");
    assert(countryPattern.test(vehicle.country), "vehicle.country is invalid");
  }

  const visit = payload.lmid.visit;
  assertExactKeys(visit, allowedVisitKeys, allowedVisitKeys, "lmid.visit");
  validatePlace(visit.place);
  assert(Array.isArray(visit.deliveries) && visit.deliveries.length >= 1 && visit.deliveries.length <= 32, "deliveries length is invalid");
  const refs = new Set();
  for (const [index, delivery] of visit.deliveries.entries()) {
    const label = `deliveries[${index}]`;
    assertExactKeys(delivery, allowedDeliveryKeys, new Set(["ref"]), label);
    assert(opaquePattern.test(delivery.ref), `${label}.ref is invalid`);
    assert(!refs.has(delivery.ref), `${label}.ref is duplicated`);
    refs.add(delivery.ref);
    for (const key of deliveryDestinationKeys) {
      if (!Object.hasOwn(delivery, key)) continue;
      if (key === "floor" || key === "unit") {
        assert((key === "unit" ? unitPattern : restrictedDestinationPattern).test(delivery[key]), `${label}.${key} is invalid`);
      } else {
        assertText(delivery[key], 1, 128, `${label}.${key}`);
      }
    }
  }

  for (const [index, endpoint] of deliveryEndpoints(payload).entries()) {
    assert(endpoint.building || endpoint.block || endpoint.unit, `deliveries[${index}] lacks a building, block, or unit`);
  }
}

function deliveryEndpoints(payload) {
  return payload.lmid.visit.deliveries.map((delivery) => {
    const result = {};
    for (const key of deliveryDestinationKeys) {
      if (Object.hasOwn(delivery, key)) result[key] = delivery[key];
    }
    return result;
  });
}

function decodeSegment(segment) {
  assert(/^[A-Za-z0-9_-]+$/.test(segment), "JWS segment is not strict unpadded base64url");
  return Buffer.from(segment, "base64url");
}

const scenarios = (await readdir(scenariosDir)).sort();
let verified = 0;

for (const scenarioName of scenarios) {
  const scenarioDir = path.join(scenariosDir, scenarioName);
  const source = JSON.parse(await readFile(path.join(scenarioDir, "scenario.json"), "utf8"));
  const testCase = JSON.parse(await readFile(path.join(scenarioDir, "case.json"), "utf8"));
  const tokenFile = (await readFile(path.join(scenarioDir, "token.jwt"), "utf8")).trim();
  for (const field of ["id", "title", "description", "verification_time", "header", "payload", "expected"]) {
    assert(JSON.stringify(testCase[field]) === JSON.stringify(source[field]), `${testCase.id}: case.json ${field} differs from scenario.json`);
  }
  assert(tokenFile === testCase.token, `${testCase.id}: token.jwt differs from case.json`);
  assert(Buffer.byteLength(testCase.token, "ascii") <= 2048, `${testCase.id}: token exceeds 2,048 bytes`);

  const segments = testCase.token.split(".");
  assert(segments.length === 3 && segments.every(Boolean), `${testCase.id}: token is not compact JWS`);
  const header = JSON.parse(decodeSegment(segments[0]).toString("utf8"));
  const payload = JSON.parse(decodeSegment(segments[1]).toString("utf8"));
  assert(JSON.stringify(header) === JSON.stringify(testCase.header), `${testCase.id}: decoded header differs`);
  assert(JSON.stringify(payload) === JSON.stringify(testCase.payload), `${testCase.id}: decoded payload differs`);
  validateHeader(header);
  validatePayload(payload);

  const jwk = jwks.keys.find((key) => key.kid === header.kid);
  assert(jwk, `${testCase.id}: key not found`);
  const publicKey = createPublicKey({ key: jwk, format: "jwk" });
  const validSignature = verify(
    "sha256",
    Buffer.from(`${segments[0]}.${segments[1]}`, "ascii"),
    { key: publicKey, dsaEncoding: "ieee-p1363" },
    decodeSegment(segments[2])
  );
  assert(validSignature, `${testCase.id}: signature verification failed`);

  const tolerance = 300;
  assert(testCase.verification_time + tolerance >= payload.nbf, `${testCase.id}: token is not yet valid`);
  assert(testCase.verification_time - tolerance < payload.exp, `${testCase.id}: token is expired`);
  assert(testCase.expected.delivery_count === payload.lmid.visit.deliveries.length, `${testCase.id}: delivery count differs`);
  assert(testCase.expected.result === "signature_verified", `${testCase.id}: expected result must be signature_verified`);
  assert(testCase.expected.holder_name === payload.lmid.holder.name, `${testCase.id}: holder name differs`);
  assert(
    JSON.stringify(testCase.expected.delivery_endpoints) === JSON.stringify(deliveryEndpoints(payload)),
    `${testCase.id}: delivery endpoints differ`
  );
  verified += 1;
}

console.log(`Verified ${verified} signed LMID fixtures.`);
