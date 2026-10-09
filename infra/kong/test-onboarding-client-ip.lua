-- A real Nginx request in an ephemeral Kong image; signing data is synthetic.
local json = require "cjson.safe"
local http = require "kong.tools.http"
local client = require("kong.pdk.client").new({})
local file = assert(io.open("/fixture/cases.json", "rb"))
local fixtures = assert(json.decode(file:read("*a")))
file:close()
rawset(_G, "kong", { request = { get_header = http.get_header }, client = client })
local original_now = ngx.now
ngx.now = function() return fixtures.now / 1000 end
local handler = require "kong.plugins.onboarding-client-ip.handler"
local aliases = { "x_onboarding_limit_ip", "x_auth_client_ip", "x_auth_client_timestamp", "x_auth_client_signature" }
local names = {}
local failures = {}
local function check(condition, name, assertion)
  if not condition then failures[#failures + 1] = { case = name, assertion = assertion } end
end
for _, fixture in ipairs(fixtures.cases) do
  -- These are real ngx.req writes and PDK reads, including alias collisions.
  for name, _ in pairs(ngx.req.get_headers(1000, true)) do ngx.req.clear_header(name) end
  for name, value in pairs(fixture.headers) do ngx.req.set_header(name, value) end
  handler:access({ secret = fixtures.key })
  check(http.get_header("x-auth-client-ip") == fixture.expectedIp, fixture.name, "canonical identity")
  check(http.get_header("x-auth-client-timestamp") == tostring(fixtures.now), fixture.name, "canonical timestamp")
  check(http.get_header("x-auth-client-signature") == fixture.expectedSignature, fixture.name, "Node/OpenSSL HMAC")
  check(http.get_header("x-onboarding-limit-ip") == fixture.expectedIp, fixture.name, "rate-limiting quota identity")
  local headers = ngx.req.get_headers(1000, true)
  for _, name in ipairs(aliases) do check(headers[name] == nil, fixture.name, "removed " .. name) end
  names[#names + 1] = fixture.name
end
ngx.now = original_now
ngx.header.content_type = "application/json"
ngx.say(assert(json.encode({ passed = #names, cases = names, failures = failures })))
