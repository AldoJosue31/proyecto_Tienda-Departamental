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
    const http = host.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();
    const correlationId = request.correlationId ?? randomUUID();
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const api = exception instanceof ApiException
      ? { code: exception.code, message: this.message(exception) }
      : this.standard(status);
    if (!(exception instanceof HttpException)) {
      this.logger.error("Unhandled error. correlationId=" + correlationId);
    }
    response.setHeader("x-correlation-id", correlationId);
    response.status(status).json({ ...api, correlationId });
  }

  private message(exception: ApiException): string {
    const response = exception.getResponse();
    if (typeof response === "object" && response !== null && "message" in response) {
      const value = response.message;
      if (typeof value === "string") return value;
    }
    return this.standard(exception.getStatus()).message;
  }

  private standard(status: number): { code: string; message: string } {
    if (status === 400) return { code: "VALIDATION_ERROR", message: "Solicitud inválida" };
    if (status === 401) return { code: "UNAUTHORIZED", message: "No autorizado" };
    if (status === 403) return { code: "FORBIDDEN", message: "No tienes permisos para esta operación" };
    if (status === 404) return { code: "NOT_FOUND", message: "Recurso no encontrado" };
    if (status === 409) return { code: "CONFLICT", message: "La operación no se puede completar" };
    return { code: "INTERNAL_ERROR", message: "Error interno del servidor" };
  }
}
