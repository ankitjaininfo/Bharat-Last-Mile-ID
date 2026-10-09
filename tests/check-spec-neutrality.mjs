import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.dirname(testsDir);
const specDir = path.join(rootDir, "spec");

async function markdownFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(fullPath));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(fullPath);
  }
  return files.sort();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&").replace(/\s+/gu, "\\s+");
}

function locationAt(text, offset) {
  const before = text.slice(0, offset);
  const lines = before.split("\n");
  return { line: lines.length, column: [...lines.at(-1)].length + 1 };
}

const placeProviders = JSON.parse(await readFile(path.join(rootDir, "data", "place-id-providers.json"), "utf8"));
const configured = JSON.parse(await readFile(path.join(testsDir, "spec-neutrality-terms.json"), "utf8"));

assert(Array.isArray(placeProviders.providers), "place-ID provider registry must contain a providers array");
assert(Array.isArray(configured.additional_partner_names), "additional_partner_names must be an array");
assert(Array.isArray(configured.proprietary_terms), "proprietary_terms must be an array");

const candidates = [];
for (const provider of placeProviders.providers) {
  candidates.push({ term: provider.id, category: "place-provider identifier", owner: provider.domain });
  candidates.push({ term: provider.name, category: "place-provider name", owner: provider.domain });
  candidates.push({ term: provider.domain, category: "place-provider domain", owner: provider.domain });
}
for (const term of configured.additional_partner_names) {
  candidates.push({ term, category: "partner alias", owner: "maintained list" });
}
for (const entry of configured.proprietary_terms) {
  assert(entry && typeof entry.term === "string", "every proprietary term requires a string term");
  assert(typeof entry.owner === "string" && entry.owner.length > 0, `proprietary term ${entry.term} requires an owner`);
  candidates.push({ term: entry.term, category: "proprietary term", owner: entry.owner });
}

const prohibited = new Map();
for (const candidate of candidates) {
  assert(typeof candidate.term === "string" && candidate.term.trim().length > 0, `${candidate.category} contains an empty term`);
  const normalized = candidate.term.trim().toLocaleLowerCase("en");
  if (!prohibited.has(normalized)) prohibited.set(normalized, { ...candidate, term: candidate.term.trim() });
}

const findings = [];
const files = await markdownFiles(specDir);
assert(files.length > 0, "spec directory contains no Markdown files");

for (const file of files) {
  const document = await readFile(file, "utf8");
  for (const candidate of prohibited.values()) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(candidate.term)}(?![\\p{L}\\p{N}])`, "giu");
    for (const match of document.matchAll(pattern)) {
      const location = locationAt(document, match.index);
      findings.push({
        file: path.relative(rootDir, file),
        line: location.line,
        column: location.column,
        matched: match[0],
        ...candidate
      });
    }
  }
}

if (findings.length > 0) {
  const details = findings
    .map((finding) => `${finding.file}:${finding.line}:${finding.column}: ${finding.category} "${finding.matched}" (${finding.owner})`)
    .join("\n");
  throw new Error(`spec neutrality check found ${findings.length} prohibited reference(s):\n${details}`);
}

console.log(`Spec neutrality check passed: ${files.length} Markdown files, ${prohibited.size} prohibited terms.`);
