import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";

import { AppModule } from "./app.module";
import "./config/load-env";
import { loadOrdersRuntimeConfig } from "./config/environment";

async function bootstrap(): Promise<void> {
  const config = loadOrdersRuntimeConfig();
  const app = await NestFactory.create(AppModule, { bufferLogs: config.environment === "production" });
  app.use(helmet());
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key", "X-Correlation-Id"],
    exposedHeaders: ["X-Correlation-Id"],
  });
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    disableErrorMessages: config.environment === "production",
  }));
  const port = Number.parseInt(process.env.PORT || "3005", 10);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be a valid TCP port.");
  }
  await app.listen(port, "0.0.0.0");
}

bootstrap().catch(() => {
  process.stderr.write("Orders service failed to start.\n");
  process.exitCode = 1;
});
