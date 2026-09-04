import { config as loadDotenv } from "dotenv";

// Docker/Kubernetes values have priority over a local development file.
loadDotenv({
  path: process.env.ENV_FILE || ".env.local",
  override: false,
  quiet: true,
});
