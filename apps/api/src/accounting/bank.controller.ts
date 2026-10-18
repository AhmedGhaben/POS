import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from "class-validator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { ACCOUNTING_READ, ACCOUNTING_WRITE } from "./accounting-roles";
import { BankService } from "./bank.service";

class ParseStatementDto {
  @IsString()
  @MaxLength(120)
  fileName!: string;

  @IsString()
  dataUrl!: string;
}

class MappingDto {
  @IsInt() @Min(0) date!: number;
  @IsInt() @Min(0) description!: number;
  @IsOptional() @IsInt() @Min(0) amount?: number | null;
  @IsOptional() @IsInt() @Min(0) debit?: number | null;
  @IsOptional() @IsInt() @Min(0) credit?: number | null;
  @IsOptional() @IsInt() @Min(0) reference?: number | null;
  @IsOptional() @IsInt() @Min(0) skipRows?: number;
}

class ImportStatementDto {
  @IsString()
  accountId!: string;

  @IsString()
  @MaxLength(120)
  fileName!: string;

  /** The table as read (rows of cells). */
  @IsArray()
  @ArrayMaxSize(5000)
  rows!: string[][];

  @ValidateNested()
  @Type(() => MappingDto)
  mapping!: MappingDto;
}

class MatchDto {
  @IsString()
  ledgerLineId!: string;
}

class PostLineDto {
  /** The other side: bank fees (76.8), interest (66.1)… */
  @IsString()
  accountId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}

/** Bank reconciliation (B3). */
@Controller("accounting/bank")
@UseGuards(RolesGuard)
export class BankController {
  constructor(private readonly bank: BankService) {}

  @Post("parse")
  @HttpCode(200)
  @Roles(...ACCOUNTING_WRITE)
  parse(@Body() dto: ParseStatementDto) {
    return this.bank.parse(dto);
  }

  @Get("statements")
  @Roles(...ACCOUNTING_READ)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.bank.list(user.businessId);
  }

  @Post("statements")
  @Roles(...ACCOUNTING_WRITE)
  import(@CurrentUser() user: AuthenticatedUser, @Body() dto: ImportStatementDto) {
    return this.bank.import(user.businessId, user.userId, dto);
  }

  @Get("statements/:id")
  @Roles(...ACCOUNTING_READ)
  get(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.bank.get(user.businessId, id);
  }

  @Post("statements/:id/auto-match")
  @HttpCode(200)
  @Roles(...ACCOUNTING_WRITE)
  async autoMatch(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return { matched: await this.bank.autoMatch(user.businessId, id) };
  }

  @Post("lines/:id/match")
  @HttpCode(200)
  @Roles(...ACCOUNTING_WRITE)
  match(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: MatchDto) {
    return this.bank.match(user.businessId, id, dto.ledgerLineId);
  }

  @Post("lines/:id/unmatch")
  @HttpCode(200)
  @Roles(...ACCOUNTING_WRITE)
  unmatch(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.bank.unmatch(user.businessId, id);
  }

  /** Posts a movement only on the statement (fees, interest) and matches it. */
  @Post("lines/:id/post")
  @Roles(...ACCOUNTING_WRITE)
  post(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: PostLineDto) {
    return this.bank.post(user.businessId, user.userId, id, dto);
  }
}
