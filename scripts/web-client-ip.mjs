import { BlockList, isIP } from "node:net";
import { createHmac } from "node:crypto";

export function normalizeIp(address) {
  const value = address?.startsWith("::ffff:") ? address.slice(7) : address;
  if (!value || !isIP(value)) throw new Error("Invalid client address");
  return value;
}

export function clientIpResolver(cidrs = "") {
  const block = new BlockList();
  for (const entry of cidrs.split(",").map(value => value.trim()).filter(Boolean)) {
    const [address, rawPrefix, extra] = entry.split("/");
    const family = isIP(address);
    if (!family || extra !== undefined) throw new Error("Invalid trusted proxy CIDR");
    const max = family === 4 ? 32 : 128;
    if (rawPrefix !== undefined && !/^(?:0|[1-9]\d{0,2})$/.test(rawPrefix)) throw new Error("Invalid trusted proxy CIDR");
    const prefix = rawPrefix === undefined ? max : Number(rawPrefix);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > max) throw new Error("Invalid trusted proxy CIDR");
    block.addSubnet(address, prefix, family === 4 ? "ipv4" : "ipv6");
  }
  const trusted = address => block.check(address, isIP(address) === 4 ? "ipv4" : "ipv6");
  return (peer, forwarded) => {
    const source = normalizeIp(peer);
    if (!trusted(source) || !forwarded || typeof forwarded !== "string" || forwarded.length > 1024) return source;
    let chain;
    try { chain = forwarded.split(",").map(value => normalizeIp(value.trim())); }
    catch { return source; }
    if (chain.length > 16) return source;
    let current = source;
    for (let index = chain.length - 1; index >= 0 && trusted(current); index--) current = chain[index];
    return current;
  };
}

export function annotateClientIp(request, key, resolve, now = Date.now()) {
  delete request.headers["x-auth-client-ip"];
  delete request.headers["x-auth-client-timestamp"];
  delete request.headers["x-auth-client-signature"];
  if (!key) return;
  const ip = resolve(request.socket.remoteAddress, request.headers["x-forwarded-for"]);
  const timestamp = String(now);
  request.headers["x-auth-client-ip"] = ip;
  request.headers["x-auth-client-timestamp"] = timestamp;
  request.headers["x-auth-client-signature"] = createHmac("sha256", key).update(timestamp + ":" + ip).digest("hex");
}
