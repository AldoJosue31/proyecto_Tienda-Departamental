import "reflect-metadata";
import "./config/load-env";

import { NestFactory } from "@nestjs/core";
import helmet from "helmet";

import { AppModule } from "./app.module";
import { loadRealtimeRuntimeConfig } from "./config/environment";

async function bootstrap(): Promise<void> {
  const config = loadRealtimeRuntimeConfig();
  const app = await NestFactory.create(AppModule, {
    logger: config.environment === "test" ? false : ["log", "warn", "error"],
  });
  app.use(helmet());
  app.enableCors({ origin: config.corsOrigins, credentials: true, methods: ["GET", "POST", "OPTIONS"] });
  const port = Number.parseInt(process.env.PORT || "3006", 10);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error("PORT must be a valid TCP port.");
  await app.listen(port, "0.0.0.0");
}

bootstrap().catch(() => {
  process.stderr.write("Realtime service failed to start.\n");
  process.exitCode = 1;
});
