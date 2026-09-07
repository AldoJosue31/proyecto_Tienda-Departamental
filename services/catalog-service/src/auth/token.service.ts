import { Inject, Injectable } from "@nestjs/common";
import { verify, type JwtPayload } from "jsonwebtoken";

import { ApiException } from "../common/api-exception";
import {
  AUTH_JWT_ISSUER,
  isRole,
  type CatalogRuntimeConfig,
  type Role,
} from "../config/environment";

export const CATALOG_RUNTIME_CONFIG = Symbol("CATALOG_RUNTIME_CONFIG");

export interface AccessTokenClaims {
  iss: typeof AUTH_JWT_ISSUER;
  sub: string;
  role: Role;
  exp: number;
  jti: string;
}

@Injectable()
export class TokenService {
  constructor(
    @Inject(CATALOG_RUNTIME_CONFIG) private readonly config: CatalogRuntimeConfig,
  ) {}

  verifyAccessToken(rawToken: string): AccessTokenClaims {
    try {
      const decoded = verify(rawToken, this.config.accessSecret, {
        algorithms: ["HS256"],
        issuer: AUTH_JWT_ISSUER,
      });
      if (typeof decoded === "string" || !this.isExpectedPayload(decoded)) {
        throw new Error("Unexpected JWT payload.");
      }
      return {
        iss: AUTH_JWT_ISSUER,
        sub: decoded.sub,
        role: decoded.role,
        exp: decoded.exp,
        jti: decoded.jti,
      };
    } catch {
      throw new ApiException(401, "UNAUTHORIZED", "Token de acceso inválido o vencido");
    }
  }

  private isExpectedPayload(payload: JwtPayload): payload is JwtPayload & {
    iss: typeof AUTH_JWT_ISSUER;
    sub: string;
    role: Role;
    exp: number;
    jti: string;
  } {
    return (
      payload.iss === AUTH_JWT_ISSUER &&
      typeof payload.sub === "string" &&
      isRole(payload.role) &&
      typeof payload.exp === "number" &&
      typeof payload.jti === "string"
    );
  }
}
