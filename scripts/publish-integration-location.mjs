import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const env = Object.fromEntries(readFileSync(".env.integration", "utf8").trim().split(/\r?\n/).map(line => {
  const at = line.indexOf("=");
  return [line.slice(0, at), line.slice(at + 1)];
}));
assert.equal(env.COMPOSE_PROJECT_NAME, "departamental-five-phases");
assert.equal(execFileSync("docker", ["inspect", "--format", '{{ index .Config.Labels "com.docker.compose.project" }}', "departamental-five-phases-servicio-logistica-1"], { encoding: "utf8" }).trim(), env.COMPOSE_PROJECT_NAME);
const [shipmentId, courierId, age = "0"] = process.argv.slice(2);
const uuid = /^[0-9a-f-]{36}$/i;
assert.ok(uuid.test(shipmentId ?? "") && uuid.test(courierId ?? ""));
assert.ok(Number.isFinite(Number(age)) && Number(age) >= 0 && Number(age) <= 3600);
const login = await fetch("http://localhost:8005/auth/login", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@departamental.local", password: env.SEED_ADMIN_PASSWORD }),
});
assert.equal(login.status, 200);
const { accessToken } = await login.json();
const response = await fetch(`http://localhost:8005/couriers/${courierId}/location`, {
  method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
  body: JSON.stringify({ shipmentId, latitude: 19.435, longitude: -99.14, recordedAt: new Date(Date.now() - Number(age) * 1000).toISOString() }),
});
assert.equal(response.status, 201);
console.log("Synthetic public location published in the isolated integration project.");
