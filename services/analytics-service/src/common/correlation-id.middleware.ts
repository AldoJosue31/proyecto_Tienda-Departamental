import { Injectable, type NestMiddleware } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "./authenticated-request";

const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(request: AuthenticatedRequest, response: Response, next: NextFunction): void {
    const incoming = request.header("x-correlation-id")?.trim();
    const correlationId = incoming && CORRELATION_ID_PATTERN.test(incoming) ? incoming : randomUUID();
    request.correlationId = correlationId;
    response.setHeader("x-correlation-id", correlationId);
    next();
  }
}
