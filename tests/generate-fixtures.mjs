import { createHash, createPrivateKey, createPublicKey, sign } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const scenariosDir = path.join(testsDir, "scenarios");
const privatePem = await readFile(path.join(testsDir, "keys", "test-private-key.pem"), "utf8");
const privateKey = createPrivateKey(privatePem);
const publicKey = createPublicKey(privateKey);
const publicJwk = publicKey.export({ format: "jwk" });
const publicPem = publicKey.export({ type: "spki", format: "pem" });

const jwks = {
  keys: [
    {
      kty: publicJwk.kty,
      crv: publicJwk.crv,
      x: publicJwk.x,
      y: publicJwk.y,
      kid: "test-key-01",
      use: "sig",
      alg: "ES256"
    }
  ]
};

await writeFile(path.join(testsDir, "keys", "jwks.json"), `${JSON.stringify(jwks, null, 2)}\n`);
await writeFile(path.join(testsDir, "keys", "test-public-key.pem"), publicPem);

const base64url = (value) => Buffer.from(value).toString("base64url");
const scenarioNames = (await readdir(scenariosDir)).sort();

for (const scenarioName of scenarioNames) {
  const scenarioDir = path.join(scenariosDir, scenarioName);
  const source = JSON.parse(await readFile(path.join(scenarioDir, "scenario.json"), "utf8"));
  const encodedHeader = base64url(JSON.stringify(source.header));
  const encodedPayload = base64url(JSON.stringify(source.payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = sign("sha256", Buffer.from(signingInput, "ascii"), {
    key: privateKey,
    dsaEncoding: "ieee-p1363"
  });

  if (signature.length !== 64) {
    throw new Error(`${source.id}: ES256 signature is ${signature.length} bytes instead of 64`);
  }

  const token = `${signingInput}.${signature.toString("base64url")}`;
  if (Buffer.byteLength(token, "ascii") > 2048) {
    throw new Error(`${source.id}: compact token exceeds 2,048 bytes`);
  }

  const testCase = {
    id: source.id,
    title: source.title,
    description: source.description,
    verification_time: source.verification_time,
    header: source.header,
    payload: source.payload,
    token,
    expected: source.expected
  };

  await writeFile(path.join(scenarioDir, "case.json"), `${JSON.stringify(testCase, null, 2)}\n`);
  await writeFile(path.join(scenarioDir, "token.jwt"), `${token}\n`);
}

console.log(`Generated ${scenarioNames.length} signed LMID fixtures.`);

const webhookSourcePath = path.join(testsDir, "webhooks", "gate-check-in", "source.json");
const webhookSource = JSON.parse(await readFile(webhookSourcePath, "utf8"));
const body = JSON.stringify(webhookSource.event);
const contentType = "application/cloudevents+json";
const contentDigest = `sha-256=:${createHash("sha256").update(body, "utf8").digest("base64")}:`;
const coveredComponents = "(\"@method\" \"@authority\" \"@path\" \"content-type\" \"content-digest\")";
const signatureParameters = `${coveredComponents};created=${webhookSource.request.created};expires=${webhookSource.request.expires};keyid=\"${webhookSource.request.keyid}\";tag=\"lmid-gate-check-in\"`;
const signatureBase = [
  `\"@method\": ${webhookSource.request.method}`,
  `\"@authority\": ${webhookSource.request.authority}`,
  `\"@path\": ${webhookSource.request.path}`,
  `\"content-type\": ${contentType}`,
  `\"content-digest\": ${contentDigest}`,
  `\"@signature-params\": ${signatureParameters}`
].join("\n");
const webhookSignature = sign("sha256", Buffer.from(signatureBase, "ascii"), {
  key: privateKey,
  dsaEncoding: "ieee-p1363"
});

if (webhookSignature.length !== 64) {
  throw new Error(`gate_check_in webhook signature is ${webhookSignature.length} bytes instead of 64`);
}

const webhookFixture = {
  id: webhookSource.id,
  title: webhookSource.title,
  description: webhookSource.description,
  request: {
    method: webhookSource.request.method,
    authority: webhookSource.request.authority,
    path: webhookSource.request.path,
    headers: {
      "content-type": contentType,
      "content-digest": contentDigest,
      "signature-input": `lmid=${signatureParameters}`,
      "signature": `lmid=:${webhookSignature.toString("base64")}:`
    },
    body
  },
  signature_base: signatureBase,
  event: webhookSource.event,
  source_metadata: webhookSource.source_metadata,
  receiver_metadata: webhookSource.receiver_metadata
};

await writeFile(
  path.join(testsDir, "webhooks", "gate-check-in", "fixture.json"),
  `${JSON.stringify(webhookFixture, null, 2)}\n`
);
console.log("Generated 1 signed LMID webhook fixture.");
