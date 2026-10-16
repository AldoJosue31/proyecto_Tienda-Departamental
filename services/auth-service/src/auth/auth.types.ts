import type { Role } from "../config/environment";

export interface AuthUserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string | null;
  role: Role;
  isActive: boolean;
  onboardingStatus: 'PENDING_EMAIL' | 'PENDING_INVITATION' | 'READY';
  emailVerifiedAt: Date | null;
  authVersion: number;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  authVersion?: number;
}

export interface AdminUser extends PublicUser {
  isActive: boolean;
}

export interface IssuedRefreshToken {
  id: string;
  familyId: string;
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
  expiresIn: number;
}

export interface IssuedAccessToken {
  token: string;
  expiresIn: number;
}

export interface SessionMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  refreshExpiresIn: number;
  user: PublicUser;
}
