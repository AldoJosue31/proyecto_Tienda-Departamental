import { CanActivate, Controller, ExecutionContext, Get, Injectable, Param, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import { ApiException } from "../common/api-exception";
type DirectoryRequest = { headers: Record<string, string | undefined> };
@Injectable()
export class DirectoryGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const headers = context.switchToHttp().getRequest<DirectoryRequest>().headers;
    const expected = headers["x-directory-service"] === "crm" ? process.env.CRM_IDENTITY_DIRECTORY_KEY : headers["x-directory-service"] === "logistics" ? process.env.LOGISTICS_IDENTITY_DIRECTORY_KEY : undefined;
    const actual = Buffer.from(headers["x-internal-service-key"] ?? "");
    if (!expected || actual.length !== Buffer.byteLength(expected) || !timingSafeEqual(actual, Buffer.from(expected))) throw new UnauthorizedException("Private directory credential required.");
    return true;
  }
}
@Controller("internal/directory") @UseGuards(DirectoryGuard)
export class DirectoryController {
  constructor(private readonly database: DatabaseService) {}
  @Get() async list(@Req() request: DirectoryRequest) {
    const role = request.headers["x-directory-service"] === "crm" ? "CUSTOMER" : "EMPLOYEE";
    const result = await this.database.query(`SELECT id,name,created_at AS "createdAt" FROM auth_users WHERE role=$1 AND is_active=TRUE AND onboarding_status='READY' AND email_verified_at IS NOT NULL AND password_hash IS NOT NULL ORDER BY id LIMIT 1001`, [role]);
    return { users: result.rows.slice(0, 1000), complete: result.rows.length <= 1000 };
  }
  @Get(":id") async user(@Param("id") id: string, @Req() request: DirectoryRequest) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiException(404, "USER_NOT_FOUND", "Persona no disponible.");
    const role = request.headers["x-directory-service"] === "crm" ? "CUSTOMER" : "EMPLOYEE";
    const result = await this.database.query(`SELECT id,name,created_at AS "createdAt" FROM auth_users WHERE id=$1 AND role=$2 AND is_active=TRUE AND onboarding_status='READY' AND email_verified_at IS NOT NULL AND password_hash IS NOT NULL`, [id, role]);
    if (!result.rows[0]) throw new ApiException(404, "USER_NOT_FOUND", "Persona habilitada no encontrada.");
    return { user: result.rows[0] };
  }
}
