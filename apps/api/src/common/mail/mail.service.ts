import { Injectable, Logger } from "@nestjs/common";

/**
 * Console-log stub — Phase 8 (notifications) swaps this for a real provider
 * (e.g. Resend/SES) behind the same interface.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  async sendPasswordResetEmail(to: string, resetToken: string): Promise<void> {
    this.logger.log(
      `Password reset requested for ${to}. Reset token (send via email in production): ${resetToken}`,
    );
  }
}
