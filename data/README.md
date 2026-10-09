# Informative Ecosystem Data

The files in this directory are informative. They support consistent place-ID parsing and source attribution. They do not register LMID participants, establish trust, authorize an issuer or verifier, or supply operational endpoints.

An LMID participant needs no entry in a central partner registry. Its canonical domain is its participant identifier. Another participant derives its metadata location automatically as:

```text
https://<participant-domain>/.well-known/bharat-last-mile-id
```

The domain-controlled metadata document supplies the participant display name, roles, capabilities, public-key location, and optional Level 2 endpoint. Whether a verifier accepts a cryptographically verified participant remains the verifier's policy and is not determined by this directory.

## Common registry rules

- Registry documents use JSON and declare JSON Schema Draft 2020-12 schemas.
- Version 1 rejects undocumented fields through `additionalProperties: false`.
- Place-ID provider identifiers use stable lowercase slugs.
- A maintainer must not reassign an existing provider ID.
- Source URLs should point to authoritative material where available.

## Place-ID provider registry

[`place-id-providers.json`](place-id-providers.json) satisfies [`place-id-provider-registry.schema.json`](../schemas/place-id-provider-registry.schema.json).

To add a provider, append one object to `providers` and run `npm test` from the repository root. Validation checks the complete provider object, its declared schema path, and provider-ID uniqueness. Test fixtures that use a registered provider also validate place-ID values against its `pattern` when one is present.

Google Places is included under the agreed provider slug `google-places`. Its IDs are opaque; no fixed prefix is required. LMID limits all place IDs to 256 characters, even when the provider permits longer values. IDs must not be truncated. A property-level ID still needs a curated local binding and separate building or unit reconciliation.

### Provider registry root fields

| Field | Required | Meaning |
| --- | --- | --- |
| `$schema` | No | Relative or absolute URI reference for the registry's JSON Schema. |
| `version` | Yes | Registry format version. Version 1 requires integer `1`. |
| `providers` | Yes | Array of place-ID provider objects. |

### Provider fields

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | Yes | Stable lowercase provider slug used by `place_ids[].provider`. |
| `name` | Yes | Human-readable provider name. |
| `domain` | Yes | Primary public provider domain. |
| `id_description` | Yes | Plain-language definition of the provider-specific identifier. |
| `example` | Yes | Syntactically representative identifier. It need not identify a test property's actual location. |
| `pattern` | No | JSON-compatible regular expression for provider-specific validation, or `null` when no stable expression exists. |
| `status` | Yes | `proposed`, `active`, or `deprecated`. |
| `source_urls` | Yes | Authoritative or primary documentation links. |
| `notes` | No | Limitations, stability, precision, privacy, attribution, or licensing information. |

## Trust boundary

A reader can use this registry to parse a supported place ID. The registry is optional parsing guidance, not a dependency of Level 1 verification. A reader may support a provider not listed here and must ignore an unsupported provider without invalidating the pass.
