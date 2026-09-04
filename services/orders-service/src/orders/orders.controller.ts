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

import type { AuthenticatedRequest } from "../common/authenticated-request";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { CancelOrderDto, cleanOptionalText, CreateOrderDto } from "./orders.dto";
import { OrdersService } from "./orders.service";
import type { Order, OrderResponse } from "./orders.types";

@Controller("orders")
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles("ADMIN", "EMPLOYEE", "CUSTOMER")
  create(
    @Body() body: CreateOrderDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<OrderResponse> {
    return this.orders.create(body, idempotencyKey, this.actor(request));
  }

  @Get()
  @Roles("ADMIN", "EMPLOYEE")
  list(@Req() request: AuthenticatedRequest): Promise<{ orders: Order[] }> {
    return this.orders.list(this.actor(request));
  }

  @Get(":id")
  @Roles("ADMIN", "EMPLOYEE", "CUSTOMER")
  get(@Param("id") id: string, @Req() request: AuthenticatedRequest): Promise<OrderResponse> {
    return this.orders.get(id, this.actor(request));
  }

  @Post(":id/cancel")
  @Roles("ADMIN", "EMPLOYEE", "CUSTOMER")
  cancel(
    @Param("id") id: string,
    @Body() body: CancelOrderDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OrderResponse> {
    return this.orders.cancel(id, this.actor(request), cleanOptionalText(body.reason));
  }

  private actor(request: AuthenticatedRequest) {
    if (!request.authUser) throw new Error("Authenticated user is unavailable.");
    return {
      ...request.authUser,
      correlationId: request.correlationId ?? null,
    };
  }
}
