import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";

export interface ReceiptEmailItem {
  name: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

export interface ReceiptEmailParams {
  storeName: string;
  receiptNumber: string;
  items: ReceiptEmailItem[];
  subtotal: string;
  taxTotal: string;
  total: string;
}

export interface LowStockEmailItem {
  productName: string;
  quantity: number;
  reorderLevel: number;
}

export interface LowStockEmailParams {
  storeName: string;
  items: LowStockEmailItem[];
}

/** Product/store names are set by store staff, not the email recipient — escape
 * before interpolating into HTML so a crafted name can't inject markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Sends through Resend when RESEND_API_KEY is configured; otherwise logs the
 * would-be email so local/dev/CI environments work without a real account.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;
  /** Base URL of the web app, used to build links in emails. */
  private readonly appUrl: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>("RESEND_API_KEY");
    this.resend = apiKey ? new Resend(apiKey) : null;
    this.from = this.config.get<string>("MAIL_FROM") ?? "POS <onboarding@resend.dev>";
    this.appUrl = (this.config.get<string>("APP_URL") ?? "http://localhost:5173").replace(/\/+$/, "");
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.resend) {
      this.logger.log(`[stub email] To: ${to} | Subject: ${subject}\n${html}`);
      return;
    }
    const { error } = await this.resend.emails.send({ from: this.from, to, subject, html });
    if (error) {
      this.logger.error(`Failed to send email to ${to}: ${error.message}`);
    }
  }

  async sendPasswordResetEmail(to: string, resetToken: string): Promise<void> {
    const link = `${this.appUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;
    await this.send(
      to,
      "Reset your password",
      `<p>A password reset was requested for your account.</p>
       <p><a href="${link}">Choose a new password</a> (link expires in 1 hour)</p>
       <p>If you didn't request this, you can ignore this email.</p>`,
    );
  }

  async sendEmailVerificationEmail(to: string, firstName: string, verifyToken: string): Promise<void> {
    const link = `${this.appUrl}/verify-email?token=${encodeURIComponent(verifyToken)}`;
    await this.send(
      to,
      "Verify your email",
      `<p>Hi ${escapeHtml(firstName)},</p>
       <p>Thanks for signing up. Please confirm your email address:</p>
       <p><a href="${link}">Verify my email</a> (link expires in 24 hours)</p>
       <p>If you didn't create an account, you can ignore this email.</p>`,
    );
  }

  async sendStaffInviteEmail(
    to: string,
    params: { firstName: string; businessName: string; token: string },
  ): Promise<void> {
    const link = `${this.appUrl}/reset-password?token=${encodeURIComponent(params.token)}&invite=1`;
    const businessName = escapeHtml(params.businessName);
    await this.send(
      to,
      `You've been added to ${businessName}`,
      `<p>Hi ${escapeHtml(params.firstName)},</p>
       <p>You've been given a login for <b>${businessName}</b>'s point of sale.</p>
       <p><a href="${link}">Set your password</a> (link expires in 72 hours)</p>
       <p>Then sign in with this email address: ${escapeHtml(to)}</p>`,
    );
  }

  async sendReceiptEmail(to: string, params: ReceiptEmailParams): Promise<void> {
    const rows = params.items
      .map(
        (item) =>
          `<tr><td>${escapeHtml(item.name)}</td><td align="right">${item.quantity}</td><td align="right">$${item.unitPrice}</td><td align="right">$${item.lineTotal}</td></tr>`,
      )
      .join("");
    const storeName = escapeHtml(params.storeName);
    await this.send(
      to,
      `Receipt from ${storeName} — #${params.receiptNumber}`,
      `<h2>${storeName}</h2>
       <p>Receipt #${params.receiptNumber}</p>
       <table cellpadding="4" style="border-collapse: collapse; width: 100%;">
         <thead><tr><th align="left">Item</th><th align="right">Qty</th><th align="right">Price</th><th align="right">Total</th></tr></thead>
         <tbody>${rows}</tbody>
       </table>
       <p>Subtotal: $${params.subtotal}<br/>Tax: $${params.taxTotal}<br/><b>Total: $${params.total}</b></p>
       <p>Thank you for your purchase!</p>`,
    );
  }

  async sendLowStockAlertEmail(to: string, params: LowStockEmailParams): Promise<void> {
    const rows = params.items
      .map(
        (item) =>
          `<tr><td>${escapeHtml(item.productName)}</td><td align="right">${item.quantity}</td><td align="right">${item.reorderLevel}</td></tr>`,
      )
      .join("");
    const storeName = escapeHtml(params.storeName);
    await this.send(
      to,
      `Low stock alert — ${storeName}`,
      `<h2>Low stock at ${storeName}</h2>
       <p>The following items are at or below their reorder level:</p>
       <table cellpadding="4" style="border-collapse: collapse; width: 100%;">
         <thead><tr><th align="left">Product</th><th align="right">Quantity</th><th align="right">Reorder level</th></tr></thead>
         <tbody>${rows}</tbody>
       </table>`,
    );
  }
}
