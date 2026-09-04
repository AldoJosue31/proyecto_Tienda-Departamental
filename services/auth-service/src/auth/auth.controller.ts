import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../common/optional-jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import type {
  AuthenticatedRequest,
  AuthenticatedUser,
} from "../common/authenticated-request";
import { AuthService } from "./auth.service";
import { LoginDto, LogoutDto, RefreshDto } from "./auth.dto";
import type { AdminUser, LoginResponse, SessionMetadata } from "./auth.types";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  @HttpCode(200)
  login(
    @Body() body: LoginDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<LoginResponse> {
    return this.authService.login(
      body.email,
      body.password,
      this.sessionMetadata(request),
    );
  }

  @Post("refresh")
  @HttpCode(200)
  refresh(
    @Body() body: RefreshDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<LoginResponse> {
    return this.authService.refresh(
      body.refreshToken,
      this.sessionMetadata(request),
    );
  }

  @Post("logout")
  @HttpCode(200)
  @UseGuards(OptionalJwtAuthGuard)
  async logout(
    @Body() body: LogoutDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ success: true }> {
    await this.authService.logout(body.refreshToken, request.authUser);
    return { success: true };
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() currentUser: AuthenticatedUser): { user: AuthenticatedUser } {
    return { user: currentUser };
  }

  @Get("users")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  users(): Promise<{ users: AdminUser[] }> {
    return this.authService.listUsers().then((users) => ({ users }));
  }

  private sessionMetadata(request: AuthenticatedRequest): SessionMetadata {
    const userAgent = request.header("user-agent")?.slice(0, 512) || null;
    const ipAddress = request.ip?.slice(0, 64) || null;
    return { userAgent, ipAddress };
  }
}
