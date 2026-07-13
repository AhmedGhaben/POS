import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
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
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateReturnDto) {
    return this.returnsService.create(user.userId, dto);
  }
}
