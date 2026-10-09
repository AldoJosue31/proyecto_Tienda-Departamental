local typedefs = require "kong.db.schema.typedefs"
return {
  name = "onboarding-client-ip",
  fields = {
    { consumer = typedefs.no_consumer },
    { protocols = typedefs.protocols_http },
    { config = { type = "record", fields = {
      { secret = { type = "string", required = true, len_min = 43, encrypted = true } },
    } } },
  },
}
