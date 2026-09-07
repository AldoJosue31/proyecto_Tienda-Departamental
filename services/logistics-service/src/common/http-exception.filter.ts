import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import { Catch, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Response } from "express";
import { ApiException } from "./api-exception";
import type { AuthenticatedRequest } from "./authenticated-request";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp(); const request = context.getRequest<AuthenticatedRequest>(); const response = context.getResponse<Response>(); const correlationId = request.correlationId ?? randomUUID();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    if (!(exception instanceof HttpException)) this.logger.error("Unhandled error. correlationId=" + correlationId);
    const body = exception instanceof ApiException
      ? { code: exception.code, message: String((exception.getResponse() as { message?: unknown }).message ?? "Error interno del servidor") }
      : { code: status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : "INTERNAL_ERROR", message: status === 403 ? "No tienes permisos para esta operación" : status === 401 ? "No autorizado" : "Error interno del servidor" };
    response.setHeader("x-correlation-id", correlationId); response.status(status).json({ ...body, correlationId });
  }
}
