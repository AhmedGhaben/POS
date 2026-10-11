import { Module } from "@nestjs/common";
import { MailModule } from "../common/mail/mail.module";
import { PermissionsModule } from "../common/permissions/permissions.module";
import { SalesController } from "./sales.controller";
import { SalesService } from "./sales.service";

@Module({
  imports: [MailModule, PermissionsModule],
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
