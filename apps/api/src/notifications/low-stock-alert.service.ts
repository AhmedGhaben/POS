import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ReportsService } from "../reports/reports.service";
import { MailService } from "../common/mail/mail.service";
import { emailLanguage } from "../common/i18n/languages";

/** Daily digest of low-stock items per store, emailed to everyone who can
 * act on it: every OWNER in the business, plus MANAGERs assigned to that
 * specific store (mirrors the access rule in StoreAccessGuard). */
@Injectable()
export class LowStockAlertService {
  private readonly logger = new Logger(LowStockAlertService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly mail: MailService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async sendDailyAlerts(): Promise<void> {
    const stores = await this.prisma.store.findMany({ where: { isActive: true } });
    for (const store of stores) {
      await this.notifyStore(store.id, store.businessId, store.name).catch((error) => {
        this.logger.error(`Failed to send low-stock alert for store ${store.id}: ${error}`);
      });
    }
  }

  private async notifyStore(storeId: string, businessId: string, storeName: string): Promise<void> {
    const lowStockItems = await this.reports.lowStock(storeId);
    if (lowStockItems.length === 0) {
      return;
    }

    const recipients = await this.prisma.user.findMany({
      where: {
        businessId,
        isActive: true,
        OR: [{ role: Role.OWNER }, { role: Role.MANAGER, storeUsers: { some: { storeId } } }],
      },
      select: { email: true, language: true, business: { select: { language: true } } },
    });

    const params = {
      storeName,
      items: lowStockItems.map((item) => ({
        productName: item.product.name,
        quantity: item.quantity,
        reorderLevel: item.reorderLevel,
      })),
    };

    for (const recipient of recipients) {
      await this.mail.sendLowStockAlertEmail(
        recipient.email,
        params,
        emailLanguage(recipient.language, recipient.business?.language),
      );
    }
  }
}
