import { config as loadDotenv } from "dotenv";

// Environment variables injected by Docker/Kubernetes win over local files.
loadDotenv({
  path: process.env.ENV_FILE || ".env.local",
  override: false,
  quiet: true,
});
