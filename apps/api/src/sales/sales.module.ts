import { Module } from "@nestjs/common";
import { MailModule } from "../common/mail/mail.module";
import { SalesController } from "./sales.controller";
import { SalesService } from "./sales.service";

@Module({
  imports: [MailModule],
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
