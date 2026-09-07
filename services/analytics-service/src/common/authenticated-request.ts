import type { Request } from "express";
import type { Role } from "../config/environment";

export interface AuthenticatedUser { id: string; role: Role; }
export type AuthenticatedRequest = Request & { authUser?: AuthenticatedUser; correlationId?: string; };
