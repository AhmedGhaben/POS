import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";
import { formatMoney } from "../utils/currency";
import type { Language } from "../i18n/languages";
import { MAIL_TEXTS } from "./mail-texts";

export interface ReceiptEmailItem {
  name: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

export interface ReceiptEmailParams {
  storeName: string;
  /** ISO 4217 code of the business. */
  currency: string;
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

  async sendPasswordResetEmail(to: string, resetToken: string, lang: Language = "en"): Promise<void> {
    const t = MAIL_TEXTS[lang].reset;
    const link = `${this.appUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;
    await this.send(
      to,
      t.subject,
      `<p>${t.requested}</p>
       <p><a href="${link}">${t.link}</a> ${t.expires}</p>
       <p>${t.ignore}</p>`,
    );
  }

  async sendEmailVerificationEmail(
    to: string,
    firstName: string,
    verifyToken: string,
    lang: Language = "en",
  ): Promise<void> {
    const t = MAIL_TEXTS[lang].verify;
    const link = `${this.appUrl}/verify-email?token=${encodeURIComponent(verifyToken)}`;
    await this.send(
      to,
      t.subject,
      `<p>${t.hi(escapeHtml(firstName))}</p>
       <p>${t.thanks}</p>
       <p><a href="${link}">${t.link}</a> ${t.expires}</p>
       <p>${t.ignore}</p>`,
    );
  }

  async sendStaffInviteEmail(
    to: string,
    params: { firstName: string; businessName: string; token: string },
    lang: Language = "en",
  ): Promise<void> {
    const t = MAIL_TEXTS[lang].invite;
    const link = `${this.appUrl}/reset-password?token=${encodeURIComponent(params.token)}&invite=1`;
    const businessName = escapeHtml(params.businessName);
    await this.send(
      to,
      t.subject(businessName),
      `<p>${t.hi(escapeHtml(params.firstName))}</p>
       <p>${t.given(businessName)}</p>
       <p><a href="${link}">${t.link}</a> ${t.expires}</p>
       <p>${t.signInWith(escapeHtml(to))}</p>`,
    );
  }

  /** In the business language: it goes to the shop's customer. */
  async sendReceiptEmail(to: string, params: ReceiptEmailParams, lang: Language = "en"): Promise<void> {
    const t = MAIL_TEXTS[lang].receipt;
    const money = (value: string) => escapeHtml(formatMoney(value, params.currency, lang));
    const rows = params.items
      .map(
        (item) =>
          `<tr><td>${escapeHtml(item.name)}</td><td align="right">${item.quantity}</td><td align="right">${money(item.unitPrice)}</td><td align="right">${money(item.lineTotal)}</td></tr>`,
      )
      .join("");
    const storeName = escapeHtml(params.storeName);
    await this.send(
      to,
      t.subject(storeName, params.receiptNumber),
      `<h2>${storeName}</h2>
       <p>${t.number(params.receiptNumber)}</p>
       <table cellpadding="4" style="border-collapse: collapse; width: 100%;">
         <thead><tr><th align="left">${t.item}</th><th align="right">${t.qty}</th><th align="right">${t.price}</th><th align="right">${t.total}</th></tr></thead>
         <tbody>${rows}</tbody>
       </table>
       <p>${t.subtotal}: ${money(params.subtotal)}<br/>${t.tax}: ${money(params.taxTotal)}<br/><b>${t.total}: ${money(params.total)}</b></p>
       <p>${t.thanks}</p>`,
    );
  }

  async sendLowStockAlertEmail(to: string, params: LowStockEmailParams, lang: Language = "en"): Promise<void> {
    const t = MAIL_TEXTS[lang].lowStock;
    const rows = params.items
      .map(
        (item) =>
          `<tr><td>${escapeHtml(item.productName)}</td><td align="right">${item.quantity}</td><td align="right">${item.reorderLevel}</td></tr>`,
      )
      .join("");
    const storeName = escapeHtml(params.storeName);
    await this.send(
      to,
      t.subject(storeName),
      `<h2>${t.heading(storeName)}</h2>
       <p>${t.intro}</p>
       <table cellpadding="4" style="border-collapse: collapse; width: 100%;">
         <thead><tr><th align="left">${t.product}</th><th align="right">${t.quantity}</th><th align="right">${t.reorderLevel}</th></tr></thead>
         <tbody>${rows}</tbody>
       </table>`,
    );
  }
}
