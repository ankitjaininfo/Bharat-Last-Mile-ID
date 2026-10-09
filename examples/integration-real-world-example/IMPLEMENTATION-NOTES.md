# Implementation findings and adopter challenges

This document records findings from the JavaScript issuer and reader implementation. It does not silently change the normative specification.

## Resolved place-ID and mapping decisions

- **Malformed supported IDs:** Sections 11.24, 17, and 23 now agree: reject Level 1 credential verification with `invalid_place_id`. Unsupported providers are still ignored. This rejects the credential's claims validation without claiming that the mathematical signature failed.
- **Google Places:** `google-places` is now an active, agreed provider identifier in the informative registry. This records LMID's naming convention, not Google's participation as an issuer or verifier.
- **256-character limit:** the existing schema bound is retained for every provider, including Google Places. Oversized IDs cannot be truncated; an issuer may omit the optional ID and use ordinary destination fields with reconciliation or manual handling. Tests cover 256 and 257 characters.
- **Property and endpoint identity:** a place ID anchors the building or property record. A supplied supported ID must resolve; matching address text cannot hide a failed ID resolution. When no supported IDs are supplied, the existing curated address path remains available. Internal endpoints still need exact local resolution. Failed or ambiguous resolution rejects the ID card for autofill with `unit_not_found`, without changing a valid signature result.
- **Customer and manager data:** Swiggy's destination comes from its customer; ADDA's directory records come from building managers. Sections 19.3 and 19.6 make deterministic resolution the reader's responsibility, with worked examples. The example automatically resolves `R 1204`, `R-1204`, and `1204, Building R` against actual directory components. No alias is required; aliases remain optional. The unit schema permits commas so the supplied text can be preserved. Building and block keywords retain separate meanings, meaningful unit suffixes are preserved, and ambiguous matches fail rather than guessing.

## Open specification conflicts and gaps

| Finding | Evidence | Current implementation | Proposed resolution |
| --- | --- | --- | --- |
| HTTP cache policy needs a clearer offline rule. | Section 22 allows offline material for 24 hours but requires shorter freshness while online; it does not spell out every HTTP directive's offline interpretation. | Honors online freshness, does not persist `no-store`, re-fetches `no-cache` online, and permits previously fetched stored documents offline for less than 24 hours. Failed retrieval never advances the retrieval timestamp. | Specify the interaction of offline use with `no-cache`, `must-revalidate`, and revoked keys, with negative cache fixtures. |
| A small QR can still be dense for a phone-to-phone scan. | Section 7 requires byte mode, M, and up to 2,048 bytes. The full default address and signature create a version-26 symbol at approximately 1 KiB. | Preserves the full supplied address; allocates six pixels per module and the required quiet zone. | Test physical devices and display sizes. Do not claim camera reliability from PNG round trips alone. |
| Semantic privacy restrictions cannot be completely recognized by a parser. | Fields such as `ref`, `address`, and `landmark` must not carry prohibited identifiers, contents, or private access instructions. Schema checks cannot infer a string's real-world meaning. | Prohibits unknown fields and uses synthetic operational references. Free-form gate instructions stay outside the credential. | Add issuer-side data classification and operational reviews; do not present structural validation as semantic privacy proof. |
| Eligibility, assignment, publication, and key custody require operational evidence. | Sections 13 and 15 require pickup, current assignment, LMID-only keys, and publication at least 24 hours before signing. | Default mode is an explicit fixture using an intentionally public dedicated test key. Live signing checks an operator-supplied publication timestamp, but cannot attest the operational facts. | Integrate authoritative assignment/pickup records, managed keys, publication monitoring, rotation, and incident procedures before deployment. |

## Implementation choices and limits

- **No live corporate integration:** the default fixture does not publish anything at a real Swiggy or ADDA domain. Its private-network exception is a single explicit local test mapping with TLS verification. The default fixture models discovery and previously published test signing material; it cannot demonstrate a company's real operational conformance.
- **One property per issuance input:** all supplied entries must belong to the common place. Call the issuer separately for different touch points. Multiple batches retain every entry, and a single oversized pass fails rather than changing destination meaning.
- **Separate states:** cryptographic verification, issuer acceptance, destination matching, approval, and entry remain distinct. The demo models exact, suggested, conflict, and unmatched destination outcomes and preserves manual handling.
- **No provider API lookup:** the Google Place ID and property address were supplied for this example. The local curated binding establishes only what the example directory is configured to accept, not a fresh third-party assertion.
- **No photo display:** retrieval is optional and declined. A product adding it must implement Section 18's media type, byte/dimension, digest, transient-storage, and safe-decoding requirements.
- **No replay or cancellation guarantee:** Level 1 validates signed issuance state. A copied or previously displayed QR can verify again within its validity period. Current reassignment and cancellation cannot be inferred from its signature.
- **Independent interoperability remains unproven:** the reader verifies all five pre-existing signed scenarios in addition to its own issuer output. Both new CLIs still share the same validation library; this is useful implementation evidence, not independent-vendor conformance certification.

## Verification performed

`npm run test:example` exercises the two actual CLIs, real PNG encoding/decoding, TLS authentication, online discovery, offline cache use, all 40 Model 2 QR versions, byte-mode/M restrictions, existing signed fixtures, duplicate JSON keys, malformed encodings, unknown fields, signature tampering, time boundaries, Unicode restrictions, batch splitting, issuer policy separation, missing endpoint data, provider handling, discovery address restrictions, response limits, metadata binding, stale cache rejection, and unknown-key refresh.

The existing full protocol fixture suite also remains required. These checks do not replace real camera tests, independent implementation testing, or validation of a deployment's authoritative delivery inputs.

## Repository issues observed

The full `npm test` run passes protocol and example checks, then stops on four pre-existing Markdown formatting errors in the locally modified `benefits.md`. Those user edits were preserved. Changed documentation passes targeted Markdown and spelling checks.

The runtime schema validator was updated to AJV 8.20.0 and its URI parser to `fast-uri` 3.1.8. `npm audit --omit=dev` reports zero runtime advisories at implementation time. The existing development tooling still reports 11 advisories through the Markdown linting dependency chain; that tooling upgrade is separate from this example and has not been performed.
