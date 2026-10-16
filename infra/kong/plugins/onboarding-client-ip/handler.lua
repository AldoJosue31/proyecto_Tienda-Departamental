-- Runs before rate-limiting (910). Never trust a caller-supplied quota header.
local mac = require "resty.openssl.mac"
local to_hex = require "resty.string".to_hex
local bit = require "bit"
local Handler = { PRIORITY = 1005, VERSION = "1.0.0" }
local function sign(key, text)
  local context = assert(mac.new(key, "HMAC", nil, "sha256"))
  return to_hex(assert(context:final(text)))
end
local function equal(a, b)
  if type(a) ~= "string" or #a ~= #b then return false end
  local diff = 0
  for i = 1, #b do diff = bit.bor(diff, bit.bxor(a:byte(i), b:byte(i))) end
  return diff == 0
end
function Handler:access(conf)
  local now = math.floor(ngx.now() * 1000)
  local ip = kong.request.get_header("x-auth-client-ip")
  local stamp = kong.request.get_header("x-auth-client-timestamp")
  local signature = kong.request.get_header("x-auth-client-signature")
  local trusted = type(ip) == "string" and #ip <= 45 and ip:match("^[%x:%.]+$")
    and type(stamp) == "string" and #stamp == 13 and stamp:match("^%d+$")
    and math.abs(now - tonumber(stamp)) <= 60000
    and equal(signature, sign(conf.secret, stamp .. ":" .. ip))
  if not trusted then ip = kong.client.get_forwarded_ip() end
  -- Remove underscore aliases as well; incoming names never choose the quota.
  for _, name in ipairs({ "x_onboarding_limit_ip", "x_auth_client_ip", "x_auth_client_timestamp", "x_auth_client_signature" }) do
    ngx.req.clear_header(name)
  end
  stamp = string.format("%.0f", now)
  ngx.req.set_header("x-auth-client-ip", ip)
  ngx.req.set_header("x-auth-client-timestamp", stamp)
  ngx.req.set_header("x-auth-client-signature", sign(conf.secret, stamp .. ":" .. ip))
  ngx.req.set_header("x-onboarding-limit-ip", ip)
end
return Handler
