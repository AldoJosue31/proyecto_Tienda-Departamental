import { strict as assert } from "node:assert";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { annotateClientIp, clientIpResolver, normalizeIp } from "./web-client-ip.mjs";

test("normalizes socket addresses and rejects malformed addresses", () => {
  assert.equal(normalizeIp("::ffff:203.0.113.7"), "203.0.113.7");
  assert.equal(normalizeIp("2001:db8::7"), "2001:db8::7");
  for (const value of [undefined, "", "not-an-ip", "203.0.113.7:443", "203.0.113.999"]) assert.throws(() => normalizeIp(value));
});

test("ignores forwarding claims when the actual peer is not a configured proxy", () => {
  const resolve = clientIpResolver("10.0.0.0/8");
  assert.equal(resolve("203.0.113.7", "127.0.0.1"), "203.0.113.7");
  assert.equal(clientIpResolver()("127.0.0.1", "203.0.113.99"), "127.0.0.1");
});

test("walks trusted proxies from the socket side and stops before an attacker-controlled prefix", () => {
  const resolve = clientIpResolver("10.0.0.0/8,192.168.0.0/16");
  assert.equal(resolve("10.0.0.8", "127.0.0.1, 203.0.113.7, 192.168.0.8"), "203.0.113.7");
  assert.equal(resolve("::ffff:10.0.0.8", "::ffff:203.0.113.7"), "203.0.113.7");
  assert.equal(resolve("10.0.0.8", "203.0.113.7"), "203.0.113.7");
});

test("supports explicit IPv6 trust and fails closed on oversized, malformed or ambiguous chains", () => {
  const resolve = clientIpResolver("2001:db8:1::/48");
  assert.equal(resolve("2001:db8:1::8", "2001:db8:2::7"), "2001:db8:2::7");
  for (const forwarded of ["not-an-ip", "203.0.113.7,", "203.0.113.7:443", ["203.0.113.7"], "x".repeat(1025), Array(17).fill("203.0.113.7").join(",")]) {
    assert.equal(resolve("2001:db8:1::8", forwarded), "2001:db8:1::8");
  }
});

test("rejects proxy-CIDR typos rather than accidentally trusting every address", () => {
  for (const cidr of ["not-an-ip", "10.0.0.1/", "10.0.0.1/1e1", "10.0.0.1/0x20", "10.0.0.1/-1", "10.0.0.1/33", "2001:db8::/129", "10.0.0.1/8/extra"]) {
    assert.throws(() => clientIpResolver(cidr), /Invalid trusted proxy CIDR/);
  }
  assert.equal(clientIpResolver("10.0.0.1")("10.0.0.1", "203.0.113.7"), "203.0.113.7");
});

test("replaces forged authentication headers with the signed socket identity", () => {
  const key = Buffer.alloc(32, 9).toString("base64url");
  const now = 1_791_526_500_000;
  const request = {
    socket: { remoteAddress: "::ffff:203.0.113.7" },
    headers: { "x-forwarded-for": "127.0.0.1", "x-auth-client-ip": "127.0.0.1", "x-auth-client-timestamp": "forged", "x-auth-client-signature": "forged" },
  };
  annotateClientIp(request, key, clientIpResolver(), now);
  assert.equal(request.headers["x-auth-client-ip"], "203.0.113.7");
  assert.equal(request.headers["x-auth-client-timestamp"], String(now));
  assert.equal(request.headers["x-auth-client-signature"], createHmac("sha256", key).update(now + ":203.0.113.7").digest("hex"));
});

test("never retains user-supplied authentication headers when signing is unavailable", () => {
  const request = { socket: { remoteAddress: "203.0.113.7" }, headers: { "x-auth-client-ip": "forged", "x-auth-client-timestamp": "forged", "x-auth-client-signature": "forged" } };
  annotateClientIp(request, "", clientIpResolver());
  assert.equal(request.headers["x-auth-client-ip"], undefined);
  assert.equal(request.headers["x-auth-client-timestamp"], undefined);
  assert.equal(request.headers["x-auth-client-signature"], undefined);
});
