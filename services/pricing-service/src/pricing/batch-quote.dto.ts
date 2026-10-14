import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from "class-validator";

export class QuoteItemDto {
  @IsUUID() productId!: string;
  @IsUUID() variantId!: string;
  @IsInt() @Min(1) @Max(1000000) quantity!: number;
}
export class BatchQuoteDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => QuoteItemDto)
  items!: QuoteItemDto[];
}
export class CartQuoteDto extends BatchQuoteDto {
  @IsOptional() @IsString() @MaxLength(64) couponCode?: string;
}
