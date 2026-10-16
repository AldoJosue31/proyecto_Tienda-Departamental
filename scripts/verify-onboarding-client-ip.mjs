import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const image = process.argv[2] || "departamental-five-phases-pasarela-api";
const luaSource = process.argv[3] || join(repository, "infra/kong/test-onboarding-client-ip.lua");
const now = 1_800_000_000_000;
const key = Buffer.alloc(32, 11).toString("base64url");
const peer = "127.0.0.1";
const hmac = (ip, timestamp = now) => createHmac("sha256", key).update(timestamp + ":" + ip).digest("hex");
const signed = (ip, timestamp = now) => ({ "x-auth-client-ip": ip, "x-auth-client-timestamp": String(timestamp), "x-auth-client-signature": hmac(ip, timestamp) });
const cases = [];
function example(name, headers, expectedIp = peer) { cases.push({ name, headers, expectedIp, expectedSignature: hmac(expectedIp) }); }
example("fresh canonical IPv4 signature", signed("203.0.113.7"), "203.0.113.7");
example("fresh canonical IPv6 signature", signed("2001:db8::7"), "2001:db8::7");
example("valid signature overwrites forged quota", { ...signed("203.0.113.7"), "x-onboarding-limit-ip": "attacker-quota", x_onboarding_limit_ip: "underscore-quota" }, "203.0.113.7");
example("unsigned quota cannot choose an identity", { "x-onboarding-limit-ip": "attacker-quota" });
example("unsigned underscore quota cannot choose an identity", { x_onboarding_limit_ip: "underscore-quota", x_auth_client_ip: "203.0.113.99", x_auth_client_timestamp: String(now), x_auth_client_signature: "0".repeat(64) });
example("invalid signature falls back to socket peer", { ...signed("203.0.113.7"), "x-auth-client-signature": "0".repeat(64), "x-onboarding-limit-ip": "attacker-quota" });
example("expired signature falls back to socket peer", signed("203.0.113.7", now - 60_001));
example("future signature outside the window falls back", signed("203.0.113.7", now + 60_001));
example("modified IP does not reuse another IP signature", { ...signed("203.0.113.7"), "x-auth-client-ip": "203.0.113.8" });
example("missing timestamp cannot choose an identity", { "x-auth-client-ip": "203.0.113.7", "x-auth-client-signature": hmac("203.0.113.7") });
example("duplicate quota values are replaced", { "x-onboarding-limit-ip": ["attacker-a", "attacker-b"], x_onboarding_limit_ip: ["attacker-c", "attacker-d"] });
example("mixed underscore quota aliases cannot override canonical quota", { "x-onboarding_limit-ip": "attacker-a", "x_onboarding-limit_ip": "attacker-b", "x-onboarding-limit-ip": "attacker-c" });
example("repeated valid signature keeps the same quota", signed("203.0.113.7"), "203.0.113.7");
function docker(args, { allowFailure = false } = {}) {
  const result = spawnSync("docker", args, { encoding: "utf8", timeout: 30_000, windowsHide: true });
  if (!allowFailure && (result.error || result.status !== 0)) throw new Error("Docker fixture failed: " + (result.error?.message || result.stderr.trim()));
  return result;
}
const tempParent = resolve(process.env.KONG_FIXTURE_TEMP_DIR || tmpdir());
const directory = mkdtempSync(join(tempParent, "departamental-kong-fixture-"));
const container = "departamental-kong-fixture-" + randomUUID().slice(0, 8);
let started = false;
try {
  const version = docker(["run", "--rm", "--pull=never", "--network", "none", "--entrypoint", "kong", image, "version"]).stdout.trim();
  writeFileSync(join(directory, "cases.json"), JSON.stringify({ key, now, cases }));
  copyFileSync(luaSource, join(directory, "test.lua"));
  writeFileSync(join(directory, "nginx.conf"), `worker_processes 1;
error_log stderr error;
pid /tmp/nginx.pid;
events { worker_connections 16; }
http {
  access_log off;
  underscores_in_headers on;
  client_body_temp_path /tmp/client-body;
  proxy_temp_path /tmp/proxy-temp;
  lua_package_path '/usr/local/share/lua/5.1/?.lua;;';
  lua_package_cpath '/usr/local/lib/lua/5.1/?.so;;';
  server { listen 127.0.0.1:8777; location = /check { content_by_lua_file /fixture/test.lua; } }
}
`);
  docker(["run", "--detach", "--rm", "--pull=never", "--name", container, "--network", "none", "--read-only", "--tmpfs", "/tmp:rw,nosuid,size=16m", "--mount", "type=bind,source=" + directory + ",target=/fixture,readonly", "--entrypoint", "/usr/local/openresty/nginx/sbin/nginx", image, "-e", "stderr", "-p", "/tmp", "-c", "/fixture/nginx.conf", "-g", "daemon off;"]);
  started = true;
  let response;
  for (let attempt = 0; attempt < 30; attempt++) {
    const result = docker(["exec", container, "resty", "-e", 'local http=require("resty.http").new(); http:set_timeout(3000); local res,err=http:request_uri("http://127.0.0.1:8777/check"); if not res then error(err) end; if res.status ~= 200 then error("HTTP "..res.status) end; io.write(res.body)' ], { allowFailure: true });
    if (result.status === 0) { response = result.stdout; break; }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 200));
  }
  if (!response) {
    const log = docker(["logs", container], { allowFailure: true });
    throw new Error("The private Kong fixture did not start: " + log.stderr.trim());
  }
  const body = JSON.parse(response);
  // Lua cjson represents an empty table as an object by default.
  assert.deepEqual(Array.isArray(body.failures) ? body.failures : Object.values(body.failures), []);
  assert.equal(body.passed, cases.length);
  console.log(JSON.stringify({ kongVersion: version, testsPassed: body.passed, cases: body.cases, runtime: "Real Nginx headers, Kong PDK and OpenSSL; synthetic signing key; isolated container with no exposed ports." }, null, 2));
} finally {
  if (started) docker(["rm", "--force", container], { allowFailure: true });
  assert.equal(dirname(resolve(directory)), tempParent);
  assert.ok(directory.startsWith(join(tempParent, "departamental-kong-fixture-")));
  rmSync(directory, { recursive: true, force: true });
}
