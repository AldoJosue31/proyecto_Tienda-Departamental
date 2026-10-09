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
  uv: number;
}

@Injectable()
export class TokenService {
  constructor(@Inject(REALTIME_RUNTIME_CONFIG) private readonly config: Pick<RealtimeRuntimeConfig, "accessSecret">) {}

  verifyAccessToken(raw: string): AccessTokenClaims {
    try {
      const decoded = verify(raw, this.config.accessSecret, { algorithms: ["HS256"], issuer: AUTH_JWT_ISSUER });
      if (typeof decoded === "string" || !this.expected(decoded)) throw new Error("Unexpected access token payload.");
      // Pre-migration access tokens belong to identity version zero.
      return { iss: AUTH_JWT_ISSUER, sub: decoded.sub, role: decoded.role, exp: decoded.exp, jti: decoded.jti, uv: decoded.uv ?? 0 };
    } catch { throw new Error("Invalid or expired access token."); }
  }

  private expected(payload: JwtPayload): payload is JwtPayload & AccessTokenClaims {
    return payload.iss === AUTH_JWT_ISSUER && typeof payload.sub === "string" && payload.sub.length > 0
      && isRole(payload.role) && typeof payload.exp === "number" && Number.isFinite(payload.exp)
      && typeof payload.jti === "string" && payload.jti.length > 0
      && (payload.uv === undefined || (Number.isSafeInteger(payload.uv) && payload.uv >= 0));
  }
}
