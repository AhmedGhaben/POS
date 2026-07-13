import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { Permission } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequiresPermission } from "../common/decorators/requires-permission.decorator";
import { StoreAccessGuard } from "../common/guards/store-access.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateReturnDto } from "./dto/create-return.dto";
import { ReturnsService } from "./returns.service";

@Controller("returns")
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Get("store/:storeId")
  @UseGuards(StoreAccessGuard)
  findByStore(@Param("storeId") storeId: string) {
    return this.returnsService.findByStore(storeId);
  }

  @Post()
  @UseGuards(StoreAccessGuard)
  @RequiresPermission(Permission.PROCESS_RETURN)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateReturnDto) {
    return this.returnsService.create(user.userId, dto);
  }
}
