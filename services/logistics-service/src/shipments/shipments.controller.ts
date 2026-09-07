import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";

import { ApiException } from "../common/api-exception";
import type { AuthenticatedRequest } from "../common/authenticated-request";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { ShipmentsService } from "./shipments.service";
import type {
  CourierLocationRequest,
  CourierLocationResponse,
  ShipmentDetailResponse,
  ShipmentListResponse,
  ShipmentActor,
  ShipmentStatusRequest,
  TrackingAssignmentRequest,
} from "./shipments.types";

function authenticatedActor(request: AuthenticatedRequest) {
  const user = request.authUser;
  if (!user) throw new ApiException(401, "UNAUTHORIZED", "No autorizado");
  return { id: user.id, role: user.role, correlationId: request.correlationId ?? null };
}

function operationalActor(request: AuthenticatedRequest): ShipmentActor {
  const actor = authenticatedActor(request);
  if (actor.role === "ADMIN") return { ...actor, role: "ADMIN" };
  if (actor.role === "EMPLOYEE") return { ...actor, role: "EMPLOYEE" };
  throw new ApiException(403, "FORBIDDEN", "No tienes permisos para esta operación");
}

@Controller("shipments")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ShipmentsController {
  constructor(private readonly shipments: ShipmentsService) {}

  @Get()
  @Roles("ADMIN", "EMPLOYEE", "CUSTOMER")
  list(@Req() request: AuthenticatedRequest): Promise<ShipmentListResponse> {
    return this.shipments.list(authenticatedActor(request));
  }

  @Get(":id")
  @Roles("ADMIN", "EMPLOYEE", "CUSTOMER")
  detail(@Param("id") id: string, @Req() request: AuthenticatedRequest): Promise<ShipmentDetailResponse> {
    return this.shipments.detail(id, authenticatedActor(request));
  }

  @Patch(":id/status")
  @Roles("ADMIN", "EMPLOYEE")
  changeStatus(@Param("id") id: string, @Body() body: ShipmentStatusRequest, @Req() request: AuthenticatedRequest): Promise<ShipmentDetailResponse> {
    return this.shipments.changeStatus(id, body, operationalActor(request));
  }

  @Patch(":id/tracking")
  @Roles("ADMIN", "EMPLOYEE")
  assignTracking(@Param("id") id: string, @Body() body: TrackingAssignmentRequest, @Req() request: AuthenticatedRequest): Promise<ShipmentDetailResponse> {
    operationalActor(request);
    return this.shipments.assignTracking(id, body);
  }
}

@Controller("couriers")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "EMPLOYEE")
export class CouriersController {
  constructor(private readonly shipments: ShipmentsService) {}

  @Get(":id/location")
  location(@Param("id") id: string): Promise<CourierLocationResponse> {
    return this.shipments.courierLocation(id);
  }

  @Post(":id/location")
  recordLocation(@Param("id") id: string, @Body() body: CourierLocationRequest, @Req() request: AuthenticatedRequest): Promise<CourierLocationResponse> {
    const actor = operationalActor(request);
    return this.shipments.recordCourierLocation(id, body, actor.correlationId);
  }
}
