import type { Request } from "express";

import type { Role } from "../config/environment";

export type AuthenticatedRequest = Request & {
  authUser?: { id: string; role: Role };
  correlationId?: string;
};
