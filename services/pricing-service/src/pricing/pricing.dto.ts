import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";

import {
  DISCOUNT_TYPES,
  TARGET_SCOPES,
  type DiscountType,
  type PromotionStatus,
  type TargetScope,
} from "./pricing.types";

const normalize = (value: unknown): unknown =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ") : value;

export class PromotionTargetDto {
  @IsIn(TARGET_SCOPES)
  scope!: TargetScope;

  @ValidateIf((target: PromotionTargetDto) => target.scope !== "ALL")
  @IsUUID()
  targetId?: string;
}

export class CreatePromotionDto {
  @Transform(({ value }: { value: unknown }) => normalize(value))
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  name!: string;

  @IsIn(DISCOUNT_TYPES)
  discountType!: DiscountType;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0.01)
  @Max(9_999_999.99)
  discountValue!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  priority?: number;

  @IsISO8601({ strict: true })
  startsAt!: string;

  @IsISO8601({ strict: true })
  endsAt!: string;

  @Transform(({ value }: { value: unknown }) => normalize(value))
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  timezone!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PromotionTargetDto)
  targets!: PromotionTargetDto[];
}

export class UpdatePromotionDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalize(value))
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsIn(DISCOUNT_TYPES)
  discountType?: DiscountType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0.01)
  @Max(9_999_999.99)
  discountValue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  priority?: number;

  @IsOptional()
  @IsISO8601({ strict: true })
  startsAt?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  endsAt?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalize(value))
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  timezone?: string;

  @IsOptional()
  @IsIn(["DRAFT", "SCHEDULED"])
  status?: Extract<PromotionStatus, "DRAFT" | "SCHEDULED">;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PromotionTargetDto)
  targets?: PromotionTargetDto[];
}

export class QuoteQueryDto {
  @IsUUID()
  variantId!: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(9_999_999.99)
  basePrice!: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === "string" ? value.trim().toUpperCase() : value)
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
}
