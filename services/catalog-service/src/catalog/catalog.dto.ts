import { Type, Transform } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

import { CATALOG_STATUSES, type CatalogStatus } from "./catalog.types";

function normalizedText(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

function normalizedSlug(value: unknown): unknown {
  return typeof value === "string" ? value.trim().toLowerCase() : value;
}

function normalizedSku(value: unknown): unknown {
  return typeof value === "string" ? value.trim().toUpperCase() : value;
}

function normalizedCurrency(value: unknown): unknown {
  return typeof value === "string" ? value.trim().toUpperCase() : value;
}

function blankToUndefined(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

export class CategoryInputDto {
  @Transform(({ value }: { value: unknown }) => normalizedText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizedSlug(value))
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(140)
  slug?: string;
}

export class BrandInputDto {
  @Transform(({ value }: { value: unknown }) => normalizedText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizedSlug(value))
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(140)
  slug?: string;
}

export class ProductSearchDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => blankToUndefined(value))
  @IsString()
  @MaxLength(160)
  search?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => blankToUndefined(value))
  @IsString()
  @MaxLength(140)
  category?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => blankToUndefined(value))
  @IsString()
  @MaxLength(140)
  brand?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class CreateProductDto {
  @Transform(({ value }: { value: unknown }) => normalizedText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizedSlug(value))
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(220)
  slug?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizedText(value))
  @IsString()
  @MaxLength(10_000)
  description?: string;

  @IsDefined()
  @Type(() => CategoryInputDto)
  @ValidateNested()
  category!: CategoryInputDto;

  @IsDefined()
  @Type(() => BrandInputDto)
  @ValidateNested()
  brand!: BrandInputDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  tags?: string[];

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizedText(value))
  @IsString()
  @MaxLength(2_048)
  @Matches(/^(?:\/(?!\/)|https:\/\/)/)
  imageUrl?: string;

  @IsOptional()
  @IsIn(CATALOG_STATUSES)
  status?: CatalogStatus;
}

export class UpdateProductDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizedText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizedSlug(value))
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(220)
  slug?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizedText(value))
  @IsString()
  @MaxLength(10_000)
  description?: string | null;

  @IsOptional()
  @Type(() => CategoryInputDto)
  @ValidateNested()
  category?: CategoryInputDto;

  @IsOptional()
  @Type(() => BrandInputDto)
  @ValidateNested()
  brand?: BrandInputDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  tags?: string[];

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizedText(value))
  @IsString()
  @MaxLength(2_048)
  @Matches(/^(?:\/(?!\/)|https:\/\/)/)
  imageUrl?: string | null;

  @IsOptional()
  @IsIn(CATALOG_STATUSES)
  status?: CatalogStatus;
}

export class CreateVariantDto {
  @Transform(({ value }: { value: unknown }) => normalizedSku(value))
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(/^[A-Z0-9][A-Z0-9._-]*$/)
  sku!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizedText(value))
  @IsString()
  @MaxLength(120)
  size?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizedText(value))
  @IsString()
  @MaxLength(120)
  color?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizedText(value))
  @IsString()
  @MaxLength(120)
  material?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(9_999_999.99)
  listPrice!: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizedCurrency(value))
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @IsOptional()
  @IsIn(CATALOG_STATUSES)
  status?: CatalogStatus;
}

export class UpdateVariantDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizedSku(value))
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(/^[A-Z0-9][A-Z0-9._-]*$/)
  sku?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizedText(value))
  @IsString()
  @MaxLength(120)
  size?: string | null;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizedText(value))
  @IsString()
  @MaxLength(120)
  color?: string | null;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizedText(value))
  @IsString()
  @MaxLength(120)
  material?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(9_999_999.99)
  listPrice?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizedCurrency(value))
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @IsOptional()
  @IsIn(CATALOG_STATUSES)
  status?: CatalogStatus;
}
