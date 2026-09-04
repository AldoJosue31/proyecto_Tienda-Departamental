import type { Request } from "express";
import type { Role } from "../config/environment";

export interface AuthenticatedRequest extends Request {
  authUser?: { id: string; role: Role };
  correlationId?: string;
}
