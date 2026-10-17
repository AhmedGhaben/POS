import { Body, Controller, Delete, Get, Param, Post, Query, Res, StreamableFile, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { IsIn, IsString, MaxLength } from "class-validator";
import type { Response } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { ACCOUNTING_READ } from "./accounting-roles";
import { ArchiveService, OWNER_TYPES, OwnerType } from "./archive.service";

class AttachDto {
  @IsIn(OWNER_TYPES)
  ownerType!: OwnerType;

  @IsString()
  ownerId!: string;

  @IsString()
  @MaxLength(120)
  fileName!: string;

  /** data:<type>;base64,… (PDF or image, 5 MB at most once decoded). */
  @IsString()
  dataUrl!: string;
}

/** Attachments (scanned papers) and the period's document archive (B2). */
@Controller()
@UseGuards(RolesGuard)
export class ArchiveController {
  constructor(private readonly archive: ArchiveService) {}

  @Post("attachments")
  @Roles(Role.OWNER, Role.MANAGER, Role.ACCOUNTANT)
  attach(@CurrentUser() user: AuthenticatedUser, @Body() dto: AttachDto) {
    return this.archive.attach(user.businessId, user.userId, dto);
  }

  @Get("attachments")
  @Roles(Role.OWNER, Role.MANAGER)
  list(@CurrentUser() user: AuthenticatedUser, @Query("ownerType") ownerType: string, @Query("ownerId") ownerId: string) {
    return this.archive.list(user.businessId, ownerType, ownerId);
  }

  @Get("attachments/:id/file")
  @Roles(Role.OWNER, Role.MANAGER)
  async file(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Res({ passthrough: true }) res: Response) {
    const a = await this.archive.file(user.businessId, id);
    res.set({ "Content-Type": a.mimeType, "Content-Disposition": `attachment; filename="${encodeURIComponent(a.fileName)}"`, "Access-Control-Expose-Headers": "Content-Disposition", "Cache-Control": "no-store" });
    return new StreamableFile(Buffer.from(a.data));
  }

  @Delete("attachments/:id")
  @Roles(Role.OWNER, Role.MANAGER, Role.ACCOUNTANT)
  remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.archive.remove(user.businessId, id);
  }

  /** A period's documents (PDF), SAF-T files and attachments as one ZIP. */
  @Get("accounting/archive")
  @Roles(...ACCOUNTING_READ)
  async download(@CurrentUser() user: AuthenticatedUser, @Query("startDate") startDate: string, @Query("endDate") endDate: string, @Res({ passthrough: true }) res: Response) {
    const file = await this.archive.archive(user.businessId, user.userId, startDate, endDate);
    res.set({ "Content-Type": file.mimeType, "Content-Disposition": `attachment; filename="${file.fileName}"`, "Access-Control-Expose-Headers": "Content-Disposition", "Cache-Control": "no-store" });
    return new StreamableFile(file.body);
  }
}
