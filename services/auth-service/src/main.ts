import "reflect-metadata";
import "./config/load-env";

import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { json } from "express";
import helmet from "helmet";

import { AppModule } from "./app.module";
import { loadAuthTokenConfig } from "./config/environment";

async function bootstrap(): Promise<void> {
  const config = loadAuthTokenConfig();
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger: config.environment === "test" ? false : ["log", "warn", "error"],
  });

  app.use(helmet());
  app.use(json({ limit: "1mb" }));
  app.enableCors({
    origin(
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) {
      if (!origin || config.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin is not allowed by CORS."));
    },
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Correlation-Id"],
    exposedHeaders: ["X-Correlation-Id"],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      disableErrorMessages: config.environment === "production",
    }),
  );

  const port = Number.parseInt(process.env.PORT || "3001", 10);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be a valid TCP port.");
  }
  await app.listen(port, "0.0.0.0");
}

bootstrap().catch(() => {
  // Startup failures must not print environment variables or cryptographic material.
  process.stderr.write("Auth service failed to start.\n");
  process.exitCode = 1;
});
