import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

/** No Origin is valid for private/server clients. Browser origins are explicit. */
export function rejectUnlistedOrigins(origins: readonly string[]) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const origin = request.header("origin");
    if (!origin || origins.includes(origin)) { next(); return; }
    const correlationId = randomUUID();
    response.setHeader("X-Correlation-Id", correlationId);
    response.setHeader("Cache-Control", "no-store");
    response.status(403).json({ code: "ORIGIN_NOT_ALLOWED", message: "Origen no autorizado", correlationId });
  };
}
