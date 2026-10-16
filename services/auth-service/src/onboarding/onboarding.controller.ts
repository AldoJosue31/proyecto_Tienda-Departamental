import { Body, Controller, Get, Headers, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ApiException } from '../common/api-exception';
import type { AuthenticatedRequest, AuthenticatedUser } from '../common/authenticated-request';
import { CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ONBOARDING_CONFIG, type OnboardingConfig } from './onboarding.config';
import { AcceptInvitationDto, AuthorizeDeliveryDto, ConfirmVerificationDto, EmployeesQueryDto, EmployeeStatusDto, EmptyOnboardingDto, InvitationDto, RegisterDto, ResendVerificationDto } from './onboarding.dto';
import { onboardingIp, secureEqual } from './onboarding.security';
import { OnboardingService } from './onboarding.service';

@Controller('auth')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService, @Inject(ONBOARDING_CONFIG) private readonly config: OnboardingConfig) {}

  @Post('register') @HttpCode(202)
  register(@Body() body: RegisterDto, @Req() request: AuthenticatedRequest) {
    return this.onboarding.register(body, onboardingIp(request, this.config.trustedBffIpKey), this.correlation(request));
  }
  @Post('email-verification/resend') @HttpCode(202)
  resend(@Body() body: ResendVerificationDto, @Req() request: AuthenticatedRequest) {
    return this.onboarding.resendVerification(body.email, onboardingIp(request, this.config.trustedBffIpKey), this.correlation(request));
  }
  @Post('email-verification/confirm') @HttpCode(200)
  confirm(@Body() body: ConfirmVerificationDto, @Req() request: AuthenticatedRequest) {
    return this.onboarding.confirmVerification(body, onboardingIp(request, this.config.trustedBffIpKey), this.correlation(request));
  }
  @Post('employee-invitations/accept') @HttpCode(200)
  accept(@Body() body: AcceptInvitationDto, @Req() request: AuthenticatedRequest) {
    return this.onboarding.acceptEmployee(body, onboardingIp(request, this.config.trustedBffIpKey), this.correlation(request));
  }
  @Get('employees') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('ADMIN')
  list(@Query() query: EmployeesQueryDto) { return this.onboarding.listEmployees(query); }

  @Post('employees/invitations') @HttpCode(202) @UseGuards(JwtAuthGuard, RolesGuard) @Roles('ADMIN')
  invite(@Body() body: InvitationDto, @Headers('idempotency-key') key: string | undefined, @CurrentUser() actor: AuthenticatedUser, @Req() request: AuthenticatedRequest) {
    return this.onboarding.inviteEmployee(actor.id, body, key, this.correlation(request));
  }
  @Post('employees/:id/invitation/resend') @HttpCode(202) @UseGuards(JwtAuthGuard, RolesGuard) @Roles('ADMIN')
  resendEmployee(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: EmptyOnboardingDto, @CurrentUser() actor: AuthenticatedUser, @Req() request: AuthenticatedRequest) {
    void body;
    return this.onboarding.resendEmployee(actor.id, id, this.correlation(request));
  }
  @Patch('employees/:id/status') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('ADMIN')
  status(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: EmployeeStatusDto, @CurrentUser() actor: AuthenticatedUser, @Req() request: AuthenticatedRequest) {
    return this.onboarding.setEmployeeStatus(actor.id, id, body, this.correlation(request));
  }
  private correlation(request: AuthenticatedRequest) { return request.correlationId || randomUUID(); }
}

@Controller('internal/auth')
export class OnboardingInternalController {
  constructor(private readonly onboarding: OnboardingService, @Inject(ONBOARDING_CONFIG) private readonly config: OnboardingConfig) {}

  @Get('users/:id/status')
  identity(@Param('id', new ParseUUIDPipe()) id: string, @Headers('x-internal-service-key') key: string | undefined) {
    this.authorize(key, this.config.statusKey);
    return this.onboarding.identityStatus(id);
  }
  @Post('onboarding-deliveries/authorize') @HttpCode(200)
  delivery(@Body() body: AuthorizeDeliveryDto, @Headers('x-internal-service-key') key: string | undefined) {
    this.authorize(key, this.config.deliveryKey);
    return this.onboarding.authorizeDelivery(body);
  }
  private authorize(key: string | undefined, expected: Buffer) {
    if (!secureEqual(key, expected)) throw new ApiException(401, 'UNAUTHORIZED', 'Servicio interno no autorizado');
  }
}
