import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

function normalizedText(value: unknown): unknown {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : value;
}

export class CreateOrderItemDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  variantId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity!: number;
}

export class CreateOrderDto {
  @IsUUID()
  branchId!: string;

  // CUSTOMER orders always use the authenticated user. Staff may register a
  // sale on behalf of a customer without querying Auth's private database.
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}

export class CancelOrderDto {
  @IsOptional()
  @Type(() => String)
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export function cleanOptionalText(value: string | undefined): string | null {
  const normalized = normalizedText(value);
  return typeof normalized === "string" && normalized.length > 0 ? normalized : null;
}
