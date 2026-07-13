import { Controller, Get } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { BusinessesService } from "./businesses.service";

@Controller("businesses")
export class BusinessesController {
  constructor(private readonly businessesService: BusinessesService) {}

  @Get("me")
  findOwn(@CurrentUser() user: AuthenticatedUser) {
    return this.businessesService.findOwn(user.businessId);
  }
}
