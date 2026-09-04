import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import {
  CreateProductDto,
  CreateVariantDto,
  ProductSearchDto,
  UpdateProductDto,
  UpdateVariantDto,
} from "./catalog.dto";
import { CatalogService } from "./catalog.service";
import type {
  AdminProductResponse,
  AdminVariantResponse,
  ProductDetailResponse,
  ProductSearchResponse,
} from "./catalog.types";

@Controller("products")
export class ProductsController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get()
  search(@Query() query: ProductSearchDto): Promise<ProductSearchResponse> {
    return this.catalogService.search(query);
  }

  @Get(":id")
  getProduct(@Param("id") id: string): Promise<ProductDetailResponse> {
    return this.catalogService.getPublicProduct(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  createProduct(@Body() body: CreateProductDto): Promise<AdminProductResponse> {
    return this.catalogService.createProduct(body);
  }

  @Patch(":id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  updateProduct(
    @Param("id") id: string,
    @Body() body: UpdateProductDto,
  ): Promise<AdminProductResponse> {
    return this.catalogService.updateProduct(id, body);
  }

  @Post(":id/variants")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  createVariant(
    @Param("id") id: string,
    @Body() body: CreateVariantDto,
  ): Promise<AdminVariantResponse> {
    return this.catalogService.createVariant(id, body);
  }
}

@Controller("variants")
export class VariantsController {
  constructor(private readonly catalogService: CatalogService) {}

  @Patch(":id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  updateVariant(
    @Param("id") id: string,
    @Body() body: UpdateVariantDto,
  ): Promise<AdminVariantResponse> {
    return this.catalogService.updateVariant(id, body);
  }
}
