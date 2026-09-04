import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

import type {
  AuthenticatedRequest,
  AuthenticatedUser,
} from "../common/authenticated-request";
import { CurrentUser } from "../common/current-user.decorator";
import { InternalOrdersGuard } from "../common/internal-orders.guard";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import {
  CreateMovementDto,
  CreateReservationDto,
} from "./inventory.dto";
import { InventoryService } from "./inventory.service";
import type {
  InventoryListResponse,
  MovementResponse,
  ReservationResponse,
} from "./inventory.types";

@Controller("inventory")
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "EMPLOYEE")
  listInventory(): Promise<InventoryListResponse> {
    return this.inventoryService.listInventory();
  }

  @Get("branches/:branchId")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "EMPLOYEE")
  listBranchInventory(@Param("branchId") branchId: string): Promise<InventoryListResponse> {
    return this.inventoryService.listBranchInventory(branchId);
  }

  @Get("low-stock")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "EMPLOYEE")
  listLowStock(): Promise<InventoryListResponse> {
    return this.inventoryService.listLowStock();
  }

  @Post("movements")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "EMPLOYEE")
  createMovement(
    @Body() body: CreateMovementDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: AuthenticatedRequest,
  ): Promise<MovementResponse> {
    return this.inventoryService.createMovement(body, user, request.correlationId);
  }

  // These routes are intentionally private to the service network. Orders
  // consumes them in Phase 5 with an internal service credential; the browser
  // never receives that credential and Kong deliberately has no public route.
  @Post("reservations")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(InternalOrdersGuard)
  reserve(
    @Body() body: CreateReservationDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<ReservationResponse> {
    return this.inventoryService.reserve(body, idempotencyKey, request.correlationId);
  }

  @Post("reservations/:id/commit")
  @UseGuards(InternalOrdersGuard)
  commit(
    @Param("id") id: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<ReservationResponse> {
    return this.inventoryService.commitReservation(id, idempotencyKey, request.correlationId);
  }

  @Post("reservations/:id/release")
  @UseGuards(InternalOrdersGuard)
  release(
    @Param("id") id: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<ReservationResponse> {
    return this.inventoryService.releaseReservation(id, idempotencyKey, request.correlationId);
  }
}
