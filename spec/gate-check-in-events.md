# LMID Level 2 `gate_check_in` Event Draft

## 1. Status and relationship to the core specification

This document defines the optional Bharat Last-Mile ID Level 2 `gate_check_in` event profile. It is a sub-specification of the [Bharat Last-Mile ID Level 1 Draft](specification.md).

This profile covers one part of Level 2. Additional Level 2 scope is listed in the [core roadmap](specification.md#261-further-level-2-scope); Level 3 autonomous-access scope remains separate. Level names do not change numeric wire-format identifiers: this event continues to use CloudEvents `specversion: "1.0"` and the existing participant metadata and schema identifiers.

The core LMID pass remains a device-to-device credential. This profile does not add claims to that pass. It defines a separate verifier-to-issuer webhook that can follow a successful pass scan.

The key words MUST, MUST NOT, REQUIRED, SHALL, SHALL NOT, SHOULD, SHOULD NOT, RECOMMENDED, NOT RECOMMENDED, MAY, and OPTIONAL are normative requirements when they appear in uppercase.

## 2. Purpose

The event lets a verifier report that it successfully validated an LMID pass and recorded the holder at a security checkpoint. An issuer can use the event to update delivery tracking, measure arrival commitments, notify a customer, or investigate delays after checkpoint arrival.

The event asserts only that:

1. the named verifier produced the event;
2. the verifier cryptographically verified the referenced LMID pass and accepted its issuer under the verifier's policy;
3. the referenced deliveries appeared in that pass; and
4. the verifier recorded the check at the event time.

The event does not assert that:

- the property granted entry;
- the holder physically crossed a gate;
- the holder reached a unit;
- a recipient accepted a delivery;
- the delivery was completed; or
- the checkpoint clock was independently certified.

The core reader states `signature_verified`, `policy_accepted` or `policy_denied`, destination status, approval status, and entry decision remain separate local outcomes. This event does not add those states to its payload. A verifier emits `gate_check_in` only after `signature_verified` and `policy_accepted` and after determining that the pass applies to the checkpoint.

An issuer MUST label the resulting tracking state as arrival at security, checkpoint arrival, or equivalent. It MUST NOT translate `gate_check_in` directly into delivered or completed.

This Level 2 event profile does not report the final local gate decision. Section 18 reserves a separate future `gate_check_result` event for that feedback. The result is separate because it may occur after the verifier has already sent and retried the immutable checkpoint-arrival event.

## 3. Actors

### 3.1 Event source

The event source is the verifier that scanned and successfully validated the LMID pass. It creates the CloudEvent and signs the HTTP request.

### 3.2 Event receiver

The event receiver is the issuer named by the pass `iss` claim. It advertises an optional webhook endpoint in its domain-controlled LMID participant metadata.

### 3.3 Holder and recipient

The holder presents the pass. The recipient is not a webhook party and is not identified in the event.

## 4. End-to-end flow

1. The holder presents an LMID pass.
2. The verifier completes the core verification algorithm.
3. The verifier determines that the pass is valid and applicable to the checkpoint.
4. The verifier derives the issuer metadata URL from pass `iss`.
5. The verifier obtains fresh or acceptably cached issuer participant metadata.
6. If metadata contains an `event_receiver` that supports `gate_check_in`, the verifier constructs one event.
7. The verifier serializes the event as CloudEvents structured JSON.
8. The verifier calculates `Content-Digest` over the exact HTTP content bytes.
9. The verifier signs the required HTTP components using an LMID private key.
10. The verifier sends the request to `event_receiver.uri`.
11. The issuer discovers the verifier's LMID public keys from event `source`.
12. The issuer validates the content digest, HTTP message signature, event schema, source, freshness, trust, and pass correlation.
13. The issuer acknowledges the webhook and processes the event idempotently.

If discovery, signing, delivery, or acknowledgement fails, the verifier's local entry process MUST continue independently. Level 2 event delivery MUST NOT become a requirement for Level 1 gate processing.

A future flow may continue after this event: the verifier completes its local approval and entry workflow, reaches a terminal result, and sends a correlated `gate_check_result` if the issuer advertises support. Section 18 defines the intended boundary for that future Level 2 work. It is not part of the current event flow.

## 5. Event receiver discovery

For pass issuer domain `issuer.example`, the verifier obtains participant metadata from:

```text
https://issuer.example/.well-known/bharat-last-mile-id
```

An issuer that accepts Level 2 events includes:

```json
{
  "domain": "issuer.example",
  "display_name": "Example Logistics",
  "roles": ["issuer"],
  "jwks_uri": "https://issuer.example/.well-known/bharat-last-mile-id.jwks",
  "versions_supported": [1],
  "token_types_supported": ["lmid+jwt"],
  "event_receiver": {
    "uri": "https://events.issuer.example/lmid/v1/events",
    "types_supported": ["gate_check_in"]
  }
}
```

`event_receiver` is optional. Its absence means that the participant does not advertise an LMID event receiver.

`event_receiver.uri` MUST use HTTPS. It MUST NOT contain user information, a fragment, or an IP-address host. Delivery under this Level 2 event profile uses HTTP POST. The verifier MUST apply the discovery and network safety rules in the core specification before connecting.

`event_receiver.types_supported` lists event type strings accepted at the endpoint. A verifier MUST NOT send `gate_check_in` unless the array contains the exact case-sensitive string `gate_check_in`.

Only domain-controlled participant metadata supplies operational endpoints. No central partner registry is used for event receiver discovery.

## 6. Event representation

This Level 2 event profile uses CloudEvents Version 1.0 structured JSON with media type `application/cloudevents+json`. The event MUST satisfy [`lmid-gate-check-in-event.schema.json`](../schemas/lmid-gate-check-in-event.schema.json).

Example:

```json
{
  "specversion": "1.0",
  "id": "event_gate_01JQ9X7K3W5P8M2R",
  "source": "https://verifier.example",
  "type": "gate_check_in",
  "time": "2030-01-01T00:10:58Z",
  "datacontenttype": "application/json",
  "data": {
    "pass_jti": "pass_single_001",
    "deliveries": [
      {
        "ref": "ORDER-BLR-2026-0001"
      }
    ]
  }
}
```

The HTTP content MUST be a UTF-8 JSON object. The receiver MUST limit the content to 64 KiB before parsing. Unknown top-level or nested members are invalid in this Level 2 event profile.

## 7. Event field definitions

### 7.1 `specversion`

- Type: string
- Required: yes
- Required value: `1.0`

`specversion` identifies the CloudEvents context format. A receiver MUST reject any other value under this profile.

### 7.2 `id`

- Type: string
- Required: yes
- Length: 8 to 128 characters
- Characters: ASCII letters, digits, period, underscore, tilde, and hyphen

`id` uniquely identifies the event within its `source`. The source MUST create a new value for each distinct checkpoint observation. It MUST preserve the same value for every retry of that event.

The receiver MUST use the tuple of `source` and `id` as the idempotency key. It MUST NOT use `id` alone across sources.

### 7.3 `source`

- Type: absolute HTTPS URI string
- Required: yes
- Form: `https://` followed by one canonical bare participant domain

`source` identifies the verifier that created the event and anchors public-key discovery. It MUST contain no explicit port, path other than `/`, query, fragment, user information, wildcard, IP address, or trailing dot.

For `source` value `https://verifier.example`, the receiver obtains source metadata from:

```text
https://verifier.example/.well-known/bharat-last-mile-id
```

The metadata `domain` MUST equal `verifier.example`, and metadata `roles` MUST contain `verifier`. The `source` value is not authenticated until the HTTP message signature validates with a permitted key from that metadata. Whether the receiver accepts that authenticated source remains the receiver's policy.

### 7.4 `type`

- Type: string
- Required: yes
- Required value: `gate_check_in`

This Level 2 event profile defines exactly one event type. The type string remains deliberately short because the LMID schema and metadata provide its namespace and version context.

### 7.5 `time`

- Type: RFC 3339 timestamp string
- Required: yes

`time` records when the verifier completed the successful pass check at the checkpoint. The source MUST express it in UTC using a `Z` suffix and SHOULD include whole seconds unless it can supply meaningful subsecond precision.

`time` describes the occurrence. The HTTP signature `created` parameter describes one delivery attempt. Retries preserve `time` while using a fresh signature creation time.

The issuer MAY record its independent receipt time. For audits or service commitments, it SHOULD retain both values and MUST NOT imply that signing proves the accuracy of the verifier's clock.

### 7.6 `datacontenttype`

- Type: string
- Required: yes
- Required value: `application/json`

`datacontenttype` describes the `data` value inside the structured CloudEvent. It is distinct from the HTTP `Content-Type`, which is `application/cloudevents+json`.

### 7.7 `data`

- Type: object
- Required: yes
- Required members: `pass_jti`, `deliveries`

`data` contains only the identifiers necessary to correlate the checkpoint event with the pass and its deliveries.

### 7.8 `data.pass_jti`

- Type: string
- Required: yes
- Length: 8 to 128 characters
- Characters: ASCII letters, digits, period, underscore, tilde, and hyphen

`pass_jti` MUST exactly equal the `jti` in the successfully verified pass. The verifier MUST NOT hash, rewrite, prefix, or otherwise transform it.

### 7.9 `data.deliveries`

- Type: array
- Required: yes
- Length: 1 to 32 entries

`deliveries` identifies the pass delivery entries covered by the checkpoint observation. Each event entry uses the same minimal object shape as a pass delivery entry:

```json
{
  "ref": "AWB-DEL-2030-0001"
}
```

Every event `ref` MUST exactly equal one `lmid.visit.deliveries[].ref` value in the referenced pass. Every value MUST be unique within the event. The verifier MUST NOT include a reference absent from the pass.

Normally, the event includes every delivery in the verified pass. If local processing applies the check to only a subset, the event MAY contain that non-empty subset. The issuer MUST correlate each entry independently.

### 7.10 `data.deliveries[].ref`

- Type: string
- Required: yes
- Length: 8 to 128 characters
- Characters: ASCII letters, digits, period, underscore, tilde, and hyphen

`ref` preserves the issuer-scoped AWB, order ID, delivery ID, service ID, or equivalent value already signed in the pass. The event introduces no new delivery identifier.

## 8. HTTP request profile

The verifier MUST deliver an event using HTTPS and HTTP POST to the exact advertised receiver URI. It MUST send:

```http
Content-Type: application/cloudevents+json
Content-Digest: sha-256=:BASE64_DIGEST:
Signature-Input: lmid=("@method" "@authority" "@path" "content-type" "content-digest");created=1893456662;expires=1893456962;keyid="test-key-01";tag="lmid-gate-check-in"
Signature: lmid=:BASE64_SIGNATURE:
```

Header names are case-insensitive under HTTP. Their values MUST follow RFC 8941 structured field serialization as required by RFC 9421 and RFC 9530.

The request MUST NOT contain HTTP credentials, cookies, the raw LMID pass, a private key, or a recipient contact identifier.

## 9. Content digest

The verifier MUST calculate SHA-256 over the exact HTTP content bytes after final serialization and content coding. It MUST encode the result in `Content-Digest` as specified by RFC 9530:

```text
sha-256=:<standard-base64-digest>:
```

The receiver MUST independently calculate SHA-256 over the received content bytes and compare it with the declared digest before accepting the event. Verifying only the HTTP message signature is insufficient because that signature covers the `Content-Digest` field value, not the content bytes directly.

A receiver MUST verify the digest before parsing or acting on untrusted event fields other than the bounded parsing needed for source discovery.

## 10. HTTP message signature profile

This Level 2 event profile uses RFC 9421 HTTP Message Signatures. It reuses the participant's LMID P-256 keys. It does not wrap the CloudEvent in JWS and does not require a separate event key set.

The signature label MUST be `lmid`. `Signature-Input` MUST contain exactly these covered components in this order:

1. `@method`
2. `@authority`
3. `@path`
4. `content-type`
5. `content-digest`

It MUST also contain these signature parameters in this order:

1. `created`
2. `expires`
3. `keyid`
4. `tag`

`created` and `expires` are integer Unix times. `expires` MUST be later than `created` and MUST NOT be more than 300 seconds later.

`keyid` MUST obey the core LMID `kid` syntax and identify exactly one permitted public JWK in the source participant's discovered `jwks_uri`.

`tag` MUST equal `lmid-gate-check-in`. The receiver MUST reject a missing or different tag.

The signature input MUST NOT contain an `alg` parameter. RFC 9421 Section 3.3.7 permits use of a JOSE algorithm identified by the JWK. The selected LMID JWK has `alg=ES256`, so the receiver applies ES256 to the RFC 9421 signature base without a JOSE protected header and without base64url-encoding the signature base.

The resulting ECDSA signature MUST use the 64-byte JOSE and RFC 9421 representation formed by the 32-byte big-endian `R` value followed by the 32-byte big-endian `S` value. The `Signature` structured field encodes those bytes using standard base64 between colons.

## 11. Signature base example

For the headers in Section 8, the signature base has this form:

```text
"@method": POST
"@authority": events.issuer.example
"@path": /lmid/v1/events
"content-type": application/cloudevents+json
"content-digest": sha-256=:BASE64_DIGEST:
"@signature-params": ("@method" "@authority" "@path" "content-type" "content-digest");created=1893456662;expires=1893456962;keyid="test-key-01";tag="lmid-gate-check-in"
```

The signer and receiver MUST construct this value using RFC 9421 canonicalization. They MUST NOT create a signature base by copying the visual formatting of an example.

## 12. Public-key discovery and binding

The event request does not carry a JWK, `jku`, certificate URL, or metadata URL. The receiver derives discovery only from the validated syntax of event `source`.

For source domain `verifier.example`, the receiver:

1. obtains `https://verifier.example/.well-known/bharat-last-mile-id`;
2. requires metadata `domain` to equal `verifier.example`;
3. requires metadata `roles` to contain `verifier`;
4. obtains the JWK Set from metadata `jwks_uri` under the core discovery safety and caching rules;
5. selects exactly one key matching signature `keyid`;
6. requires `kty=EC`, `crv=P-256`, `use=sig`, and `alg=ES256`; and
7. verifies the HTTP message signature.

The same LMID JWK Set can contain multiple active keys for rotation and can support both LMID pass and event signatures. A source MAY choose different keys operationally, but this Level 2 event profile does not require or infer purpose-specific keys. The protocol derives purpose from the signed representation, covered components, tag, schema, and verification rules.

Successful discovery and signature verification bind the event to a domain. They do not establish that the receiver should trust that domain. The receiver MUST apply a local event-source trust policy.

## 13. Receiver verification algorithm

A conforming receiver processes a request in this order:

1. Require HTTPS.
2. Require POST to the configured receiver resource.
3. Limit the content to 64 KiB.
4. Require `Content-Type: application/cloudevents+json`.
5. Parse `Content-Digest`, `Signature-Input`, and `Signature` as strict structured fields.
6. Require exactly one `lmid` signature input and signature.
7. Require the exact covered components, order, parameters, and `tag` defined in Section 10.
8. Require `created < expires` and a validity interval no longer than 300 seconds.
9. Reject the attempt when current time plus at most 300 seconds of clock tolerance is earlier than `created`.
10. Reject the attempt when current time minus at most 300 seconds of clock tolerance is greater than or equal to `expires`.
11. Validate `Content-Digest` against the exact received content bytes.
12. Parse the content as a UTF-8 JSON object with duplicate-member rejection.
13. Validate the event against this Level 2 event profile's schema.
14. Extract and validate the canonical source domain.
15. Obtain source metadata and the matching public JWK from an acceptable cache or safe HTTPS discovery.
16. Reconstruct the RFC 9421 signature base from the received request.
17. Verify the ES256 signature.
18. Apply the receiver's source trust policy.
19. Require `source` plus `id` not to represent a conflicting previously processed event.
20. Correlate `pass_jti` with a pass issued by the receiver.
21. Require every event delivery `ref` to occur in that pass.
22. Record the event or recognize it as an idempotent retry.
23. Return the appropriate HTTP response.

The receiver MUST complete signature validation before treating any event statement as authentic. Parsing `source` for bounded discovery does not make other content trusted.

## 14. Acknowledgement and retry behavior

The receiver SHOULD validate and durably enqueue or record the event before returning `202 Accepted` or `204 No Content`. It SHOULD respond quickly and process customer notifications asynchronously.

The verifier treats any `2xx` response as acknowledgement. It MUST NOT retry an acknowledged event.

The verifier SHOULD retry after a connection failure, timeout, `408`, `425`, `429`, or `5xx` response. It SHOULD use exponential backoff with random jitter and honor a valid `Retry-After` field. It SHOULD treat other `4xx` responses as permanent unless an implementation agreement states otherwise.

Every retry MUST preserve the exact CloudEvent body, including `source`, `id`, `time`, `pass_jti`, and delivery references. Each retry MUST calculate a fresh HTTP message signature with new `created` and `expires` parameters.

At-least-once delivery means duplicates are normal. The receiver MUST process repeated events with the same `source` and `id` idempotently. If the same tuple arrives with different content, the receiver MUST reject it as an event identity conflict and SHOULD record a security signal.

Level 2 does not require indefinite retry. A verifier SHOULD stop according to its published operational policy. Failure to deliver the event MUST NOT revise the local result of the gate check.

## 15. Privacy and retention

The event MUST NOT contain:

- holder name or photograph;
- holder or recipient phone number;
- recipient, resident, or office contact name;
- complete address or unit data;
- vehicle registration;
- order contents or value;
- raw LMID pass bytes;
- guard identity;
- device identifier; or
- precise geographic coordinates.

The issuer already created `pass_jti` and delivery `ref` values. Reusing them avoids introducing a stable cross-platform person identifier.

The verifier SHOULD retain only the event ID, pass correlation, result, delivery-attempt state, and timestamps needed for reliability, audit, and grievance handling. The issuer SHOULD retain the derived checkpoint state rather than the complete signed HTTP request after its dispute and security window ends.

Neither party SHOULD use `gate_check_in` events to construct unrelated worker movement histories, advertising profiles, or property-visit profiles.

## 16. Error categories

An implementation MAY expose local error names. The following categories are RECOMMENDED:

| Error | Meaning |
| --- | --- |
| `event_too_large` | HTTP content exceeds 64 KiB. |
| `event_content_type_invalid` | HTTP Content-Type is not the required media type. |
| `event_digest_invalid` | Content-Digest is missing, malformed, unsupported, or does not match. |
| `event_signature_input_invalid` | Required RFC 9421 components or parameters are missing or different. |
| `event_signature_stale` | Signature timing is outside the accepted window. |
| `event_source_invalid` | Source is not a canonical participant HTTPS origin. |
| `event_metadata_unavailable` | No acceptable source metadata is available. |
| `event_source_mismatch` | Source domain differs from metadata domain. |
| `event_key_not_found` | No unique permitted JWK matches keyid. |
| `event_signature_invalid` | HTTP message signature verification failed. |
| `event_source_untrusted` | Local policy does not trust the source for events. |
| `event_schema_invalid` | CloudEvent does not satisfy this Level 2 event profile's schema. |
| `event_pass_unknown` | pass_jti does not identify a pass issued by the receiver. |
| `event_delivery_unknown` | A delivery ref is absent from the referenced pass. |
| `event_identity_conflict` | An existing source and id tuple has different content. |

An externally visible response SHOULD avoid revealing whether a particular pass or delivery exists when the requester is unauthenticated or its signature is invalid.

## 17. Conformance artifacts

The repository provides:

- an [event JSON example](../examples/events/gate-check-in.json);
- a [participant metadata example](../examples/metadata/participant-with-event-receiver.json);
- the [event JSON Schema](../schemas/lmid-gate-check-in-event.schema.json); and
- a generated and cryptographically verified RFC 9421 webhook fixture under [`tests/webhooks/gate-check-in/`](../tests/webhooks/gate-check-in/).

`npm test` validates the schemas, source-domain binding, receiver discovery data, content digest, signature input, signature base, P-256 signature, delivery-reference uniqueness, generated-fixture consistency, documentation links, Markdown, and spelling.

## 18. Further Level 2 scope: final gate result and other event types

This Level 2 event profile defines only `gate_check_in`. The remainder of this section reserves and scopes future work; it does not make another event valid under this Level 2 event profile.

### 18.1 Reserved `gate_check_result` event

`gate_check_result` is reserved as the future verifier-to-issuer event for the terminal result of the local gate workflow that followed a `gate_check_in` event. It will be a separate signed event, not a mutable field added to `gate_check_in`.

The current participant-metadata and event schemas do not advertise or accept `gate_check_result`. An implementation MUST NOT emit it under this Level 2 event profile, accept it as conforming to this Level 2 event profile, add a private result field to `gate_check_in`, or reinterpret `gate_check_in` as a final admission result.

### 18.2 Intended result semantics

The future event is expected to carry exactly one terminal visit-level result:

- `entry_granted`: the property granted local permission to enter;
- `entry_denied`: the property made a final decision not to grant entry; or
- `entry_not_completed`: the gate workflow ended without an entry grant or denial, for example because the holder left or the local process was abandoned.

`entry_granted` will assert a permission decision only. It will not prove that the holder physically crossed the gate, reached a unit, handed over a delivery, or completed an order. None of the three results will change the earlier signature, issuer-policy, or destination-match states.

A future profile may define a small optional reason-code vocabulary. It must not allow free-text reasons, resident or host identity, guard identity, contact data, complete address data, or other information unnecessary for issuer feedback.

### 18.3 Intended correlation and data

The future event is expected to contain:

- `gate_check_in_id`: the exact CloudEvent `id` of the related `gate_check_in`;
- `pass_jti`: the exact pass identifier carried by that event;
- `deliveries`: the same non-empty set of delivery `ref` values covered by that event; and
- `result`: one result from Section 18.2.

Its CloudEvent `source` will equal the verifier source that produced the related `gate_check_in`. Its top-level `time` will record when the verifier reached the terminal result. The event will use a new source-unique CloudEvent `id` and the same discovery, HTTP message signature, acknowledgement, retry, idempotency, and privacy principles as this profile.

The future receiver must be able to correlate an outcome even when network retries cause it to arrive before the referenced `gate_check_in`. It must not silently replace a previously accepted, conflicting result. A future profile must define correction behavior explicitly.

### 18.4 Intended future flow

The future end-to-end sequence is expected to be:

1. the verifier sends `gate_check_in` after successful signature verification, policy acceptance, and checkpoint applicability;
2. the issuer records checkpoint arrival independently of the later gate decision;
3. the verifier completes its local approval and entry workflow;
4. when that workflow reaches a terminal result, the verifier checks whether issuer metadata advertises `gate_check_result`;
5. if supported, the verifier sends one signed, correlated result event; and
6. the issuer validates it and records the result separately from checkpoint arrival and delivery completion.

Failure to send or receive the future result must not change the local gate decision or the earlier `gate_check_in` result.

### 18.5 Requirements for future standardization

Before `gate_check_result` becomes usable, a future specification must define its JSON Schema, metadata capability value, exact reason codes if any, signature requirements, error behavior, ordering and correction rules, privacy analysis, examples, and positive and negative conformance tests.

Gate exit, resident approval as a standalone event, recipient handoff, completed delivery, and automated physical-access events remain outside this profile. A future specification can define another type only with equally precise semantics and safeguards.

## 19. Normative references

- CloudEvents Specification Version 1.0
- RFC 3339, Date and Time on the Internet
- RFC 7517, JSON Web Key
- RFC 8615, Well-Known Uniform Resource Identifiers
- RFC 8941, Structured Field Values for HTTP
- RFC 9421, HTTP Message Signatures
- RFC 9530, Digest Fields
