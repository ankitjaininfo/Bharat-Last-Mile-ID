import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.dirname(testsDir);
const readJson = async (relativePath) => JSON.parse(await readFile(path.join(rootDir, relativePath), "utf8"));

const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
addFormats(ajv);

const schemaFiles = {
  header: "schemas/lmid-jws-header.schema.json",
  payload: "schemas/lmid-pass-payload.schema.json",
  metadata: "schemas/lmid-participant-metadata.schema.json",
  gateCheckIn: "schemas/lmid-gate-check-in-event.schema.json",
  providers: "schemas/place-id-provider-registry.schema.json"
};

const validators = {};
for (const [name, schemaPath] of Object.entries(schemaFiles)) {
  validators[name] = ajv.compile(await readJson(schemaPath));
}

let checked = 0;
function validate(name, value, label) {
  if (!validators[name](value)) {
    const details = ajv.errorsText(validators[name].errors, { separator: "\n" });
    throw new Error(`${label}: ${details}`);
  }
  checked += 1;
}

validate("providers", await readJson("data/place-id-providers.json"), "place-ID provider registry");

const exampleNames = (await readdir(path.join(rootDir, "examples", "passes")))
  .filter((name) => name.endsWith(".json"))
  .sort();
for (const name of exampleNames) {
  validate("payload", await readJson(`examples/passes/${name}`), `example ${name}`);
}

const scenarioNames = (await readdir(path.join(testsDir, "scenarios"))).sort();
for (const scenarioName of scenarioNames) {
  const source = await readJson(`tests/scenarios/${scenarioName}/scenario.json`);
  const testCase = await readJson(`tests/scenarios/${scenarioName}/case.json`);
  validate("header", source.header, `${scenarioName} source header`);
  validate("payload", source.payload, `${scenarioName} source payload`);
  validate("header", testCase.header, `${scenarioName} case header`);
  validate("payload", testCase.payload, `${scenarioName} case payload`);
}

validate("metadata", await readJson("examples/metadata/participant-with-event-receiver.json"), "participant metadata example");
validate("gateCheckIn", await readJson("examples/events/gate-check-in.json"), "gate_check_in event example");

const webhookSource = await readJson("tests/webhooks/gate-check-in/source.json");
const webhookFixture = await readJson("tests/webhooks/gate-check-in/fixture.json");
validate("metadata", webhookSource.source_metadata, "webhook source metadata");
validate("metadata", webhookSource.receiver_metadata, "webhook receiver metadata");
validate("gateCheckIn", webhookSource.event, "webhook source event");
validate("metadata", webhookFixture.source_metadata, "webhook fixture source metadata");
validate("metadata", webhookFixture.receiver_metadata, "webhook fixture receiver metadata");
validate("gateCheckIn", webhookFixture.event, "webhook fixture event");

console.log(`Draft 2020-12 schema validation passed for ${checked} documents.`);
