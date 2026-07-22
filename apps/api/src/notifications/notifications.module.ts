import { Module } from "@nestjs/common";
import { ReportsModule } from "../reports/reports.module";
import { MailModule } from "../common/mail/mail.module";
import { LowStockAlertService } from "./low-stock-alert.service";

@Module({
  imports: [ReportsModule, MailModule],
  providers: [LowStockAlertService],
})
export class NotificationsModule {}
