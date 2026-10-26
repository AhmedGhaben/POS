import { countryConfig } from "../countries";
import { formatMoney } from "../common/utils/currency";
import type { MailTexts } from "../common/mail/mail-texts";

/**
 * A sale's fiscal document (Factura-Recibo...) as an email: the same
 * content as the printed A4 (apps/web/src/features/fiscal/components/
 * FiscalA4.tsx), as plain HTML a mail client shows. The legal wording (the
 * document's title, "Processado por programa…") stays in Portuguese, as on
 * paper; the rest is in the store's document language.
 */

type Amount = { toString(): string } | string | number;

export interface EmailedDocument {
  documentType: string;
  documentNo: string;
  status: string;
  invoiceDate: Date | string;
  hashExcerpt: string;
  seller: unknown;
  buyerName: string;
  buyerTaxId: string;
  currency: string;
  netTotal: Amount;
  taxPayable: Amount;
  grossTotal: Amount;
  discountTotal: Amount;
  payments: unknown;
  lines: {
    productCode: string;
    productDescription: string;
    quantity: Amount;
    unit: string;
    unitPrice: Amount;
    netAmount: Amount;
    taxes: { percentage: Amount; exemptionCode: string | null }[];
  }[];
}

interface Seller {
  name?: string;
  legalName?: string | null;
  taxId?: string | null;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  country?: string;
  invoiceFooter?: string | null;
}

/** The line under the totals, as printed (apps/web/src/features/fiscal/fiscal-text.ts). */
export function certificationLine(hashExcerpt: string, certificate: string | null | undefined): string {
  const text = certificate ? `Processado por programa validado nº ${certificate}` : "Processado por programa não validado";
  return hashExcerpt ? `${hashExcerpt}-${text}` : text;
}

/** Payment mechanism names (SAF-T PaymentMechanism), as printed. */
const MECHANISM_NAMES: Record<string, string> = {
  NU: "Numerário",
  CD: "Cartão de débito / Multicaixa",
  CC: "Cartão de crédito",
  MB: "Referência Multicaixa",
  TB: "Transferência bancária",
  CH: "Cheque",
  OU: "Outros",
};

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function documentTitle(type: string, country: string | null | undefined): string {
  return countryConfig(country ?? "AO")?.documentTypes[type] ?? type;
}

export interface FiscalEmailOptions {
  texts: MailTexts["document"];
  /** The locale for numbers and dates ("pt-AO"...). */
  locale: string;
  /** The AGT certificate of the software, or null before certification. */
  certificate: string | null;
  /** Cash handed over and change, when there was change (as on the paper receipt). */
  tendered?: Amount | null;
  change?: Amount | null;
  storeName: string;
}

/** The document as a complete HTML page (the email body, and the attachment). */
export function fiscalDocumentHtml(doc: EmailedDocument, o: FiscalEmailOptions): string {
  const t = o.texts;
  const seller = (doc.seller ?? {}) as Seller;
  const money = (v: Amount) => escapeHtml(formatMoney(String(v), doc.currency, o.locale));
  const qty = (v: Amount, unit: string) => escapeHtml(`${new Intl.NumberFormat(o.locale, { maximumFractionDigits: 3 }).format(Number(String(v)))}${unit && unit !== "un" ? ` ${unit}` : ""}`);
  const date = escapeHtml(new Intl.DateTimeFormat(o.locale, { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(doc.invoiceDate)));
  const title = escapeHtml(documentTitle(doc.documentType, seller.country));
  const payments = Array.isArray(doc.payments) ? (doc.payments as { mechanism?: string; amount?: Amount }[]) : [];
  const change = o.change != null && Number(String(o.change)) > 0 ? o.change : null;

  const sellerLines = [
    seller.legalName || seller.name,
    seller.taxId ? `NIF: ${seller.taxId}` : null,
    [seller.address, seller.city].filter(Boolean).join(", ") || null,
    [seller.phone, seller.email].filter(Boolean).join(" · ") || null,
  ]
    .filter((l): l is string => !!l)
    .map(escapeHtml)
    .join("<br/>");

  const rows = doc.lines
    .map((l) => {
      const tax = l.taxes[0];
      const iva = tax ? (Number(String(tax.percentage)) > 0 ? `${Number(String(tax.percentage))}%` : (tax.exemptionCode ?? "0%")) : "—";
      return `<tr>
        <td style="padding:4px;border-bottom:1px solid #eee">${escapeHtml(l.productCode)}</td>
        <td style="padding:4px;border-bottom:1px solid #eee">${escapeHtml(l.productDescription)}</td>
        <td style="padding:4px;border-bottom:1px solid #eee" align="right">${qty(l.quantity, l.unit)}</td>
        <td style="padding:4px;border-bottom:1px solid #eee" align="right">${money(l.unitPrice)}</td>
        <td style="padding:4px;border-bottom:1px solid #eee" align="right">${escapeHtml(iva)}</td>
        <td style="padding:4px;border-bottom:1px solid #eee" align="right">${money(l.netAmount)}</td>
      </tr>`;
    })
    .join("");

  const totalRow = (label: string, value: string, bold = false) =>
    `<tr><td style="padding:2px 4px">${bold ? `<b>${label}</b>` : label}</td><td style="padding:2px 4px" align="right">${bold ? `<b>${value}</b>` : value}</td></tr>`;

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${title} ${escapeHtml(doc.documentNo)}</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;max-width:720px;margin:0 auto;padding:16px">
  <table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td valign="top">${sellerLines}</td>
    <td valign="top" align="right"><div style="font-size:18px;font-weight:bold">${title}</div><div>${escapeHtml(doc.documentNo)}</div><div>${t.date}: ${date}</div>${o.certificate ? "" : '<div style="color:#b91c1c;font-weight:bold">DOCUMENTO SEM VALIDADE FISCAL</div>'}${doc.status === "A" ? '<div style="color:#b91c1c;font-weight:bold">ANULADO</div>' : ""}</td>
  </tr></table>
  <p style="margin:16px 0 8px">${t.customer}: ${escapeHtml(doc.buyerName)}<br/>${t.taxId}: ${escapeHtml(doc.buyerTaxId)}</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    <thead><tr style="background:#f3f4f6">
      <th align="left" style="padding:4px">${t.code}</th><th align="left" style="padding:4px">${t.description}</th><th align="right" style="padding:4px">${t.qty}</th>
      <th align="right" style="padding:4px">${t.unitPrice}</th><th align="right" style="padding:4px">${t.iva}</th><th align="right" style="padding:4px">${t.amount}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <table cellpadding="0" cellspacing="0" style="margin:12px 0 0 auto">
    ${Number(String(doc.discountTotal)) > 0 ? totalRow(t.discount, money(doc.discountTotal)) : ""}
    ${totalRow(t.net, money(doc.netTotal))}
    ${totalRow(t.taxTotal, money(doc.taxPayable))}
    ${totalRow(t.gross, money(doc.grossTotal), true)}
  </table>
  ${
    payments.length
      ? `<p style="margin:12px 0 0">${t.payments}: ${payments.map((p) => `${escapeHtml(MECHANISM_NAMES[p.mechanism ?? ""] ?? p.mechanism ?? "")} ${money(p.amount ?? 0)}`).join(" · ")}${
          change ? `<br/>${t.tendered}: ${money(o.tendered ?? 0)}<br/>${t.change}: ${money(change)}` : ""
        }</p>`
      : ""
  }
  <p style="margin:16px 0 0;font-size:12px">${escapeHtml(certificationLine(doc.hashExcerpt, o.certificate))}</p>
  ${seller.invoiceFooter ? `<p style="font-size:12px;color:#555">${escapeHtml(seller.invoiceFooter)}</p>` : ""}
  <p style="margin-top:16px">${t.thanks}<br/>${escapeHtml(o.storeName)}</p>
</body></html>`;
}
