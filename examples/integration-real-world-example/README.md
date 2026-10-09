# Swiggy and ADDA integration example

This example shows how Swiggy and ADDA could exchange an LMID delivery pass. Both services are simulated; it is not an actual company integration.

## Who does what?

- **Swiggy is the issuer.** After pickup, it signs the delivery partner's name and destination with its private key, then saves the signed pass as a QR image.
- **ADDA is the reader and verifier.** It reads that image, discovers Swiggy's public key, verifies the signature and expiry, and matches the destination to its property directory.

The example destination is **Aparna Serene Park, Hyderabad**, building **R**, flat **1204**, using Google Place ID `ChIJk1qMgACTyzsRmIKsCPIhMuM`.

Swiggy's destination text comes from the customer. ADDA's property directory is maintained by building managers. Once the place ID identifies the building or property, ADDA can automatically resolve `R 1204`, `R-1204`, or `1204, Building R` to one local endpoint when deterministic; an approved alias is optional. It preserves the signed text. Failed or ambiguous resolution rejects the ID card with `unit_not_found`, while retaining manual handling and the separate signature result.

## Public and private keys

Swiggy keeps its signing private key secret and publishes the matching public key in `jwks.json`. Its `metadata.json` tells readers where to find that public key. ADDA discovers these documents over HTTPS using the issuer domain in the pass; the QR contains no public key.

ADDA needs Swiggy's public key to verify a Level 1 pass. It does not need its own signing key for this flow. An ADDA signing key would be needed for optional signed Level 2 feedback events.

This demo uses an intentionally public test signing key and local HTTPS at the simulated `swiggy.example` domain. Real deployments must use their own protected keys and public HTTPS discovery.

## Run it

Install Node.js 20 or newer and OpenSSL 3, then run from the repository root:

```sh
npm ci
npm run example:issue
npm run example:verify
```

The issuer saves `output/pass.png` in this folder and prints its actual decoded header and payload under `decodedPass`. The reader prints the verification result and matched destination. Resident approval and entry permission remain separate decisions.

Edit the default data at the top of [swiggy-issuer.mjs](swiggy-issuer.mjs) and [adda-reader.mjs](adda-reader.mjs).

See [detailed usage](USAGE.md) for more commands and [implementation findings](IMPLEMENTATION-NOTES.md) for spec gaps and limitations.
