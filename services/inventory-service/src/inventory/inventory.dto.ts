import { Transform, Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

import { MOVEMENT_TYPES, type MovementType } from "./inventory.types";

function normalizedText(value: unknown): unknown {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : value;
}

export class VariantSnapshotDto {
  @Transform(({ value }: { value: unknown }) => normalizedText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  productName!: string;

  @Transform(({ value }: { value: unknown }) => normalizedText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sku!: string;

  @Transform(({ value }: { value: unknown }) => normalizedText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(360)
  variantLabel!: string;
}

export class CreateMovementDto {
  @IsUUID()
  variantId!: string;

  @IsUUID()
  branchId!: string;

  @IsIn(MOVEMENT_TYPES)
  type!: MovementType;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  reorderPoint?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizedText(value))
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => VariantSnapshotDto)
  catalogSnapshot?: VariantSnapshotDto;
}

export class CreateReservationDto {
  @IsUUID()
  variantId!: string;

  @IsUUID()
  branchId!: string;

  @IsUUID()
  orderId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity!: number;
}

export function cleanOptionalText(value: string | undefined): string | null {
  const clean = typeof value === "string" ? normalizedText(value) : value;
  return typeof clean === "string" && clean.length > 0 ? clean : null;
}
