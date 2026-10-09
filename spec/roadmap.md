# Bharat Last-Mile ID Roadmap

This roadmap describes proposed Level 2 and Level 3 capabilities outside the [Level 1 specification](specification.md). It is non-normative and adds no Level 1 conformance requirements or wire-format values. The separate [Level 2 gate-check-in event draft](gate-check-in-events.md) retains its existing requirements.

## Level 2: feedback and workflow improvements

Level 2 focuses on issuer feedback and improvements to the assisted delivery workflow. Beyond the [gate-check-in event draft](gate-check-in-events.md), further scope includes:

- an online cancellation or reassignment status endpoint;
- final gate-decision feedback through the reserved future `gate_check_result` event;
- reader-to-issuer address cards;
- resident pre-authorization and silent-notification profiles;
- manifests larger than the inline QR limit and improved batch handling;
- broader [privacy and data-handling improvements](#privacy-and-data-handling);
- selective disclosure or destination encryption;
- alternative representations such as CBOR Web Token and COSE encoding; and
- a governed property-identity layer.

### Privacy and data handling

The following areas are proposed scope for further Level 2 work, not additional Level 1 conformance requirements:

- purpose limitation, including preventing advertising use, unrelated worker scoring, and cross-property movement profiling;
- holder visibility into the fields shared through a pass;
- minimal derived verification records and limits on raw-token retention;
- retention periods and access controls for operational records, addresses, and place IDs;
- handling of personal data in logs and external processing; and
- reduced data exposure through future disclosure mechanisms.

This work requires further definition before a broader Level 2 privacy profile can be claimed. It does not change the existing optional event profile or the Level 1 pass fields.

## Level 3: fully autonomous access

Level 3 concerns autonomous access and stronger physical assurance. High-level scope includes:

- holder proof of possession and stronger device verification;
- trusted hardware and current access authorization;
- automated gates, access zones, turnstiles, and time-window enforcement;
- anti-tailgating, human override, and physical-safety control integration; and
- automated biometric comparison and liveness detection.

Future Level 2 and Level 3 profiles must define any required schemas, privacy properties, error behavior, and conformance tests before using these features. The [Level 1 specification](specification.md#26-future-levels) prohibits experimental future fields inside a Level 1 pass.
