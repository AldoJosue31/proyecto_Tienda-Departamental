import { config as loadDotenv } from "dotenv";

loadDotenv({
  path: process.env.ENV_FILE || ".env.local",
  override: false,
  quiet: true,
});
