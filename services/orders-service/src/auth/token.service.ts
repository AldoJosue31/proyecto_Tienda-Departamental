import { Inject, Injectable } from "@nestjs/common";
import { verify, type JwtPayload } from "jsonwebtoken";

import { ApiException } from "../common/api-exception";
import { AUTH_JWT_ISSUER, isRole, type OrdersRuntimeConfig, type Role } from "../config/environment";

export const ORDERS_RUNTIME_CONFIG = Symbol("ORDERS_RUNTIME_CONFIG");

@Injectable()
export class TokenService {
  constructor(
    @Inject(ORDERS_RUNTIME_CONFIG)
    private readonly config: Pick<OrdersRuntimeConfig, "accessSecret">,
  ) {}

  verifyAccessToken(rawToken: string): { sub: string; role: Role } {
    try {
      const token = verify(rawToken, this.config.accessSecret, {
        algorithms: ["HS256"],
        issuer: AUTH_JWT_ISSUER,
      });
      if (typeof token === "string" || !this.valid(token)) throw new Error("Unexpected token.");
      return { sub: token.sub, role: token.role };
    } catch {
      throw new ApiException(401, "UNAUTHORIZED", "Token de acceso inválido o vencido");
    }
  }

  private valid(payload: JwtPayload): payload is JwtPayload & {
    sub: string;
    role: Role;
    exp: number;
    jti: string;
  } {
    return (
      payload.iss === AUTH_JWT_ISSUER
      && typeof payload.sub === "string"
      && isRole(payload.role)
      && typeof payload.exp === "number"
      && typeof payload.jti === "string"
    );
  }
}
