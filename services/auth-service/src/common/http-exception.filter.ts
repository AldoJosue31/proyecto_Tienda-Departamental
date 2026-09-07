import type {
  ArgumentsHost,
  ExceptionFilter} from "@nestjs/common";
import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Response } from "express";

import type { AuthenticatedRequest } from "./authenticated-request";
import { ApiException } from "./api-exception";

interface ErrorPayload {
  code: string;
  message: string;
  correlationId: string;
}

function publicError(status: number): Pick<ErrorPayload, "code" | "message"> {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return { code: "VALIDATION_ERROR", message: "Solicitud inválida" };
    case HttpStatus.UNAUTHORIZED:
      return { code: "UNAUTHORIZED", message: "No autorizado" };
    case HttpStatus.FORBIDDEN:
      return { code: "FORBIDDEN", message: "No tienes permisos para esta operación" };
    case HttpStatus.NOT_FOUND:
      return { code: "NOT_FOUND", message: "Recurso no encontrado" };
    case HttpStatus.CONFLICT:
      return { code: "CONFLICT", message: "La operación no se puede completar" };
    case HttpStatus.TOO_MANY_REQUESTS:
      return { code: "RATE_LIMITED", message: "Demasiadas solicitudes" };
    case HttpStatus.SERVICE_UNAVAILABLE:
      return { code: "SERVICE_UNAVAILABLE", message: "Servicio no disponible" };
    default:
      return { code: "INTERNAL_ERROR", message: "Error interno del servidor" };
  }
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<AuthenticatedRequest>();
    const response = context.getResponse<Response>();
    const correlationId = request.correlationId ?? randomUUID();
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception instanceof ApiException
      ? { code: exception.code, message: this.messageFrom(exception) }
      : publicError(status);

    if (!(exception instanceof HttpException)) {
      // Do not attach the exception object: it can contain connection details or credentials.
      this.logger.error(`Unhandled error. correlationId=${correlationId}`);
    }

    response.setHeader("x-correlation-id", correlationId);
    response.status(status).json({ ...body, correlationId } satisfies ErrorPayload);
  }

  private messageFrom(exception: ApiException): string {
    const response = exception.getResponse();
    if (typeof response === "object" && response !== null && "message" in response) {
      const message = response.message;
      if (typeof message === "string") {
        return message;
      }
    }
    return publicError(exception.getStatus()).message;
  }
}
