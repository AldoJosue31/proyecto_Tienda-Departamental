import { Inject, Injectable } from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { sign, verify, type JwtPayload } from "jsonwebtoken";

import { ApiException } from "../common/api-exception";
import {
  AUTH_JWT_ISSUER,
  isRole,
  type AuthTokenConfig,
  type Role,
} from "../config/environment";
import type { IssuedAccessToken, IssuedRefreshToken, PublicUser } from "./auth.types";

export const AUTH_TOKEN_CONFIG = Symbol("AUTH_TOKEN_CONFIG");

export interface AccessTokenClaims {
  iss: typeof AUTH_JWT_ISSUER;
  sub: string;
  role: Role;
  exp: number;
  jti: string;
}

@Injectable()
export class TokenService {
  constructor(@Inject(AUTH_TOKEN_CONFIG) private readonly config: AuthTokenConfig) {}

  issueAccessToken(user: PublicUser): IssuedAccessToken {
    const token = sign(
      { role: user.role },
      this.config.accessSecret,
      {
        algorithm: "HS256",
        issuer: AUTH_JWT_ISSUER,
        subject: user.id,
        jwtid: randomUUID(),
        expiresIn: this.config.accessTtlSeconds,
      },
    );

    return { token, expiresIn: this.config.accessTtlSeconds };
  }

  issueRefreshToken(): IssuedRefreshToken {
    const expiresIn = this.config.refreshTtlSeconds;
    const rawToken = randomBytes(64).toString("base64url");
    return {
      id: randomUUID(),
      familyId: randomUUID(),
      rawToken,
      tokenHash: this.hashRefreshToken(rawToken),
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      expiresIn,
    };
  }

  issueReplacementRefreshToken(familyId: string): IssuedRefreshToken {
    const refreshToken = this.issueRefreshToken();
    return { ...refreshToken, familyId };
  }

  hashRefreshToken(rawToken: string): string {
    return createHash("sha256").update(rawToken).digest("hex");
  }

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
