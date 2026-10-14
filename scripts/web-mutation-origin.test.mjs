import assert from "node:assert/strict";
import { test } from "node:test";
import { allowsCookieApiMutation } from "./web-mutation-origin.mjs";

const origin = "http://localhost:3105";
const request = { method: "POST", url: "/api/checkout", headers: { cookie: "departamental_access=fixture", origin, "content-type": "application/json", "sec-fetch-site": "same-origin" } };
test("a cross-site cookie purchase cannot cross the BFF boundary", () => {
  for (const patch of [{ origin: "https://unlisted.example" }, { origin: "null" }, { origin: undefined }, { "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-site" }, { "content-type": "text/plain" }, { "content-type": "application/x-www-form-urlencoded" }]) {
    assert.equal(allowsCookieApiMutation({ ...request, headers: { ...request.headers, ...patch } }, origin), false);
  }
  assert.equal(allowsCookieApiMutation(request, origin), true);
});
test("the same protection covers staff writes while public reads and server callers remain valid", () => {
  for (const method of ["POST", "PATCH", "DELETE"]) assert.equal(allowsCookieApiMutation({ ...request, method, url: "/api/promotions", headers: { ...request.headers, origin: "https://unlisted.example" } }, origin), false);
  assert.equal(allowsCookieApiMutation({ ...request, method: "GET" }, origin), true);
  assert.equal(allowsCookieApiMutation({ ...request, headers: { "content-type": "application/json" } }, origin), true);
  assert.equal(allowsCookieApiMutation({ ...request, headers: { ...request.headers, "sec-fetch-site": undefined, "content-type": "application/json; charset=utf-8" } }, origin), true);
});
