# LMID Level 1 Signed Test Scenarios

## Purpose

This directory contains positive pass conformance fixtures for Bharat Last-Mile ID Level 1 Draft and an optional Level 2 webhook fixture. The pass fixtures use the same public test issuer, ES256 key, and fixed future verification window. Level 3 has no conformance fixtures in this draft.

The fixtures test protocol behavior. They do not represent actual people, properties, deliveries, or issuer systems. Names and locations are realistic Indian-context examples.

## Scenario format

Each directory under `scenarios/` contains:

- `scenario.json`: human-written source containing the title, description, fixed verification time, protected header, payload, and expected result;
- `case.json`: generated self-contained test case containing the source data and signed compact token; and
- `token.jwt`: generated compact JWS token only.

### `scenario.json` and `case.json` fields

| Field | Meaning |
| --- | --- |
| `id` | Stable scenario identifier matching the directory name. |
| `title` | Short human-readable scenario title. |
| `description` | Detailed Indian-context test situation and intended schema behavior. |
| `verification_time` | Fixed integer NumericDate used instead of the computer clock. |
| `header` | Level 1 protected-header object. |
| `payload` | Level 1 JWT Claims Set. |
| `token` | Generated compact JWS. This field exists only in `case.json`. |
| `expected` | Expected semantic result used by the fixture verifier. |

The current positive `expected` object contains `result`, `delivery_count`, `holder_name`, `photo_status`, and `delivery_endpoints`. A positive result is `signature_verified`. Each delivery endpoint contains only the `building`, `block`, `floor`, and `unit` values carried directly by that delivery entry.

## Included scenarios

| ID | Scenario | Deliveries |
| --- | --- | ---: |
| `01-single-apartment` | Ramesh Kumar delivers to Tower C, unit 1204, in Bengaluru. | 1 |
| `02-multiple-villas` | Asha Singh carries a courier batch for three villa endpoints in Pune. | 3 |
| `03-commercial-office` | Mohammed Irfan delivers to a commercial-office reception in Gurugram. | 1 |
| `04-independent-house` | Meena Kumari delivers to house 13B in Bengaluru, with the house number in the delivery entry's building field. | 1 |
| `05-multiple-buildings` | Arjun Das carries four deliveries across two towers in Kolkata. | 4 |

## Test keys

`keys/test-private-key.pem` and `keys/test-public-key.pem` form a P-256 test key pair. `keys/jwks.json` exposes the public key as a conforming JWK Set with `kid=test-key-01`.

The private key is intentionally public. It provides reproducible test signatures and MUST NEVER be trusted by a production reader or issuer.

## Generate fixtures

```sh
npm run fixtures:generate
```

The generator:

1. reads every `scenario.json`;
2. serializes the protected header and payload as compact UTF-8 JSON;
3. applies unpadded base64url encoding;
4. creates an ES256 signature using the 64-byte JOSE `R || S` representation;
5. enforces the 2,048-byte token limit; and
6. writes `case.json`, `token.jwt`, and `keys/jwks.json`; and
7. generates the signed RFC 9421 `gate_check_in` webhook fixture.

ES256 signatures may differ after regeneration because ECDSA signing can use a fresh nonce. The decoded protected header and payload remain unchanged.

## Run all validations

```sh
npm ci
npm test
```

The `npm test` command runs the repository audit, specification-neutrality check, Draft 2020-12 schema validation, pass-fixture verification, webhook-fixture verification, JavaScript example tests, Markdown linting, and spelling checks. Schema validation includes every entry in `data/place-id-providers.json`. The repository audit additionally rejects incorrect registry schema declarations, duplicate place-provider IDs, and undocumented properties in the principal public schemas.

The [JavaScript example tests](javascript-example.test.mjs) execute both CLIs, decode real PNGs, verify all 40 QR versions, and exercise cryptographic rejection, HTTPS discovery, caching, issuer policy, and reconciliation. Run them separately with `npm run test:example`. These tests require OpenSSL 3 and local loopback sockets. Fresh example passes use the current clock; existing signed fixtures still use their fixed `verification_time`.

The specification-neutrality check scans every Markdown file under `spec/`. It automatically rejects every provider identifier, name, and domain in `data/place-id-providers.json`. It also reads `spec-neutrality-terms.json` for partner names and proprietary product terminology maintained specifically for the neutrality check. A failure identifies the exact file, line, column, matched term, category, and owner.

The pass fixture verifier checks:

- compact JWS structure and strict base64url;
- protected-header fields;
- every Level 1 payload object and allowed field;
- string sizes and character restrictions;
- canonical issuer-domain syntax;
- time ordering and the 12-hour validity limit;
- unique delivery references;
- NFC-normalized Unicode text and restricted `floor` and `unit` syntax;
- required address and effective-destination sufficiency;
- registered place-ID formats;
- delivery-level endpoint fields and destination sufficiency;
- compact-token size;
- ES256 signatures using the public JWK; and
- exact agreement between each authored `scenario.json` and generated `case.json`; and
- each scenario's expected holder, delivery count, and delivery endpoints.

The verifier uses `verification_time` from each case. It does not use the computer's current clock.

The webhook verifier checks the authored and generated `gate_check_in` event, participant metadata, source-domain binding, advertised receiver URI, SHA-256 `Content-Digest`, required RFC 9421 signature input, signature freshness interval, signature base, ES256 public-key signature, and unique delivery references.
