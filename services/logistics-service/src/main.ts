import "reflect-metadata";
import "./config/load-env";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { loadLogisticsRuntimeConfig } from "./config/environment";

async function bootstrap(): Promise<void> {
  const config = loadLogisticsRuntimeConfig(); const app = await NestFactory.create(AppModule, { logger: config.environment === "test" ? false : ["log", "warn", "error"] });
  app.use(helmet()); app.enableCors({ origin: config.corsOrigins, credentials: true, methods: ["GET", "POST", "PATCH", "OPTIONS"] });
  const port = Number.parseInt(process.env.PORT || "3008", 10); if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error("PORT must be a valid TCP port.");
  await app.listen(port, "0.0.0.0");
}
bootstrap().catch(() => { process.stderr.write("Logistics service failed to start.\n"); process.exitCode = 1; });
