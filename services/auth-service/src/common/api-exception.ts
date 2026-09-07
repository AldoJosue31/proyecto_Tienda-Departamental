import { HttpException } from "@nestjs/common";

export class ApiException extends HttpException {
  constructor(
    statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super({ code, message }, statusCode);
  }
}
