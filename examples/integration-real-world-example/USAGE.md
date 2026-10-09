# JavaScript issuer and reader example

This runnable Level 1 example models Swiggy issuing a delivery credential and ADDA reading it. It uses the repository's schemas and dedicated public test signing key. The companies have not integrated these services: `swiggy.example` is a reserved demonstration domain.

The default destination is **Aparna Serene Park**, Hyderabad. The supplied Google Place ID is `ChIJk1qMgACTyzsRmIKsCPIhMuM`; the dummy endpoint is building **R**, flat **1204**. No floor is inferred. The address and place binding are user-supplied example data, not a live Google Places lookup.

## Run the two CLIs

Requirements: Node.js 20 or newer, npm, and OpenSSL 3 on your PATH. Run from the repository root:

```sh
npm ci
npm run example:issue
npm run example:verify
```

The issuer writes `examples/integration-real-world-example/output/pass.png`. It also creates public participant metadata, a public JWK Set, and a short-lived TLS certificate/key for the isolated HTTPS fixture. Additional passes are named `pass-2.png`, `pass-3.png`, and so on. Generated output and caches are ignored by Git.

The issuer also prints `decodedPass.header` and `decodedPass.payload`, decoded from the exact token encoded in the PNG. Other issuer output fields describe generation, not signed pass fields. Treat this decoded personal data as an operator display rather than an operational log.

### Pass fields versus reader output

The reader's JSON is a verification report, not the signed pass contract:

| Reader field | Source and purpose | Included in the QR? |
| --- | --- | --- |
| `transport` | Example runtime: local demo discovery or public HTTPS discovery. | No |
| `policy` | ADDA's local decision about accepting the cryptographically verified issuer. | No |
| `deliveryCount` | Computed from `lmid.visit.deliveries.length` for display. | No |

The policy state is required reader behavior, but its output property name is example-specific. Transport labeling and an explicit count are example display choices. The reader also repeats the signed common place under each displayed destination; the pass stores it only once in `lmid.visit.place`, alongside the `deliveries` array. Shortening those output fields would not reduce the QR size.

The reader opens the PNG, decodes the QR's actual bytes, constructs the well-known discovery URL from `iss`, and retrieves metadata and keys over authenticated HTTPS. Its default fixture serves the issuer's public files on an ephemeral loopback port. An explicit single-host transport mapping connects `https://swiggy.example` to that port, retains the hostname for TLS verification, and trusts only the generated demo certificate. It does not disable TLS verification or install a system certificate.

The QR carries only the compact signed token. Neither a discovery URL nor a public key is carried inside it. The public discovery documents are served through an explicit routing table; signing and TLS private keys are never exposed by that server.

Expected reader states:

```text
signature: signature_verified
policy: policy_accepted
destination: exact, local-unit-R-1204
approval: pending
entry: pending
workflow: autofill_ready
```

The JSON written to stdout is the CLI's operator display. It preserves signed values, identifies the issuer domain, separates policy and destination outcomes, and retains manual handling. It is not an operational logging sink; applications should not retain personal display output as unrestricted logs. Complete tokens and signing keys are never printed.

## Change the default inputs

Edit `DELIVERY_INSTRUCTIONS` at the start of [swiggy-issuer.mjs](swiggy-issuer.mjs) and `GATE_CONFIGURATION` at the start of [adda-reader.mjs](adda-reader.mjs).

- The issuer's pickup and assignment booleans stand in for its internal operational checks. Both must be confirmed before issuing. The `gateInstructions` text stays outside the signed payload; Level 1 has no private delivery-instructions field.
- The place describes one common touch point. Each delivery carries its own endpoint. The issuer splits batches at the 32-delivery or 2,048-byte boundary without dropping entries or truncating their meaning.
- ADDA's accepted issuer list and curated Google Place ID binding are local policy and directory data. They are not taken from the QR.
- Swiggy's destination values model customer-entered text. ADDA's building managers maintain its canonical directory records. The reader automatically parses `R 1204`, `R-1204`, and `1204, Building R` against those records; approved aliases are an optional fallback. Building and block keywords retain their different meanings. This changes the local mapping, not the signed source text. Conflicts or multiple compatible records reject the card with `unit_not_found`.
- If an endpoint cannot resolve to one exact local destination, the reader rejects the ID card with `unit_not_found` and retains manual handling. A supplied supported place ID must resolve to the local property; address text cannot hide that failure. A signature never grants resident approval or entry permission.

Every issuance uses the current clock, a fresh opaque pass ID, and a 30-minute validity period. Generate another pass after expiry. The example intentionally permits repeated scans during validity, as Level 1 does not prevent replay or copied passes.

## Other commands

```sh
# Verify offline after at least one successful HTTPS discovery.
npm run example:verify -- --offline

# Use another generated output directory and PNG.
npm run example:issue -- --output /tmp/lmid-demo
npm run example:verify -- --directory /tmp/lmid-demo --file /tmp/lmid-demo/pass.png

# Verify another split pass.
npm run example:verify -- --file examples/integration-real-world-example/output/pass-2.png

# Disable the demo host mapping and certificate trust; use public HTTPS discovery.
npm run example:verify -- --online --file /path/to/pass.png

# Use only an authenticated public-discovery cache while disconnected.
npm run example:verify -- --online --offline --file /path/to/pass.png

# Run end-to-end and negative tests, including every QR version 1 through 40.
npm run test:example
```

Public discovery has no dependency on the simulated company's domain. For a real issuer, configure the reader's accepted domains and its own property directory independently. A policy-denied or unmatched pass has exit status `2`; a cryptographic, QR, or discovery failure has status `1`; successful autofill has status `0`. Manual entry remains available in every result.

## Real issuer signing mode

The default public test key must never sign real deliveries. The CLI can accept a separate P-256 LMID-only PEM key and a domain you control:

```sh
node examples/integration-real-world-example/swiggy-issuer.mjs \
  --key /secure/lmid-signing-key.pem \
  --issuer logistics.example \
  --kid lmid-key-2026 \
  --published-at 1790000000 \
  --output /tmp/lmid-issuer
```

`--published-at` is the operator-supplied Unix timestamp of actual public-key publication. The CLI refuses signing until at least 24 hours have elapsed. It cannot independently establish that publication happened. Publish generated `metadata.json` at `https://YOUR-DOMAIN/.well-known/bharat-last-mile-id` and `jwks.json` at the advertised JWK Set URL, over valid public HTTPS, before issuing live passes. Replace synthetic eligibility checks, holder and delivery data with authoritative operational inputs, and use managed signing keys. Keep old public keys through the last pass expiration plus permitted clock tolerance and any event retry window. Stop signing with compromised keys and remove them promptly.

## Libraries and verification boundary

[node-qrcode](https://github.com/soldair/node-qrcode) generates byte-mode Model 2 symbols with error correction M, automatic minimum version, a four-module quiet zone, and six pixels per module. Explicit segments prevent its automatic mixed-mode optimization from violating the LMID byte-mode requirement.

[jsQR](https://github.com/cozmo/jsQR) supplies decoded raw bytes, mode chunks, and version. [ZXing](https://github.com/zxing-js/library) independently supplies error-correction metadata; the reader checks both results agree and rejects other modes or error-correction levels. The CLI accepts PNG files with bounded compressed size and dimensions; it is not a camera application.

Node's cryptography signs and verifies ES256 with 64-byte JOSE signatures. AJV validates the actual Draft 2020-12 schemas; `jsonc-parser` checks strict JSON syntax and duplicate decoded member names. The reader also checks NFC and Unicode scalar values, time ordering and lifetime, unique references, public-only P-256 keys, and supported place-ID values.

The reader supports Google Place IDs as opaque identifiers within LMID's 256-character limit, plus the documented DIGIPIN and OpenStreetMap syntax. It does not establish that an ID exists through a provider API. Google documents variable-length identifiers without a maximum, so this example imposes no fixed prefix or fixed length. See [Google's Place ID documentation](https://developers.google.com/maps/documentation/places/web-service/place-id).

Discovery enforces HTTPS, origin policy, checked and socket-pinned DNS addresses, redirect limits, a total request deadline, byte limits, and no unrelated credentials. It caps caching at 24 hours, honors shorter online freshness and `no-store`, and refreshes once for an unknown cached `kid`. Demo and public cache records have separate provenance labels and are not interchangeable. Cache files are trusted local state; keep their directory inaccessible to untrusted users.

Optional photo retrieval is deliberately not requested, as Level 1 permits. The reader validates a supplied reference's origin and reports `not_requested`; it never displays unauthenticated photo bytes. Level 2 events and autonomous gate actions are outside this example's scope.

Read [implementation findings](IMPLEMENTATION-NOTES.md) before interpreting this prototype as independent interoperability evidence or a production deployment.
