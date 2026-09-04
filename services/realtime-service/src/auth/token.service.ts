import { Inject, Injectable } from "@nestjs/common";
import { verify, type JwtPayload } from "jsonwebtoken";

import { AUTH_JWT_ISSUER, isRole, type RealtimeRuntimeConfig, type Role } from "../config/environment";

export const REALTIME_RUNTIME_CONFIG = Symbol("REALTIME_RUNTIME_CONFIG");

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
    @Inject(REALTIME_RUNTIME_CONFIG)
    private readonly config: Pick<RealtimeRuntimeConfig, "accessSecret">,
  ) {}

  verifyAccessToken(rawToken: string): AccessTokenClaims {
    const decoded = verify(rawToken, this.config.accessSecret, {
      algorithms: ["HS256"],
      issuer: AUTH_JWT_ISSUER,
    });
    if (typeof decoded === "string" || !this.isExpectedPayload(decoded)) {
      throw new Error("Unexpected access token payload.");
    }
    return {
      iss: AUTH_JWT_ISSUER,
      sub: decoded.sub,
      role: decoded.role,
      exp: decoded.exp,
      jti: decoded.jti,
    };
  }

  private isExpectedPayload(payload: JwtPayload): payload is JwtPayload & {
    iss: typeof AUTH_JWT_ISSUER;
    sub: string;
    role: Role;
    exp: number;
    jti: string;
  } {
    return payload.iss === AUTH_JWT_ISSUER
      && typeof payload.sub === "string"
      && isRole(payload.role)
      && typeof payload.exp === "number"
      && typeof payload.jti === "string";
  }
}
