import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, IsIn } from 'class-validator';

export class RegisterDto {
  @Transform(({value}: {value: unknown}) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @Transform(({value}: {value: unknown}) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @MaxLength(320) email!: string;
  @IsString() @MinLength(15) @MaxLength(72) password!: string;
  @IsString() @Matches(/^[A-Za-z0-9_-]{43,128}$/) browserNonce!: string;
  @IsOptional() @IsString() @MaxLength(512) returnPath?: string;
}
export class ResendVerificationDto {
  @Transform(({value}: {value: unknown}) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @MaxLength(320) email!: string;
}
export class ConfirmVerificationDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{43,128}$/) token!: string;
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{43,128}$/) browserNonce?: string;
  @IsOptional() @IsString() @MinLength(15) @MaxLength(72) password?: string;
}
export class InvitationDto {
  @Transform(({value}: {value: unknown}) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @Transform(({value}: {value: unknown}) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @MaxLength(320) email!: string;
}
export class AcceptInvitationDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{43,128}$/) token!: string;
  @IsString() @MinLength(15) @MaxLength(72) password!: string;
}
export class EmployeeStatusDto {
  @IsBoolean() isActive!: boolean;
  @IsInt() @Min(0) authVersion!: number;
}
export class EmployeesQueryDto {
  @IsOptional() @Transform(({value}: {value: unknown}) => Number(value)) @IsInt() @Min(1) page = 1;
  @IsOptional() @Transform(({value}: {value: unknown}) => Number(value)) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
}
export class AuthorizeDeliveryDto {
  @IsUUID() challengeId!: string;
  @IsUUID() userId!: string;
  @IsIn(['EMAIL_VERIFICATION','EMPLOYEE_INVITATION']) purpose!: 'EMAIL_VERIFICATION' | 'EMPLOYEE_INVITATION';
  @IsInt() @Min(1) generation!: number;
}
export class EmptyOnboardingDto {}
