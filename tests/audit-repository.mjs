import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.dirname(testsDir);
const specPath = path.join(rootDir, "spec", "specification.md");
const spec = await readFile(specPath, "utf8");
const specDocuments = await Promise.all(
  (await readdir(path.join(rootDir, "spec")))
    .filter((name) => name.endsWith(".md"))
    .map((name) => readFile(path.join(rootDir, "spec", name), "utf8"))
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function walk(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(fullPath));
    else result.push(fullPath);
  }
  return result;
}

const files = await walk(rootDir);
const jsonFiles = files.filter((file) => file.endsWith(".json"));
for (const file of jsonFiles) JSON.parse(await readFile(file, "utf8"));

function assertPropertyDescriptions(node, location) {
  if (node === null || typeof node !== "object") return;
  if (node.properties && typeof node.properties === "object") {
    for (const [name, propertySchema] of Object.entries(node.properties)) {
      assert(
        typeof propertySchema.description === "string" && propertySchema.description.trim().length > 0,
        `${location}.properties.${name} lacks a non-empty description`
      );
    }
  }
  for (const [key, value] of Object.entries(node)) {
    assertPropertyDescriptions(value, `${location}.${key}`);
  }
}

for (const schemaName of [
  "lmid-pass-payload.schema.json",
  "lmid-participant-metadata.schema.json",
  "lmid-gate-check-in-event.schema.json"
]) {
  const schema = JSON.parse(await readFile(path.join(rootDir, "schemas", schemaName), "utf8"));
  assertPropertyDescriptions(schema, `schemas/${schemaName}`);
}

const providers = JSON.parse(await readFile(path.join(rootDir, "data", "place-id-providers.json"), "utf8"));
assert(providers.$schema === "../schemas/place-id-provider-registry.schema.json", "place-ID provider registry declares an unexpected schema path");
const providerIds = providers.providers.map((provider) => provider.id);
assert(new Set(providerIds).size === providerIds.length, "place-ID provider registry contains a duplicate provider identifier");

for (const document of specDocuments) {
  assert(!/[—–]/u.test(document), "spec documentation contains an em dash or en dash");
  assert(!document.includes("lmid-issuer-metadata.schema.json"), "spec documentation references the retired issuer metadata schema");
}
assert(!/\b(?:TODO|TBD|FIXME|XXX)\b/u.test(spec), "specification contains an unresolved editorial marker");
assert(!spec.includes("draft.md"), "specification contains a stale draft.md reference");

const requiredDocumentedFields = [
  "alg", "kid", "typ", "iss", "iat", "nbf", "exp", "jti", "lmid", "v", "holder",
  "name", "photo", "uri", "sha256", "vehicle", "registration", "country", "visit", "place",
  "address", "state", "district", "city", "area", "street", "landmark", "postal_code",
  "building", "block", "floor", "unit", "place_ids", "provider", "id", "deliveries", "ref",
  "domain", "display_name", "roles", "jwks_uri", "versions_supported", "token_types_supported", "photo_origins", "event_receiver",
  "types_supported", "specversion", "source", "type", "time", "datacontenttype", "data", "pass_jti",
  "kty", "crv", "x", "y", "use"
];

const specCorpus = specDocuments.join("\n");
for (const field of requiredDocumentedFields) {
  assert(specCorpus.includes(`\`${field}\``), `specification does not explicitly document JSON field ${field}`);
}

const markdownFiles = files.filter((file) => file.endsWith(".md"));
const localLinkPattern = /\[[^\]]*\]\((?!https?:\/\/|mailto:|#)([^)]+)\)/gu;
for (const file of markdownFiles) {
  const markdown = await readFile(file, "utf8");
  for (const match of markdown.matchAll(localLinkPattern)) {
    const targetText = match[1].split("#", 1)[0];
    if (!targetText) continue;
    const target = path.resolve(path.dirname(file), decodeURIComponent(targetText));
    try {
      await stat(target);
    } catch {
      throw new Error(`${path.relative(rootDir, file)} links to missing ${targetText}`);
    }
  }
}

const caseFiles = files.filter((file) => file.endsWith(`${path.sep}case.json`));
assert(caseFiles.length === 5, `expected 5 signed case files, found ${caseFiles.length}`);

console.log(`Repository audit passed: ${jsonFiles.length} JSON files, ${markdownFiles.length} Markdown files, 5 signed cases.`);
