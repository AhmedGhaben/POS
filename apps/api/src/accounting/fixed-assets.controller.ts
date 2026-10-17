import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { ACCOUNTING_READ, ACCOUNTING_WRITE } from "./accounting-roles";
import { ASSET_CATEGORIES } from "./fixed-assets";
import { FixedAssetsService } from "./fixed-assets.service";

class CreateAssetDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsIn(Object.keys(ASSET_CATEGORIES)) category!: string;
  @IsDateString({ strict: true }) acquisitionDate!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) acquisitionValue!: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) residualValue?: number;
  /** % a year; defaults to the category's maximum. */
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) annualRate?: number;
  /** Post the purchase against this account (supplier of fixed assets, bank…). */
  @IsOptional() @IsString() counterAccountId?: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

class DepreciateDto {
  @IsInt() @Min(2000) @Max(9999) year!: number;
  @IsInt() @Min(1) @Max(12) month!: number;
}

class DisposeDto {
  @IsDateString({ strict: true }) date!: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) saleValue?: number;
  @IsOptional() @IsString() counterAccountId?: string;
}

/** Fixed assets (B4). */
@Controller("accounting/assets")
@UseGuards(RolesGuard)
export class FixedAssetsController {
  constructor(private readonly assets: FixedAssetsService) {}

  @Get("categories")
  @Roles(...ACCOUNTING_READ)
  categories() {
    return Object.entries(ASSET_CATEGORIES).map(([key, c]) => ({ key, ...c }));
  }

  @Get()
  @Roles(...ACCOUNTING_READ)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.assets.list(user.businessId);
  }

  @Post()
  @Roles(...ACCOUNTING_WRITE)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAssetDto) {
    return this.assets.create(user.businessId, user.userId, dto);
  }

  /** The month's depreciation for every active asset (once per month). */
  @Post("depreciate")
  @HttpCode(200)
  @Roles(...ACCOUNTING_WRITE)
  depreciate(@CurrentUser() user: AuthenticatedUser, @Body() dto: DepreciateDto) {
    return this.assets.depreciate(user.businessId, user.userId, dto.year, dto.month);
  }

  @Post(":id/dispose")
  @HttpCode(200)
  @Roles(...ACCOUNTING_WRITE)
  dispose(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: DisposeDto) {
    return this.assets.dispose(user.businessId, user.userId, id, dto);
  }
}
