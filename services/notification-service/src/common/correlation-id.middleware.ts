import type { NextFunction, Response } from "express";
import { Injectable, type NestMiddleware } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { AuthenticatedRequest } from "./authenticated-request";
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware { use(request: AuthenticatedRequest, response: Response, next: NextFunction): void { const supplied = request.header("x-correlation-id")?.trim(); request.correlationId = supplied && supplied.length <= 128 ? supplied : randomUUID(); response.setHeader("x-correlation-id", request.correlationId); next(); } }
