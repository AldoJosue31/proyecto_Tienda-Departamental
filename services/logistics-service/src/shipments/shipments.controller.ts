import { Body, Controller, Get, Param, Patch, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import type { AuthenticatedRequest } from "../common/authenticated-request";
import { ApiException } from "../common/api-exception";
import { ShipmentsService } from "./shipments.service";
import type { ShipmentDetailResponse, ShipmentListResponse, ShipmentStatusRequest } from "./shipments.types";

@Controller("shipments")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "EMPLOYEE")
export class ShipmentsController {
  constructor(private readonly shipments: ShipmentsService) {}
  @Get() list(): Promise<ShipmentListResponse> { return this.shipments.list(); }
  @Get(":id") detail(@Param("id") id: string): Promise<ShipmentDetailResponse> { return this.shipments.detail(id); }
  @Patch(":id/status") changeStatus(@Param("id") id: string, @Body() body: ShipmentStatusRequest, @Req() request: AuthenticatedRequest): Promise<ShipmentDetailResponse> {
    const user = request.authUser;
    if (!user || (user.role !== "ADMIN" && user.role !== "EMPLOYEE")) throw new ApiException(403, "FORBIDDEN", "No tienes permisos para esta operación");
    return this.shipments.changeStatus(id, body, { id: user.id, role: user.role, correlationId: request.correlationId ?? null });
  }
}
