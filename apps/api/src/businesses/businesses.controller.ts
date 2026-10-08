import { Body, Controller, Delete, Get, Param, Patch, Put, Res, StreamableFile, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { Response } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Public } from "../common/decorators/public.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { BusinessesService } from "./businesses.service";
import { UpdateBusinessDto } from "./dto/update-business.dto";
import { UploadLogoDto } from "./dto/upload-logo.dto";

@Controller("businesses")
@UseGuards(RolesGuard)
export class BusinessesController {
  constructor(private readonly businessesService: BusinessesService) {}

  @Get("me")
  findOwn(@CurrentUser() user: AuthenticatedUser) {
    return this.businessesService.findOwn(user.businessId);
  }

  @Patch("me")
  @Roles(Role.OWNER)
  update(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateBusinessDto) {
    return this.businessesService.update(user.businessId, dto);
  }

  @Put("me/logo")
  @Roles(Role.OWNER)
  setLogo(@CurrentUser() user: AuthenticatedUser, @Body() dto: UploadLogoDto) {
    return this.businessesService.setLogo(user.businessId, dto.dataUrl);
  }

  @Delete("me/logo")
  @Roles(Role.OWNER)
  removeLogo(@CurrentUser() user: AuthenticatedUser) {
    return this.businessesService.removeLogo(user.businessId);
  }

  /**
   * Public so a plain <img> can load it (no Authorization header) and it can
   * be cached for offline receipts. A logo is printed on every receipt, so
   * it isn't secret; the business id is an unguessable cuid. The `v` query
   * param in logoUrl changes on every upload, so a long cache is safe.
   */
  @Public()
  @Get(":businessId/logo")
  async getLogo(@Param("businessId") businessId: string, @Res({ passthrough: true }) res: Response) {
    const { bytes, mimeType } = await this.businessesService.getLogo(businessId);
    res.set({
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    });
    return new StreamableFile(bytes);
  }
}
