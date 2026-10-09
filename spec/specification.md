# Bharat Last-Mile ID Level 1 Draft Specification

## Status of this document

This document defines Bharat Last-Mile ID, abbreviated as LMID, Level 1 Draft.

Level 1 defines a signed QR credential for device-to-device exchange at a delivery touch point. It defines issuance, representation, public-key discovery, verification, destination data, field restrictions, and reader behavior. Future Level 2 and Level 3 capabilities are outside this document's scope; see the [roadmap](roadmap.md).

Level names describe capability scope. Numeric schema and wire-format identifiers remain separate from these names and from editorial draft revisions. Future capability levels do not change the wire values defined by this Level 1 draft.

This document is a draft. Implementers may build prototypes and interoperability tests against it. They should not describe an implementation as finally standardized until the project publishes a final Level 1 specification.

The key words MUST, MUST NOT, REQUIRED, SHALL, SHALL NOT, SHOULD, SHOULD NOT, RECOMMENDED, NOT RECOMMENDED, MAY, and OPTIONAL in this document have the meanings defined by BCP 14 when they appear in uppercase.

## 1. Purpose

LMID lets a delivery platform issue a cryptographically signed pass after it assigns a delivery partner and confirms pickup or an equivalent eligible event. The delivery partner presents the pass from an official application. A reader application scans the QR, verifies the issuer signature, and reads the signed delivery and destination data.

LMID accelerates an existing gate or reception workflow. It does not replace the security guard, reception staff, manual visitor entry, resident approval, or local entry policy.

Level 1 promises signed autofill while existing admission authority remains intact. Its immediate objective is adoption through existing issuer and reader applications, reducing repeated work and making delivery interactions easier for the people using those systems. Broader privacy and data-handling improvements belong to Level 2 scope.

An issuer does not need to know which reader product, if any, exists at the destination. The issuer may generate an LMID pass for every eligible delivery. A compatible touch point may scan it. A touch point without a compatible reader continues its existing process.

## 2. Level 1 scope

### 2.1 Included

Level 1 includes:

- one static QR pass per intended touch-point visit;
- one or more delivery entries in one pass;
- a fixed, sparse destination schema;
- a delivery-partner display name;
- participant display identity and role discovery;
- an optional delivery-partner photo reference and digest;
- optional vehicle registration information;
- an issuer-controlled canonical domain identifier;
- automatic participant metadata and JWK Set discovery from a participant domain;
- ES256 signatures in compact JWS serialization;
- offline signature verification using previously authenticated cached keys;
- reader-side destination reconciliation;
- optional spoken verification feedback;
- a bounded set of delivery-related fields; and
- machine-readable JSON Schemas and signed conformance fixtures.

The shared participant metadata can advertise optional signed `gate_check_in` event delivery under the [Level 2 event sub-specification](gate-check-in-events.md). Event delivery is a Level 2 capability, not a Level 1 conformance requirement.

### 2.2 Excluded

Level 1 does not define:

- resident OTPs or one-time entry PINs;
- rotating QR codes;
- screenshot or pass-copy prevention;
- proof that the presenter possesses a device-bound private key;
- biometric or automated face matching;
- turnstiles, electronic gate control, or access-zone control;
- anti-tailgating or other physical-safety systems;
- tracking after a person passes the touch point;
- proof that a person visited only the signed unit;
- a national property identifier;
- a mandatory central issuer registry;
- a replacement for manual entry or approval; or
- encryption of destination fields.

Section 26 lists future considerations. Those considerations are non-normative and do not expand Level 1.

Level 1 keeps the signed payload limited to facts necessary to verify the issuer assertion, identify the holder and vehicle when supplied, and reconcile the destination. It does not add fields solely to describe an issuer's internal workflow or a verifier's local property model.

## 3. Roles

### 3.1 Issuer

The issuer is a delivery, courier, logistics, mobility, or service platform that creates and signs an LMID pass. The issuer controls the domain name identified by `iss` and protects the corresponding signing keys.

### 3.2 Holder

The holder is the assigned delivery partner and the official application that displays the pass.

### 3.3 Reader

The reader is the application that scans, parses, validates, and displays an LMID pass.

### 3.4 Verifier

The verifier is the organization or property operating the reader. The verifier decides which issuers it trusts and applies its local entry process.

### 3.5 Property

The property is the residential, commercial, institutional, or mixed-use destination applying its entry policy.

### 3.6 Recipient

The recipient is the resident, office, shop, reception, or other intended delivery endpoint. Level 1 normally identifies the destination without disclosing recipient contact data.

### 3.7 Delivery entry

A delivery entry is one member of `lmid.visit.deliveries`. It carries an issuer-scoped tracking reference and optional delivery-specific `building`, `block`, `floor`, and `unit` fields.

### 3.8 Pass

A pass is one signed LMID credential intended for one visit to one common place. A pass can contain between 1 and 32 delivery entries.

The 32-entry limit is a structural maximum, not a target batch size. When all deliveries for one visit cannot fit within either this limit or the compact-token size limit, the issuer creates multiple independently valid passes. The issuer and verifier decide how their applications present and process those passes.

## 4. Security meaning

When a Level 1 reader returns a successful cryptographic result, it asserts all of the following:

1. The token uses the LMID Level 1 syntax.
2. The signature validates with an allowed public key discovered from and bound to the issuer domain.
3. The token is within its permitted validity period.
4. The issuer signed the displayed holder, vehicle, place, and delivery data.
5. The issuer asserts that it assigned the included delivery entries to the displayed holder and issued the pass after its pickup or equivalent eligibility check.

A successful cryptographic result does not assert any of the following:

- a government authority verified the holder's civil identity;
- the presenter did not receive a screenshot or copy;
- the issuer's source data contains no mistake;
- a resident approved entry;
- local policy permits entry;
- the presenter will travel only to the stated unit; or
- an offline reader knows about a cancellation or reassignment that happened after issuance.

The reader MUST keep issuer signature verification, verifier policy acceptance, destination reconciliation, resident or host approval, and local entry permission as separate states. A valid signature proves control of the discovered issuer key and integrity of the signed claims. It does not require a verifier to accept that issuer under local policy.

## 5. Protocol overview

1. The issuer assigns one or more delivery events to a holder.
2. The issuer confirms pickup or another eligible fulfillment event.
3. The issuer groups delivery events intended for the same touch-point visit into one pass.
4. The issuer creates the JWS protected header and JWT Claims Set.
5. The issuer signs the compact JWS with an LMID-specific ES256 private key.
6. The holder application displays the compact JWS as a QR code.
7. The reader scans the QR and applies the verification procedure in Section 17.
8. The reader reconciles the signed place and endpoints with its local directory.
9. The reader auto-fills fields it can use and leaves the existing manual workflow available.
10. The verifier applies its existing notification, approval, and entry policy.

## 6. Conformance classes

### 6.1 Level 1 issuer

A conforming issuer MUST:

- create tokens that satisfy all Level 1 schemas and cross-field rules;
- sign tokens using ES256 and an LMID-specific key;
- publish conforming participant metadata and a JWK Set;
- issue a pass only after pickup or an equivalent eligible event;
- include only delivery entries assigned to the holder;
- avoid prohibited personal fields;
- keep every compact token at or below 2,048 ASCII bytes; and
- render the token using the QR profile in Section 7;
- make the pass visible only during its validity period.

### 6.2 Level 1 reader

A conforming reader MUST:

- enforce the input-size limit before parsing;
- accept only the Level 1 protected header and algorithm;
- validate the signature and all required claims;
- distinguish cryptographic verification, issuer-policy acceptance, destination matching, and local approval;
- preserve exact signed values for display and audit;
- handle unknown place-ID providers without failing the full pass;
- keep manual entry available; and
- present failures without labeling the issuer signature as verified.

### 6.3 Level 1 holder application

A conforming holder application MUST:

- display only a token obtained through the issuer's authenticated application flow;
- prevent display before the issuer permits presentation;
- display the complete compact JWS without modifying it; and
- clearly show that the pass has expired when local time is after `exp`.

## 7. Transport and size

### 7.1 QR content

The QR content MUST be exactly one compact JWS string. It MUST NOT contain a surrounding JSON object, URL wrapper, prefix, whitespace, line break, or explanatory text.

### 7.2 Encoding

The compact JWS consists only of ASCII characters. Its protected header and payload decode to UTF-8 JSON. JSON text MUST NOT contain a byte-order mark.

The three compact JWS segments use unpadded base64url encoding as defined by JWS. Implementations MUST reject non-URL-safe base64 characters and padding characters.

### 7.3 Maximum size

The complete compact JWS MUST NOT exceed 2,048 ASCII bytes. The reader MUST enforce this limit before base64url decoding or JSON parsing.

An issuer with too many delivery entries or overly long values MUST shorten non-essential values, omit optional fields, or create more than one pass. It MUST NOT truncate a value in a way that changes destination meaning.

### 7.4 Compression

Level 1 does not define payload compression. A reader MUST reject any JWS header that requests or declares compression.

### 7.5 Static presentation

Level 1 uses a static pass. The same compact token may be displayed more than once during its validity period. Level 1 does not require a local used-token cache and does not claim replay prevention.

### 7.6 QR symbol profile

An issuer MUST render the compact JWS as a QR Code Model 2 symbol conforming to ISO/IEC 18004:2024. It MUST use:

- byte mode;
- error-correction level M;
- the smallest QR version from 1 through 40 that can contain the token;
- the token's ASCII bytes directly, without an ECI designator;
- a quiet zone at least four modules wide on every side; and
- dark modules on a plain light background.

The symbol MUST NOT use Micro QR, rectangular micro QR, structured append, FNC1, an embedded logo, an overlay, inverted colors, or animation. A raster rendering MUST allocate at least four physical pixels to each module, including when the symbol is scaled. The holder application SHOULD keep the complete symbol and quiet zone visible, keep the display awake, and use high screen brightness while the pass is presented.

A conforming reader MUST decode QR Code Model 2 versions 1 through 40 in byte mode at error-correction level M. It MUST treat the decoded bytes as the ASCII compact JWS described in Section 7.1. Support for other QR modes, versions, or error-correction levels does not make a nonconforming LMID symbol conforming.

## 8. JWS serialization and signature

### 8.1 Serialization

The pass MUST use compact JWS serialization:

```text
BASE64URL(UTF8(protected-header)) .
BASE64URL(UTF8(jwt-claims-set)) .
BASE64URL(signature)
```

The actual token contains no whitespace or line breaks around the separators.

### 8.2 Algorithm

Level 1 supports only `ES256`. The issuer signs with ECDSA using the P-256 curve and SHA-256.

The JWS signature value MUST use the 64-byte JOSE representation consisting of the 32-byte unsigned big-endian `R` value followed by the 32-byte unsigned big-endian `S` value. It MUST NOT use ASN.1 DER encoding in the compact token.

### 8.3 Signing input

The signing input is the exact ASCII sequence:

```text
BASE64URL(protected-header) + "." + BASE64URL(jwt-claims-set)
```

The verifier MUST verify the exact encoded bytes. It MUST NOT parse and reserialize JSON before signature verification.

### 8.4 JSON member ordering

Level 1 does not require a canonical JSON member order. A signature protects the issuer's exact encoding. Test fixtures use stable pretty-printed source JSON and compact JSON during signing, but production issuers may use any valid JSON member order.

## 9. JWS protected header

The protected header MUST satisfy [`lmid-jws-header.schema.json`](../schemas/lmid-jws-header.schema.json). All protected-header members are REQUIRED. Unrecognized members are prohibited in Level 1.

```json
{
  "alg": "ES256",
  "kid": "test-key-01",
  "typ": "lmid+jwt"
}
```

### 9.1 `alg`

- Type: string
- Required: yes
- Allowed value: `ES256`

`alg` declares the signature algorithm. A reader MUST compare it to the Level 1 allowlist before using a key. A reader MUST reject `none`, all HMAC algorithms, all RSA algorithms, all other elliptic-curve algorithms, and any value it does not recognize.

### 9.2 `kid`

- Type: string
- Required: yes
- Length: 1 to 64 characters
- Characters: ASCII letters, digits, period, underscore, tilde, and hyphen

`kid` selects one key from the issuer's JWK Set. It is unique only within that issuer. A reader MUST reject a token when the JWK Set contains no matching key or more than one usable matching key.

### 9.3 `typ`

- Type: string
- Required: yes
- Allowed value: `lmid+jwt`

`typ` separates LMID passes from login tokens, OAuth tokens, and other JWT profiles. A reader MUST compare it exactly and case-sensitively.

## 10. JWT Claims Set

The JWT Claims Set MUST satisfy [`lmid-pass-payload.schema.json`](../schemas/lmid-pass-payload.schema.json). It contains exactly `iss`, `iat`, `nbf`, `exp`, `jti`, and `lmid` in Level 1. Additional top-level members are prohibited.

### 10.1 `iss`

- Type: string
- Required: yes
- Length: 3 to 253 ASCII characters
- Syntax: canonical bare domain name

`iss` identifies the issuer throughout LMID and supplies the domain used for key discovery. It MUST contain a lowercase ASCII domain name only. It MUST NOT contain a URI scheme, port, path, query, fragment, user information, IP address, wildcard, or trailing dot. Each DNS label MUST be 1 to 63 characters, must begin and end with an ASCII letter or digit, and may contain hyphens internally. The final label MUST begin with an ASCII letter. The name MUST contain at least two labels. An internationalized domain MUST use its lowercase IDNA A-label form.

Readers compare `iss` as an exact case-sensitive string after schema validation. They MUST NOT use substring or suffix matching. An issuer that uses `issuer.example` and an issuer that uses `sub.issuer.example` are distinct LMID issuers.

Example:

```json
{ "iss": "issuer.example" }
```

### 10.2 `iat`

- Type: integer NumericDate
- Required: yes

`iat` records the issuance time as whole seconds since 1970-01-01T00:00:00Z, excluding leap seconds. The issuer MUST set `iat` at or after the pickup or equivalent eligibility event. Fractional values are prohibited.

### 10.3 `nbf`

- Type: integer NumericDate
- Required: yes

`nbf` records the earliest time at which the pass is valid. The issuer MUST set `nbf` greater than or equal to `iat`.

### 10.4 `exp`

- Type: integer NumericDate
- Required: yes

`exp` records the first time at which the pass is expired. The issuer MUST set `exp` greater than `nbf`. The interval from `iat` to `exp` MUST NOT exceed 43,200 seconds, which is 12 hours.

An issuer SHOULD select the shortest duration suitable for the delivery type. A short food-delivery visit may use a much shorter duration than a courier batch.

### 10.5 `jti`

- Type: string
- Required: yes
- Length: 8 to 128 characters
- Characters: ASCII letters, digits, period, underscore, tilde, and hyphen

`jti` is an opaque pass identifier unique within the issuer. It MUST NOT be a stable worker identifier, customer identifier, phone number, or directly enumerable order number. Readers may use it for local correlation and duplicate-display diagnostics. Level 1 does not require readers to reject a previously seen `jti`.

### 10.6 Omitted registered JWT claims

Level 1 prohibits `aud` because the issuer does not know which compatible reader will receive a generic physical presentation. Level 1 also prohibits `sub` because a stable ecosystem-visible holder identifier is unnecessary and would increase tracking risk.

The explicit `typ`, dedicated metadata endpoint, LMID-specific signing keys, and mutually exclusive validation rules reduce cross-token confusion. Implementers MUST NOT reuse a key that signs login or access tokens as an LMID signing key.

### 10.7 `lmid`

- Type: object
- Required: yes

`lmid` contains all LMID-specific claims. It MUST contain `v`, `holder`, and `visit`. It MAY contain `vehicle`. Additional members are prohibited in Level 1.

## 11. `lmid` object

### 11.1 `lmid.v`

- Type: integer
- Required: yes
- Allowed value: `1`

`v` selects the LMID pass data schema. It is separate from the capability level and the document's editorial draft revision. A Level 1 reader MUST reject any value other than `1`. Using the pass with a Level 2 event does not change this value.

### 11.2 `lmid.holder`

- Type: object
- Required: yes
- Members: `name`, optional `photo`

`holder` describes the delivery partner whom the issuer assigned to the included delivery entries.

### 11.3 `lmid.holder.name`

- Type: string
- Required: yes
- Length: 1 to 128 Unicode characters

`name` is the issuer-verified display name that the reader shows to the guard or reception operator. The issuer defines how it enrolled or verified the name. LMID does not convert this value into a government identity claim.

The value MUST satisfy the Unicode text profile in Section 11.28. The issuer SHOULD use the holder's normal display script and spelling. The reader MUST preserve the exact signed value. The reader MAY render a locally transliterated form beside it.

### 11.4 `lmid.holder.photo`

- Type: object
- Required: no
- Members: `uri`, `sha256`

When present, `photo` identifies an issuer-authorized photo for human visual comparison. Both members are required together.

### 11.5 `lmid.holder.photo.uri`

- Type: string
- Required when `photo` is present: yes
- Maximum length: 512 characters
- Syntax: HTTPS URI

`uri` locates the photo bytes. It MUST use HTTPS. Its origin MUST equal `https://` followed by the exact `iss` domain with no explicit port, or it MUST appear in the participant metadata `photo_origins` list. It SHOULD be opaque, unguessable, purpose-limited, and short-lived.

### 11.6 `lmid.holder.photo.sha256`

- Type: string
- Required when `photo` is present: yes
- Syntax: exactly 64 lowercase hexadecimal characters

`sha256` is the SHA-256 digest of the exact downloaded photo bytes. The reader MUST calculate the digest before display and compare it in constant time where practical. A mismatch produces `photo_digest_mismatch` and the reader MUST NOT display the downloaded bytes as verified.

The digest proves byte integrity relative to the signed pass. It does not prove liveness, capture time, civil identity, or a face match.

### 11.7 `lmid.vehicle`

- Type: object
- Required: no
- Members: `registration`, `country`

`vehicle` identifies the vehicle used for the visit when the issuer has this information and has a valid reason to disclose it. Both members are required when the object is present.

### 11.8 `lmid.vehicle.registration`

- Type: string
- Required when `vehicle` is present: yes
- Length: 1 to 32 characters
- Characters: ASCII letters, digits, spaces, and hyphens

`registration` carries the displayed registration mark. The issuer SHOULD use the registration shown in its current operational record. The reader MUST preserve the signed value.

For matching only, a reader MAY derive a comparison value by converting ASCII letters to uppercase and removing spaces and hyphens. The derived value does not replace the signed value.

LMID MUST NOT carry the vehicle owner's name, registration certificate, chassis number, engine number, or a government registry response.

### 11.9 `lmid.vehicle.country`

- Type: string
- Required when `vehicle` is present: yes
- Syntax: two uppercase ASCII letters

`country` identifies the registration country using an ISO 3166-1 alpha-2 code. Indian registrations use `IN`.

### 11.10 `lmid.visit`

- Type: object
- Required: yes
- Members: `place`, `deliveries`

`visit` groups the common destination context and all delivery entries intended for the same touch point.

### 11.11 `lmid.visit.place`

- Type: object
- Required: yes

`place` contains address values common to the visit. It MUST contain `address`. Other place members are optional because issuers possess different levels of address structure.

The issuer MUST include only fields it has. It MUST NOT infer or invent a missing block, building, floor, or unit merely to satisfy a local-looking hierarchy.

`place` describes only the common gate-level property, such as a society, community, complex, campus, or commercial park. It MUST NOT contain `building`, `block`, `floor`, or `unit`. Those endpoint fields belong to each delivery entry.

### 11.12 `place.name`

- Type: string
- Required: no
- Length: 1 to 256 characters

`name` is the known name of the common society, community, campus, complex, property, or business park. Examples include `Lake View Residency` and `Sahyadri Business Park`. In the minor standalone-premises fallback, it MAY be the premises name.

### 11.13 `place.address`

- Type: string
- Required: yes
- Length: 1 to 512 characters

`address` preserves the issuer's full human-readable address. It is useful as a display fallback and as input to assisted reconciliation. Structured fields, when present, remain authoritative for field-by-field matching.

### 11.14 `place.country`

- Type: string
- Required: no
- Syntax: two uppercase ASCII letters

`country` is the ISO 3166-1 alpha-2 country code. An Indian destination uses `IN`.

### 11.15 `place.state`

- Type: string
- Required: no
- Length: 1 to 128 Unicode characters

`state` is the state, union territory, province, or equivalent top-level administrative area as represented by the issuer.

### 11.16 `place.district`

- Type: string
- Required: no
- Length: 1 to 128 Unicode characters

`district` is the administrative district when known. It is not a substitute for `city`.

### 11.17 `place.city`

- Type: string
- Required: no
- Length: 1 to 128 characters

`city` is the city, town, village, or municipality used by the issuer. Level 1 does not split city, town, and village into separate members.

### 11.18 `place.area`

- Type: string
- Required: no
- Length: 1 to 128 characters

`area` is the locality, neighbourhood, colony, sector, or named sub-area used by the issuer.

### 11.19 `place.street`

- Type: string
- Required: no
- Length: 1 to 256 characters

`street` is the street, road, lane, cross, or named access route.

### 11.20 `place.landmark`

- Type: string
- Required: no
- Length: 1 to 256 characters

`landmark` is a publicly recognizable location description used in the delivery address. It MUST NOT contain private access instructions, door codes, or resident contact details.

### 11.21 `place.postal_code`

- Type: string
- Required: no
- Length: 1 to 32 characters

`postal_code` is the postal code in string form. The value remains a string so leading zeros and non-Indian formats remain representable. Indian PIN codes normally contain six digits, but the LMID structural schema does not force one national format.

### 11.22 `place.place_ids`

- Type: array
- Required: no
- Length: 1 to 8 items when present
- Item type: place-ID object

`place_ids` provides one or more provider-qualified location identifiers. Duplicate objects are prohibited. No place-ID provider is mandatory.

### 11.23 `place_ids[].provider`

- Type: string
- Required: yes
- Length: 2 to 64 characters under the schema pattern
- Syntax: lowercase ASCII letter followed by lowercase letters, digits, or hyphens

`provider` names the place-ID system that produced the identifier. The informative [`place-id-providers.json`](../data/place-id-providers.json) registry supplies parsing guidance for known providers, but it is not an authorization source and is not required for participant discovery.

A reader that does not support the provider MUST ignore that place-ID item for matching. It MUST continue processing the signed address fields and any other supported place IDs.

### 11.24 `place_ids[].id`

- Type: string
- Required: yes
- Length: 1 to 256 characters

`id` is the provider-specific identifier. The 256-character maximum applies to every provider, including providers that support longer identifiers outside LMID. An issuer MUST NOT truncate a place ID to fit this limit. It MAY omit an oversized optional place ID and retain the ordinary destination fields; the reader then reconciles those fields or uses manual handling.

A reader that supports the provider MUST validate this value using the rules for its supported provider implementation. A malformed supported value causes the reader to reject Level 1 credential verification with `invalid_place_id`, before reporting `signature_verified`. This is a claims-validation failure, not a statement that the underlying ES256 signature calculation failed. The reader MUST retain manual entry fallback.

The informative provider registry defines initial identifiers, syntax, examples, limitations, and source references. An issuer MAY use a provider absent from a reader's current registry or implementation. An unknown provider never invalidates the pass, and the mandatory ordinary destination fields ensure that Level 1 verification does not depend on a place-ID registry.

### 11.25 `lmid.visit.deliveries`

- Type: array
- Required: yes
- Length: 1 to 32 delivery entries

`deliveries` contains every delivery event covered by the pass. The issuer MUST include only events assigned to the holder and intended for the common place.

Every `ref` value in the array MUST be unique within the pass. Two distinct deliveries to the same destination use two delivery entries with different references.

### 11.26 `deliveries[].ref`

- Type: string
- Required: yes
- Length: 8 to 128 characters
- Characters: ASCII letters, digits, period, underscore, tilde, and hyphen

`ref` is an issuer-scoped tracking or correlation reference for one delivery event. It can contain an air waybill number, order ID, delivery ID, service ID, or another issuer-assigned operational identifier. It lets the reader distinguish deliveries and lets the issuer, holder, verifier, or support process refer to the correct delivery when necessary.

`ref` MUST NOT contain a phone number, customer account identifier, resident identifier, recipient name, or order contents. An issuer SHOULD choose the least revealing identifier that remains useful for delivery tracking and support. A reader MUST treat the value as an issuer-specific string and MUST NOT infer undocumented semantics from its format.

### 11.27 Delivery endpoint fields

- Fields: `deliveries[].building`, `deliveries[].block`, `deliveries[].floor`, `deliveries[].unit`
- Type of each field: string
- Required: no
- Length: 1 to 128 Unicode characters for `building` and `block`; 1 to 64 ASCII characters for `floor` and `unit`

These fields identify the endpoint for one delivery inside the common `place`. `building` is a tower, building, house name, house number, or separately named structure. `block` is a block, wing, phase, cluster, or comparable subdivision. `floor` is a floor or level. `unit` is the final endpoint identifier, such as a flat, office, shop, suite, reception, or room identifier.

Every delivery entry MUST contain at least one of `building`, `block`, or `unit`. It MAY contain any two or all three. `floor` is optional and does not by itself satisfy this requirement. A verifier MAY still determine that an endpoint is insufficient for its local directory and use manual handling.

`building` and `block` use the Unicode text profile in Section 11.28. `floor` MUST match `^[A-Za-z0-9][A-Za-z0-9 ._/#()+&-]{0,63}$`. `unit` MUST match `^[A-Za-z0-9][A-Za-z0-9 ._/#(),+&-]{0,63}$`, which also permits commas in customer-entered compound endpoint labels. Examples include `12`, `13`, `13A`, `Ground Floor`, `G+2`, `1204`, `13-A`, `B/1204`, `G-02`, and `1204, Building R`. A unit value SHOULD be the concise local identifier when the issuer has that structured value; an issuer MAY preserve a compound label rather than guess its components. Implementations MUST preserve `unit` as a string and MUST NOT convert it to a number.

A standalone house is a minor fallback case. It MAY use the house name or number as `deliveries[].building` when no separate unit, block, or floor exists.

### 11.28 Unicode text profile

Human-language fields support Unicode so names and addresses can preserve their normal scripts. Before signing, an issuer MUST encode every human-language string as a sequence of Unicode scalar values normalized to Unicode Normalization Form C (NFC). Such a string MUST NOT:

- be empty or consist only of whitespace;
- contain leading or trailing whitespace;
- contain C0 or C1 control characters;
- contain Unicode line or paragraph separators;
- contain surrogate code points or Unicode noncharacters; or
- contain bidirectional embedding, override, or isolate control characters.

These rules apply to participant metadata `display_name`, `holder.name`, `place.name`, `place.address`, `place.state`, `place.district`, `place.city`, `place.area`, `place.street`, `place.landmark`, `place.postal_code`, `deliveries[].building`, and `deliveries[].block`. The restricted ASCII profiles defined for `deliveries[].floor` and `deliveries[].unit` apply instead to those two fields. Readers MUST preserve valid signed payload strings exactly and MUST NOT normalize or reserialize them before signature verification. Metadata consumers MUST preserve `display_name` as received after validation.

### 11.29 Prohibited recipient and contact fields

Level 1 defines no recipient name, phone number, email address, customer account ID, resident ID, or access code. An issuer MUST NOT add these through private properties because Level 1 rejects unknown members.

If communication is necessary, an implementation SHOULD provide a mediated call or message action outside the signed pass so neither party learns the other's phone number.

## 12. JSON Schema behavior

Level 1 uses JSON Schema Draft 2020-12.

The schemas define structural constraints. The prose defines additional constraints that JSON Schema cannot express conveniently, including:

- `iss` must be a canonical bare domain name;
- `iat <= nbf < exp`;
- `exp - iat <= 43,200` seconds;
- delivery references must be unique within the pass;
- compact JWS size must not exceed 2,048 bytes;
- a supported place-ID value must satisfy its provider-specific rules; and
- photo origin must match participant metadata.

Schema validation cannot express the NFC normalization requirement. Conformance tests MUST exercise this semantic rule in addition to validating the JSON Schemas.

When the prose and schema conflict, a conforming implementation MUST apply the stricter rule and report the conflict to the project. The project MUST resolve the conflict before final Level 1 publication.

## 13. Issuance requirements

### 13.1 Eligible event

The issuer MUST NOT issue or expose the pass before it confirms pickup or another fulfillment event that makes the holder responsible for the delivery.

### 13.2 Assignment

At issuance time, every delivery entry MUST be assigned to the holder named in `lmid.holder.name` according to the issuer's operational system.

### 13.3 Grouping

The issuer MAY group deliveries when they share one intended touch point. It MUST NOT group deliveries for unrelated properties merely to reduce token count.

### 13.4 Data minimization

The issuer MUST include only the fields needed to identify the holder, vehicle when relevant, place, and delivery endpoints. Optional data is not automatically appropriate data.

### 13.5 Reassignment, cancellation, and redelivery

When assignment changes, the issuer MUST stop displaying the old pass and issue a new pass for the new holder. When a delivery is cancelled, the issuer MUST stop displaying a pass that contains only that delivery. For a batch, the issuer SHOULD issue an updated pass when cancellation materially changes the intended destination list.

An offline Level 1 reader cannot receive real-time cancellation or reassignment state. Expiration bounds this limitation but does not eliminate it.

### 13.6 Token generation order

The issuer SHOULD:

1. construct and validate the Claims Set;
2. enforce cross-field rules;
3. construct and validate the protected header;
4. compactly serialize both JSON objects as UTF-8;
5. base64url-encode both objects without padding;
6. sign the exact signing input with ES256;
7. encode the JOSE `R || S` signature without padding;
8. assemble the compact JWS;
9. enforce the 2,048-byte limit; and
10. render the exact compact string as a QR code.

When either the 32-delivery limit or 2,048-byte limit would be exceeded, the issuer MUST create multiple independently valid passes rather than omit a delivery or produce a nonconforming token.

## 14. Participant metadata

### 14.1 Metadata URL

For issuer domain `issuer.example`, the reader obtains metadata from:

```text
https://issuer.example/.well-known/bharat-last-mile-id
```

The reader MUST form this URL by prepending `https://` to the validated `iss` value and appending `/.well-known/bharat-last-mile-id`. The resulting URL contains no explicit port and uses the default HTTPS port. The reader MUST NOT accept a metadata URL supplied inside the pass.

### 14.2 Metadata media type and limits

The server SHOULD return `application/json`. The reader MUST limit the response body to 64 KiB before parsing. The response MUST satisfy [`lmid-participant-metadata.schema.json`](../schemas/lmid-participant-metadata.schema.json).

Example:

```json
{
  "domain": "issuer.example",
  "display_name": "Example Logistics",
  "roles": ["issuer"],
  "jwks_uri": "https://issuer.example/.well-known/bharat-last-mile-id.jwks",
  "versions_supported": [1],
  "token_types_supported": ["lmid+jwt"],
  "photo_origins": ["https://issuer.example"]
}
```

### 14.3 `domain`

- Type: canonical bare domain name string
- Required: yes
- Length: 3 to 253 ASCII characters

`domain` identifies the metadata owner. It obeys the same domain-name syntax as token `iss` and MUST equal token `iss` exactly during pass verification. A mismatch causes `metadata_domain_mismatch`.

The participant domain is the participant's LMID identifier. No central partner registration or catalog lookup is required to derive or retrieve this metadata document.

### 14.4 `display_name`

- Type: Unicode string
- Required: yes
- Length: 1 to 128 Unicode characters

`display_name` is the participant's self-asserted public display name. It MUST satisfy the Unicode text profile in Section 11.28. A reader displaying the name MUST also retain or make available the canonical `domain`. The display name does not establish verifier policy acceptance and MUST NOT replace `domain` for metadata binding, key selection, or comparison.

### 14.5 `roles`

- Type: array of unique strings
- Required: yes
- Allowed values: `issuer`, `verifier`
- Length: 1 to 2 items

`roles` declares the LMID protocol roles for which the participant publishes capabilities. A pass issuer MUST include `issuer`. A Level 2 event source MUST include `verifier`. A participant performing both roles includes both values.

### 14.6 `jwks_uri`

- Type: HTTPS URI string
- Required: yes
- Maximum length: 512 characters

`jwks_uri` identifies the JWK Set used to validate LMID signatures. Level 1 RECOMMENDS the origin formed as `https://` followed by the exact `domain`. A reader MAY accept another HTTPS origin only when explicit verifier configuration permits it. It MUST reject user information, fragments, unsafe redirects, local addresses, and private-network destinations.

### 14.7 `versions_supported`

- Type: array of unique positive integers
- Required: yes
- Minimum length: 1

`versions_supported` lists LMID wire-format versions the participant supports, not capability levels. A Level 1 pass issuer MUST include `1`. Advertising a Level 2 event receiver does not require the value `2`; event support is advertised separately through `event_receiver`.

### 14.8 `token_types_supported`

- Type: array of unique strings
- Required for a pass issuer: yes
- Minimum length: 1

`token_types_supported` lists explicit JWS `typ` values. A Level 1 issuer MUST include `lmid+jwt`.

### 14.9 `photo_origins`

- Type: array of unique HTTPS origins
- Required: no
- Maximum length: 16 items

`photo_origins` lists origins allowed for `photo.uri`. If it is absent, only the origin formed as `https://` followed by the exact `domain` is allowed. Each value MUST be an origin URL without user information, query, fragment, or non-root path.

### 14.10 `event_receiver`

- Type: object
- Required: no
- Required members when present: `uri`, `types_supported`

`event_receiver` advertises an optional Level 2 HTTPS endpoint and the event types it accepts. The current Level 2 event profile defines only `gate_check_in`. The [Level 2 `gate_check_in` event sub-specification](gate-check-in-events.md) defines discovery, event semantics, HTTP message signatures, verification, retries, privacy, and conformance requirements.

Operational endpoints are discovered only from the participant's domain-controlled metadata.

## 15. JWK Set requirements

The `jwks_uri` response MUST be a JWK Set as defined by RFC 7517. The reader MUST limit the body to 256 KiB.

Each LMID signing key usable for Level 1 MUST contain:

| JWK member | Required value or rule |
| --- | --- |
| `kty` | `EC` |
| `crv` | `P-256` |
| `x` | 32-byte P-256 x-coordinate encoded as unpadded base64url |
| `y` | 32-byte P-256 y-coordinate encoded as unpadded base64url |
| `kid` | Exact identifier referenced by the protected header |
| `use` | `sig` |
| `alg` | `ES256` |

The public JWK MUST NOT contain `d` or any other private-key material.

A participant MUST publish a new public key at least 24 hours before it begins signing LMID passes or webhook attempts with the new `kid`. It MUST retain an old public key until every pass signed by that key has expired and every permitted event retry has ended, plus the allowed five-minute clock tolerance. If a private key is compromised, the participant MUST stop using it and remove its public key from the published JWK Set as soon as operationally possible.

## 16. Participant trust and discovery safety

### 16.1 Discovery is not trust

TLS, domain-derived participant metadata, and signature verification bind a pass to a participant domain. Any participant can develop, test, publish conforming metadata, and launch independently without a central registration step or bilateral technical integration.

Cryptographic verification does not require a verifier to accept the issuer. A verifier MAY apply its own acceptance policy after signature verification, including an allowlist, denylist, consortium policy, first-seen confirmation, or acceptance of any cryptographically verified participant. The policy and its governance are outside Level 1. Two conforming verifiers may therefore reach different policy-acceptance results for the same cryptographically valid pass.

### 16.2 Network protections

For participant metadata, JWK Set, and photo retrieval, a reader MUST:

- require HTTPS;
- reject URL user information and fragments;
- reject loopback, link-local, multicast, and private-network destinations unless an explicit enterprise policy permits a private issuer;
- limit redirects to five;
- reapply all URL and address checks after every redirect;
- enforce connection and response timeouts;
- enforce response-size limits before parsing or decoding; and
- avoid sending authorization cookies or unrelated credentials.

### 16.3 Key separation

The issuer MUST use keys dedicated to LMID. It MUST NOT use an LMID key to sign login sessions, API access tokens, password-reset tokens, or unrelated document types.

## 17. Reader verification procedure

A Level 1 reader MUST perform the following cryptographic verification steps in order. When a step through signature or claim validation fails, the reader stops cryptographic verification and returns the corresponding error category. Policy acceptance and destination reconciliation occur after cryptographic verification and do not revise the signature result.

1. Read the QR as an ASCII string.
2. Reject an input longer than 2,048 bytes as `token_too_large`.
3. Require exactly three non-empty segments separated by two periods.
4. Strictly base64url-decode the protected header and payload without accepting padding.
5. Parse both decoded values as UTF-8 JSON objects with duplicate-member rejection.
6. Validate the protected header against the Level 1 header schema.
7. Validate the Claims Set against the Level 1 payload schema.
8. Validate `iss` as a canonical bare domain name.
9. Obtain matching participant metadata from an acceptable cache or the well-known URL.
10. Require metadata `domain` to equal `iss`.
11. Require metadata `roles` to include `issuer`, version `1`, and token type `lmid+jwt`.
12. Obtain the JWK Set from an acceptable cache or `jwks_uri`. When online cached keys contain no matching `kid`, refresh the JWK Set once before returning `key_unavailable`.
13. Select exactly one valid public signing key matching `kid`, `kty`, `crv`, `use`, and `alg`.
14. Verify the ES256 signature over the exact compact signing input.
15. Require `iat <= nbf < exp`.
16. Require `exp - iat <= 43,200` seconds.
17. Use a clock tolerance `t` where `0 <= t <= 300` seconds. Reject as `not_yet_valid` when `now + t < nbf`. Reject as `expired` when `now - t >= exp`. At the maximum permitted tolerance, the expiration formula is `now - 300 seconds >= exp`.
18. Require every `deliveries[].ref` to be unique within the pass.
19. Apply the Unicode, restricted-field, and effective-destination rules in Section 11.
20. Validate every supported place-ID provider value. Reject a malformed supported value as `invalid_place_id`. Ignore unsupported providers for matching.
21. Mark the issuer signature state as `signature_verified`.
22. Apply the verifier's issuer policy and record `policy_accepted` or `policy_denied` without changing `signature_verified`.
23. If `photo` exists and the reader displays it, retrieve and validate it as Section 18 defines.
24. Reconcile each delivery endpoint with the common place separately.
25. Present the signature, policy, destination, approval, and entry states separately.

A reader MUST reject JSON objects containing duplicate member names. It MUST NOT keep the last value silently.

## 18. Photo retrieval

Photo retrieval is optional. Signature verification does not fail merely because the reader chooses not to retrieve an optional photo.

When the reader retrieves a photo, it MUST:

1. validate the URI origin against participant metadata;
2. fetch it without unrelated cookies or credentials;
3. allow only `image/jpeg`, `image/png`, or `image/webp`;
4. reject a response larger than 256 KiB;
5. compute SHA-256 over the exact response bytes;
6. compare the digest with `photo.sha256`; and
7. delete transient bytes when the gate interaction ends.

The reader SHOULD delay retrieval until the operator needs the photo because the request can reveal scan timing and network information to the issuer.

The reader MUST label a valid photo as issuer-provided. It MUST NOT label it as a live face match.

## 19. Destination reconciliation

### 19.1 Responsibility

The reader performs reconciliation because it knows its own property, building, and unit directory. The issuer supplies signed source values and optional place IDs. The issuer does not need a reader vendor's private society ID.

A property name or building label alone MUST NOT establish an `exact` destination match. The reader MUST establish the common place through a curated exact place-ID or address binding, or sufficient normalized fixed address fields, before matching a delivery endpoint. A common-place ID does not by itself identify an internal building, block, floor, or unit; those fields still require reconciliation with the local directory. Without sufficient evidence, the reader uses a suggested or unmatched state and manual handling. Place IDs remain optional because a curated exact address binding can also establish the common place.

A supported place ID anchors deterministic resolution to the reader's local building or property record at the level identified by that provider. When supported place IDs are supplied, at least one MUST resolve to the common place before the reader can accept a delivery endpoint as exact. The reader MUST NOT silently replace a failed supported place-ID resolution with a name or address-text match. Unsupported providers remain ignored as Section 11.23 requires.

### 19.2 Match order

The reader SHOULD apply this order:

1. previously curated exact place-ID or address binding;
2. exact comparison of normalized fixed fields;
3. supported place-ID candidate lookup followed by fixed-field comparison;
4. property-approved aliases;
5. assisted or fuzzy candidate ranking with operator confirmation; and
6. unmatched display with manual entry fallback.

### 19.3 Deterministic normalization

A reader MAY derive comparison forms using:

- Unicode normalization;
- Unicode-aware case folding;
- trimming and collapsing whitespace;
- consistent treatment of harmless punctuation;
- versioned locale-specific abbreviation dictionaries; and
- property-approved aliases.

Once the common place is established, the reader MUST attempt deterministic resolution of differently formatted customer-supplied endpoint labels against its local directory. It MAY automatically parse component labels, reorder explicit components, normalize harmless separators, and recognize building or block values when those values identify one compatible local record. Examples include resolving `R 1204`, `R-1204`, and `1204, Building R` to the same local building `R`, unit `1204`. A manager-approved alias is an optional additional method, not a prerequisite for automatic parsing.

The reader MUST preserve the signed label and distinguish parsed or locally resolved components from the issuer's explicit structured fields. It MUST NOT accept a parsed or aliased match when another supplied endpoint field conflicts with the local record, or claim an exact match when multiple compatible records remain. An explicit `Building R` and an explicit `Block R` are different component types unless curated local evidence establishes their equivalence. Formatting rules MUST NOT indiscriminately remove punctuation or suffixes that distinguish units. Parsing components explicitly present in a compound label is permitted; inventing absent components is not.

Normalization MUST NOT:

- convert `13A` or `13B` to numeric `13`;
- assume `Block A`, `Tower A`, and `Wing A` are equal;
- invent missing signed floor, block, building, or unit fields; any additional components retrieved from the matched directory remain separately labeled local facts;
- replace a named villa with a number without curated evidence;
- treat transliteration alone as exact identity; or
- modify the signed source object.

### 19.4 AI-assisted reconciliation

AI MAY parse `place.address`, propose field values, transliterate scripts, rank local candidates, and suggest aliases for administrator review.

AI MUST NOT:

- participate in signature validation;
- invent absent signed facts;
- silently change signed data;
- make the local admission decision;
- turn an uncalibrated score into an exact match; or
- send LMID personal data to an external model without a documented lawful basis and data-processing policy.

The UI SHOULD show matching and conflicting fields, not only a confidence percentage.

### 19.5 Match states

A reader SHOULD expose these destination states:

- `exact`: deterministic or previously curated exact binding;
- `suggested`: one or more candidates require operator confirmation;
- `conflict`: important signed fields disagree with the selected local record; and
- `unmatched`: evidence is insufficient.

An unresolved destination does not change a valid signature into an invalid signature. The reader MUST reject the ID card for signed autofill with `unit_not_found` when any delivery's common place or endpoint cannot be resolved to one exact local destination. A `suggested`, `conflict`, or `unmatched` result is not an accepted resolution. The reader MUST retain the existing manual entry and approval process; it MUST NOT silently discard an unresolved delivery from a batch and accept the remaining card. A manually confirmed candidate can subsequently become an exact local match, with the signed source text preserved.

### 19.6 Example: customer and building-manager data gaps

An issuer receives destination text from its customer. The reader's building and unit directory is maintained by the property manager. Those sources can describe the same endpoint differently; signing the customer's text does not reconcile the two records or establish that the customer entered it correctly.

For example, a supported place ID resolves to the local record for Aparna Serene Park. The customer enters `R 1204`, while the manager's canonical endpoint label is `R-1204`, with structured building `R` and unit `1204`. The reader is responsible for resolving that difference within the identified property. It can do so automatically when parsing and comparison establish one compatible local record; no preconfigured alias is required. It displays the original signed value beside the resolved local label and does not change the signed value.

| Customer-supplied value | Local directory evidence | Reader outcome |
| --- | --- | --- |
| `R 1204` or `R-1204` | One record has building `R`, unit `1204`; only the separator differs. | Automatically resolve to `R-1204`; continue to the existing approval process. |
| `1204, Building R` | One record has building `R`, unit `1204`; component order differs. | Automatically parse and resolve to `R-1204`, preserving the original signed label. |
| `1204, Block R` | One record has block `R`, unit `1204`. | Automatically resolve using the block field; do not silently substitute a building field. |
| `R 1204` | Multiple compatible records remain after parsing. | Reject the ID card with `unit_not_found`; request manual confirmation. |
| `R 1204A` | Only building `R`, unit `1204` exists. | Reject the ID card with `unit_not_found`; the suffix must not be removed. |
| `R 9999` | No such local endpoint exists. | Reject the ID card with `unit_not_found`; use manual entry. |
| `R 1204` | The supplied supported place ID cannot resolve to the local property. | Reject the ID card with `unit_not_found`; do not use the name to override the failed resolution. |

The issuer signature result remains separate in every case. An exact destination match also does not supply resident approval or local entry permission.

## 20. User interface and manual workflow

The reader MUST display these states independently:

- issuer signature status;
- verifier issuer-policy status;
- issuer display name and canonical domain from participant metadata;
- holder display name;
- photo status when used;
- vehicle registration when supplied;
- number of delivery entries;
- destination match status for each delivery;
- resident or host approval status when the local system provides it; and
- final local entry decision.

The reader MUST NOT use one generic green badge to combine signature verification, destination matching, approval, and entry permission.

For each delivery, the reader SHOULD present signed destination fields in the stable order `name`, `address`, `building`, `block`, `floor`, and `unit`. When it also presents a local match, it SHOULD keep issuer-supplied and local values distinguishable.

The reader MUST retain a manual entry path for unsupported, malformed, policy-denied, expired, or unmatched passes.

Optional spoken feedback MAY announce a concise result such as `Credential verified. Holder: Ramesh Kumar.` It SHOULD NOT announce unit numbers, recipient names, phone numbers, or complete addresses in a public gate area.

The UI SHOULD support local languages and scripts. It MUST preserve the exact signed values when it also displays translations or transliterations.

## 21. Level 1 data boundary

### 21.1 Level 1 field boundary

Level 1 prohibits holder and recipient phone numbers, resident contact details, order contents, government identifiers, and stable ecosystem-wide worker identifiers.

These field restrictions keep the credential limited to the delivery interaction. They do not establish a complete privacy framework for the participating applications. Level 1 focuses on signed autofill and adoption through existing workflows.

### 21.2 Technical logging boundary

Logs MUST NOT contain photo bytes, complete compact tokens, signing keys, resident contact data, or external AI prompts containing personal data. Operational logs SHOULD use opaque references.

## 22. Offline behavior and caching

### 22.1 Cached verification material

A reader MAY verify offline using metadata and public keys that it previously obtained through conforming HTTPS discovery and associated with the exact issuer domain. It MUST NOT use participant metadata or a JWK Set more than 24 hours after the reader last retrieved or successfully revalidated that document.

While online, the reader MUST honor shorter HTTP freshness lifetimes and MUST cap any longer freshness lifetime at 24 hours. When a cached JWK Set contains no matching `kid`, the reader MUST attempt one immediate refresh before returning `key_unavailable`. A successful retrieval or HTTP revalidation restarts the 24-hour period. A failed retrieval does not.

### 22.2 No usable cached key

When the reader is offline and has no matching key within the permitted 24-hour cache period, it returns `key_unavailable`. It MUST NOT treat the pass as cryptographically verified.

### 22.3 Cancellation status

Level 1 carries no online status endpoint. An offline or online reader verifies the signed issuance state, not current cancellation state.

## 23. Error and outcome codes

A conforming reader SHOULD expose stable machine-readable codes and a localized human message.

| Code | Meaning |
| --- | --- |
| `malformed_qr` | QR content is not a valid compact JWS string. |
| `token_too_large` | Compact token exceeds 2,048 bytes. |
| `invalid_base64url` | A JWS segment is not strict unpadded base64url. |
| `invalid_json` | Decoded header or payload is not valid UTF-8 JSON. |
| `duplicate_json_member` | A JSON object repeats a member name. |
| `unsupported_header` | Protected header violates the Level 1 schema. |
| `unsupported_version` | `lmid.v` is not `1`. |
| `invalid_claims` | Claims Set violates structural or cross-field rules. |
| `policy_denied` | Signature verification succeeded, but local verifier policy does not accept `iss`. |
| `metadata_unavailable` | Participant metadata is unavailable and no usable cache exists. |
| `metadata_domain_mismatch` | Metadata `domain` does not equal token `iss`. |
| `key_unavailable` | No usable matching key exists. |
| `invalid_signature` | ES256 verification fails. |
| `not_yet_valid` | Current time is before the permitted validity window. |
| `expired` | Current time is at or after expiration after tolerance. |
| `invalid_place_id` | A supported provider-specific value is malformed; Level 1 credential verification is rejected. |
| `photo_unavailable` | Optional photo retrieval failed. |
| `photo_digest_mismatch` | Photo bytes do not match the signed digest. |
| `destination_exact` | Reader found an exact destination match. |
| `destination_suggested` | Reader found candidates requiring confirmation. |
| `destination_conflict` | Important signed fields conflict with a local record. |
| `destination_unmatched` | Reader found no adequate local match. |
| `unit_not_found` | A common place or delivery endpoint did not resolve to one exact local destination; the ID card is rejected for signed autofill. |
| `signature_verified` | Signature and required Level 1 claims are valid. |
| `policy_accepted` | Local verifier policy accepts the cryptographically verified issuer. |

Policy, destination, and photo codes are separate outcomes. For example, a reader can report `signature_verified`, `policy_accepted`, and `destination_unmatched`, then use manual entry.

## 24. Security considerations

### 24.1 Copied passes

Level 1 accepts bearer presentation and does not prevent copied passes. Short validity limits exposure but does not prevent use during the validity window. Reader interfaces MUST NOT claim holder proof of possession.

### 24.2 Stolen holder device

A stolen unlocked holder device may display a valid pass. Device authentication, application session security, and remote account controls belong to the issuer application and remain outside LMID Level 1.

### 24.3 Compromised issuer key

An attacker with an issuer private key can create valid passes. Issuers MUST protect keys in suitable key-management systems, restrict signing access, and stop using compromised keys. Public-key removal and rotation follow Section 15.

### 24.4 Algorithm confusion

Readers MUST allow only ES256, require `kty=EC` and `crv=P-256`, and reject symmetric use of public-key material.

### 24.5 Cross-JWT confusion

Readers MUST require `typ=lmid+jwt`, LMID-specific metadata, and dedicated LMID signing keys. They MUST NOT accept a token merely because another application trusts the same corporate domain.

### 24.6 Parser attacks

Readers MUST apply input limits before parsing, reject duplicate JSON members, reject unknown Level 1 fields, and use maintained JSON, JOSE, URL, HTTP, and image libraries.

### 24.7 Discovery attacks

Readers MUST apply the network controls in Section 16. They MUST NOT follow issuer-controlled URLs to private network services without explicit enterprise policy.

### 24.8 Address leakage

Anyone who can photograph or decode the QR can read unencrypted destination fields. Issuers SHOULD minimize validity and included destinations. Properties and issuers SHOULD assess whether large multi-unit batches disclose more unit data than operationally necessary.

### 24.9 Malicious or mistaken issuer data

A signature proves that a key bound to the issuer domain signed the data, not that every signed statement is true. Readers MUST present the issuer identity and allow local correction or manual handling.

### 24.10 Physical security

LMID does not prevent tailgating, unauthorized internal movement, coercion, or unsafe vehicle behavior. Physical controls remain the verifier's responsibility.

## 25. Conformance tests

The `tests/` directory contains signed Level 1 scenarios. Each scenario includes:

- `scenario.json` with a human-readable description, fixed verification time, protected header, payload, and expected result;
- `case.json` with the same data and its signed compact token; and
- `token.jwt` containing the compact token alone.

The scenarios share the public test JWK Set in `tests/keys/jwks.json`.

Conformance tooling MUST use the scenario's fixed `verification_time` rather than wall-clock time. Test private keys are public test material and MUST NEVER be used in production.

The initial positive scenarios cover:

1. one apartment delivery;
2. multiple villa deliveries in one visit;
3. one commercial-office delivery;
4. one independent-house delivery; and
5. multiple deliveries across different buildings and floors in one property.

Future test additions may include malformed and negative cases. Such additions do not change Level 1 semantics.

## 26. Future levels

Level 2 workflow improvements and Level 3 fully autonomous access are outside this Level 1 specification's scope. Their proposed scope is described in the [roadmap](roadmap.md). The separate [Level 2 gate-check-in event draft](gate-check-in-events.md) is not a Level 1 conformance requirement.

Implementers MUST NOT place experimental future fields inside a Level 1 pass.

## 27. Informative place-ID provider registry

The repository maintains [`place-id-providers.json`](../data/place-id-providers.json) outside the signed-pass specification. It records initial provider IDs, syntax, examples, limitations, and sources.

The registry has a separate JSON Schema and is informative. It is neither a partner registry nor a trust source. Participant identity and operational data are discovered from each participant's domain-controlled metadata. Readers may support providers not listed in the repository and must ignore unsupported providers without failing the pass.

## 28. References

- [RFC 2119: Key words for use in RFCs](https://www.rfc-editor.org/rfc/rfc2119.html)
- [RFC 8174: Ambiguity of uppercase and lowercase in RFC 2119 key words](https://www.rfc-editor.org/rfc/rfc8174.html)
- [RFC 7515: JSON Web Signature](https://www.rfc-editor.org/rfc/rfc7515.html)
- [RFC 7517: JSON Web Key](https://www.rfc-editor.org/rfc/rfc7517.html)
- [RFC 7518: JSON Web Algorithms](https://www.rfc-editor.org/rfc/rfc7518.html)
- [RFC 7519: JSON Web Token](https://www.rfc-editor.org/rfc/rfc7519.html)
- [RFC 8615: Well-Known Uniform Resource Identifiers](https://www.rfc-editor.org/rfc/rfc8615.html)
- [RFC 8725: JSON Web Token Best Current Practices](https://www.rfc-editor.org/rfc/rfc8725.html)
- [ISO/IEC 18004:2024: QR code bar code symbology specification](https://www.iso.org/standard/83389.html)
- [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12)
- [Unicode Standard Annex #15: Unicode Normalization Forms](https://www.unicode.org/reports/tr15/)
- [Unicode Technical Standard #39: Unicode Security Mechanisms](https://www.unicode.org/reports/tr39/)
- [NIST AI Risk Management Framework](https://airc.nist.gov/airmf-resources/airmf/)
