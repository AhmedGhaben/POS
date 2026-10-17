import { Body, Controller, Get, Headers, HttpCode, Param, Post, Put, UseGuards } from "@nestjs/common";
import { IsOptional, IsString } from "class-validator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { isLanguage } from "../common/i18n/languages";
import { translateMessage } from "../common/i18n/messages";
import { ACCOUNTING_READ, ACCOUNTING_WRITE } from "./accounting-roles";
import { IntegrationService } from "./integration.service";
import { MappingService } from "./mapping.service";

class SetMappingDto {
  /** A movement account, or null for the default. */
  @IsOptional()
  @IsString()
  accountId?: string | null;
}

/** The automatic posting from the POS: the mapping and the monitor (step A4). */
@Controller("accounting")
@UseGuards(RolesGuard)
export class IntegrationController {
  constructor(
    private readonly integration: IntegrationService,
    private readonly mapping: MappingService,
  ) {}

  @Get("mapping")
  @Roles(...ACCOUNTING_READ)
  mappingList(@CurrentUser() user: AuthenticatedUser) {
    return this.mapping.list(user.businessId);
  }

  @Put("mapping/:key")
  @Roles(...ACCOUNTING_WRITE)
  setMapping(@CurrentUser() user: AuthenticatedUser, @Param("key") key: string, @Body() dto: SetMappingDto) {
    return this.mapping.set(user.businessId, key, dto.accountId ?? null);
  }

  /** What isn't posted yet, and what couldn't be posted (with why). */
  @Get("integration")
  @Roles(...ACCOUNTING_READ)
  async monitor(@CurrentUser() user: AuthenticatedUser, @Headers("x-language") language?: string) {
    const m = await this.integration.monitor(user.businessId);
    // The reasons are kept in English and shown in the reader's language.
    return isLanguage(language) ? { ...m, errors: m.errors.map((e) => ({ ...e, message: translateMessage(e.message, language) })) } : m;
  }

  /** Posts what's waiting now (and tries the errors again). */
  @Post("integration/run")
  @HttpCode(200)
  @Roles(...ACCOUNTING_WRITE)
  run(@CurrentUser() user: AuthenticatedUser) {
    return this.integration.run(user.businessId, user.userId);
  }
}
