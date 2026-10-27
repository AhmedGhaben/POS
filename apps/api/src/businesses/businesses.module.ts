import { Module } from "@nestjs/common";
import { BusinessesController } from "./businesses.controller";
import { BusinessesService } from "./businesses.service";
import { MailModule } from "../common/mail/mail.module";

@Module({
  imports: [MailModule],
  controllers: [BusinessesController],
  providers: [BusinessesService],
  exports: [BusinessesService],
})
export class BusinessesModule {}
