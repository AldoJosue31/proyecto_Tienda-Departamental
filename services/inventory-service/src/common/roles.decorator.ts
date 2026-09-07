import { SetMetadata } from "@nestjs/common";

import type { Role } from "../config/environment";

export const REQUIRED_ROLES = "departamental:required-roles";

export const Roles = (...roles: Role[]) => SetMetadata(REQUIRED_ROLES, roles);
