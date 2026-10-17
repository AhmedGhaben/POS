import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { AccountantsService } from "./accountants.service";

class InviteAccountantDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  lastName!: string;

  /** OCPCA number (Ordem dos Contabilistas e Peritos Contabilistas de Angola). */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  ocpcaNumber?: string;
}

class AccountantProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  ocpcaNumber?: string | null;
}

/** Outside accountants: the owner's side (who has access) and the accountant's (their clients). */
@Controller()
@UseGuards(RolesGuard)
export class AccountantsController {
  constructor(private readonly accountants: AccountantsService) {}

  @Get("accounting/accountants")
  @Roles(Role.OWNER)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.accountants.list(user.businessId);
  }

  @Post("accounting/accountants")
  @Roles(Role.OWNER)
  invite(@CurrentUser() user: AuthenticatedUser, @Body() dto: InviteAccountantDto) {
    return this.accountants.invite(user.businessId, user.userId, dto);
  }

  @Delete("accounting/accountants/:userId")
  @Roles(Role.OWNER)
  revoke(@CurrentUser() user: AuthenticatedUser, @Param("userId") userId: string) {
    return this.accountants.revoke(user.businessId, user.userId, userId);
  }

  /** The accountant's clients, with what needs doing in each. */
  @Get("accountant/clients")
  @Roles(Role.ACCOUNTANT)
  clients(@CurrentUser() user: AuthenticatedUser) {
    return this.accountants.clients(user.userId, user.businessId);
  }

  @Patch("accountant/profile")
  @HttpCode(200)
  @Roles(Role.ACCOUNTANT)
  profile(@CurrentUser() user: AuthenticatedUser, @Body() dto: AccountantProfileDto) {
    return this.accountants.profile(user.userId, dto);
  }
}
