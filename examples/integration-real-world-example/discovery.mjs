import https from "node:https";
import { lookup } from "node:dns/promises";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import ipaddr from "ipaddr.js";
import { httpsUrl, strictJson, requireRule, ProtocolError, validateMetadata, signingKey } from "./protocol.mjs";

// Resolve once, check every returned address, and pin the socket to a checked IP.
// This prevents a second DNS resolution from defeating private-address checks.
export async function resolvePublic(hostname) {
  const addresses = await lookup(hostname.replace(/^\[|\]$/g, ""), { all: true });
  requireRule(addresses.length && addresses.every(({ address }) => {
    let ip = ipaddr.parse(address);
    if (ip.kind() === "ipv6" && ip.isIPv4MappedAddress()) ip = ip.toIPv4Address();
    return ip.range() === "unicast";
  }), "metadata_unavailable");
  return addresses[0];
}

export async function fetchDocument(uri, { limit, origins, demo, timeout = 5000 }) {
  let url = httpsUrl(uri);
  const deadline = Date.now() + timeout;
  for (let redirects = 0; redirects <= 5; redirects++) {
    requireRule(origins.includes(url.origin), "metadata_unavailable");
    // Demo is an explicit, single-host enterprise exception, never a generic bypass.
    const local = demo && url.hostname === "swiggy.example" && url.port === "";
    let dnsTimer;
    const address = local ? { address: "127.0.0.1", family: 4 } : await Promise.race([
      resolvePublic(url.hostname).finally(() => clearTimeout(dnsTimer)),
      new Promise((_, reject) => { dnsTimer = setTimeout(() => reject(new ProtocolError("metadata_unavailable")), Math.max(1, deadline - Date.now())); })
    ]);
    const remaining = deadline - Date.now();
    requireRule(remaining > 0, "metadata_unavailable");
    const response = await new Promise((resolve, reject) => {
      const request = https.request(url, {
        method: "GET", agent: false,
        port: local ? demo.port : (url.port || 443),
        ca: local ? demo.ca : undefined,
        lookup: (_host, options, callback) => options.all
          ? callback(null, [address]) : callback(null, address.address, address.family),
        headers: { Accept: "application/json", "Accept-Encoding": "identity" }
      });
      const timer = setTimeout(() => request.destroy(new Error("discovery timeout")), remaining);
      request.on("error", reject);
      request.on("close", () => clearTimeout(timer));
      request.on("response", res => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          const location = res.headers.location;
          res.resume();
          resolve({ redirect: location });
          return;
        }
        if (res.statusCode !== 200 || (res.headers["content-encoding"] && res.headers["content-encoding"] !== "identity")) {
          res.resume();
          reject(new ProtocolError("metadata_unavailable"));
          return;
        }
        const contentLength = Number(res.headers["content-length"]);
        if (contentLength > limit) {
          res.destroy(); reject(new ProtocolError("metadata_unavailable")); return;
        }
        const chunks = [];
        let size = 0;
        res.on("error", reject);
        res.on("data", chunk => {
          size += chunk.length;
          if (size > limit) { res.destroy(new Error("discovery response too large")); return; }
          chunks.push(chunk);
        });
        res.on("end", () => resolve({ bytes: Buffer.concat(chunks), headers: res.headers }));
      });
      request.end();
    });
    if (Object.hasOwn(response, "redirect")) {
      requireRule(response.redirect && redirects < 5, "metadata_unavailable");
      url = httpsUrl(new URL(response.redirect, url).href);
      continue;
    }
    return response;
  }
  throw new ProtocolError("metadata_unavailable");
}

function freshness(headers, now) {
  const control = headers["cache-control"] ?? "";
  const age = Math.max(0, Number(headers.age) || 0);
  let ttl = 0; // Missing freshness means re-fetch online; still usable offline for 24h.
  const maxAge = /(?:^|,)\s*max-age\s*=\s*"?(\d+)/i.exec(control);
  if (maxAge) ttl = Number(maxAge[1]);
  else if (headers.expires) ttl = Math.max(0, (Date.parse(headers.expires) - Date.parse(headers.date ?? new Date(now * 1000).toUTCString())) / 1000);
  if (/\bno-cache\b/i.test(control)) ttl = 0;
  return { freshUntil: now + Math.max(0, Math.min(86400, ttl - age)), store: !/\bno-store\b/i.test(control) };
}

export class Discovery {
  constructor({ cacheDir, offline = false, demo, allowedKeyOrigins = [], realm = "public_https" }) {
    Object.assign(this, { cacheDir, offline, demo, allowedKeyOrigins, realm });
  }
  async document(issuer, kind, uri, limit, origins, validate, force = false) {
    const file = path.join(this.cacheDir, `${issuer}-${kind}.json`);
    const now = Math.floor(Date.now() / 1000);
    let cached;
    try {
      requireRule((await stat(file)).size <= limit * 2, "metadata_unavailable");
      cached = strictJson(await readFile(file));
    } catch { cached = undefined; }
    if (cached && cached.realm === this.realm && cached.issuer === issuer && cached.uri === uri && Number.isSafeInteger(cached.retrievedAt) &&
      now >= cached.retrievedAt && now - cached.retrievedAt < 86400 &&
      (this.offline || (!force && Number.isFinite(cached.freshUntil) && now < cached.freshUntil))) {
      validate(cached.document);
      return cached.document;
    }
    if (this.offline) throw new ProtocolError(kind === "metadata" ? "metadata_unavailable" : "key_unavailable");
    let response;
    try { response = await fetchDocument(uri, { limit, origins, demo: this.demo }); }
    catch { throw new ProtocolError(kind === "metadata" ? "metadata_unavailable" : "key_unavailable"); }
    requireRule(response.bytes.length <= limit, "metadata_unavailable");
    const document = strictJson(response.bytes);
    validate(document);
    const retrievedAt = Math.floor(Date.now() / 1000);
    const { store, freshUntil } = freshness(response.headers, retrievedAt);
    await mkdir(this.cacheDir, { recursive: true, mode: 0o700 });
    if (store) await writeFile(file, JSON.stringify({ realm: this.realm, issuer, uri, retrievedAt, freshUntil, document }), { mode: 0o600 });
    else {
      const { rm } = await import("node:fs/promises");
      await rm(file, { force: true });
    }
    return document;
  }
  async discover(issuer, kid) {
    const metadata = await this.document(issuer, "metadata", `https://${issuer}/.well-known/bharat-last-mile-id`,
      65536, [`https://${issuer}`], value => validateMetadata(value, issuer));
    const origins = [`https://${issuer}`, ...this.allowedKeyOrigins];
    requireRule(origins.includes(httpsUrl(metadata.jwks_uri).origin), "key_unavailable");
    const validate = value => requireRule(Array.isArray(value.keys), "key_unavailable");
    let jwks = await this.document(issuer, "jwks", metadata.jwks_uri, 262144, origins, validate);
    if (!this.offline && !jwks.keys.some(key => key.kid === kid)) {
      jwks = await this.document(issuer, "jwks", metadata.jwks_uri, 262144, origins, validate, true);
    }
    return { metadata, key: signingKey(jwks, kid) };
  }
}

// Publishes only the two public discovery documents. The private signing key is
// outside this server's routing table and cannot be requested through a URL.
export async function startDemoServer(directory) {
  const server = https.createServer({
    key: await readFile(path.join(directory, "tls-key.pem")),
    cert: await readFile(path.join(directory, "tls-cert.pem"))
  }, async (request, response) => {
    const files = new Map([
      ["/.well-known/bharat-last-mile-id", "metadata.json"],
      ["/.well-known/bharat-last-mile-id.jwks", "jwks.json"]
    ]);
    const file = files.get(request.url);
    if (request.method !== "GET" || !file) { response.writeHead(404).end(); return; }
    try {
      response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "max-age=300" });
      response.end(await readFile(path.join(directory, file)));
    } catch { response.writeHead(500).end(); }
  });
  await new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return { server, port: server.address().port, ca: await readFile(path.join(directory, "tls-cert.pem")) };
}
