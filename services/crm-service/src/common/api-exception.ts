import { HttpException } from "@nestjs/common";
export class ApiException extends HttpException { constructor(status: number, readonly code: string, message: string) { super({ code, message }, status); } }
