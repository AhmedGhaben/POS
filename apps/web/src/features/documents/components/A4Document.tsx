import * as React from "react";
import type { BusinessDto, StoreDto } from "@pos/shared";
import { useAuthStore } from "@/features/auth/store";
import { logoSrc } from "@/features/business/api";
import { documentTotals, type DocumentLine } from "@/features/documents/lines";
import { useDocumentLanguage } from "@/i18n/use-document-language";

/** Seller block. Invoices pass a snapshot taken at issue time; quotes use the live settings. */
export type SellerDetails = Pick<
  BusinessDto,
  | "name"
  | "legalName"
  | "taxId"
  | "registrationNumber"
  | "address"
  | "phone"
  | "email"
  | "website"
  | "currency"
  | "logoUrl"
  | "invoiceFooter"
>;

export interface BillTo {
  name: string;
  address?: string | null;
  taxId?: string | null;
  email?: string | null;
}

interface A4DocumentProps {
  title: string;
  /** Right-hand header rows, e.g. [["Quote ref", "Q-…"], ["Date", "8 Oct 2026"]]. */
  meta: [label: string, value: string][];
  /** Only address/phone are used, as fallbacks when the business has none. */
  store: Pick<StoreDto, "address" | "phone"> | undefined;
  lines: DocumentLine[];
  seller?: SellerDetails;
  billTo?: BillTo | null;
  /** Shown under the totals, e.g. payment details or a disclaimer. */
  notes?: React.ReactNode;
}

/**
 * A4 quotation/invoice. Sized in mm with 15 mm padding for the on-screen
 * preview; in print the padding moves to the @page margin (globals.css).
 */
export function A4Document({ title, meta, store, lines, seller, billTo, notes }: A4DocumentProps) {
  const liveBusiness = useAuthStore((s) => s.business);
  const from = seller ?? liveBusiness;
  const { t, money } = useDocumentLanguage(from?.currency);
  if (!from) return null;

  const totals = documentTotals(lines);
  const logo = logoSrc(from);
  const contact = [from.phone ?? store?.phone, from.email, from.website].filter(Boolean).join(" · ");

  return (
    <div className="a4-doc w-[210mm] min-h-[297mm] bg-white p-[15mm] font-sans text-[10pt] leading-snug text-black">
      <header className="flex items-start justify-between gap-8">
        <div className="space-y-0.5">
          {logo && <img src={logo} alt="" className="mb-3 max-h-[22mm] max-w-[60mm] object-contain" />}
          <p className="text-[13pt] font-semibold">{from.legalName || from.name}</p>
          {from.legalName && from.legalName !== from.name && <p>{from.name}</p>}
          {(from.address ?? store?.address) && (
            <p className="whitespace-pre-line">{from.address ?? store?.address}</p>
          )}
          {contact && <p>{contact}</p>}
          {from.taxId && <p>{t("taxId", { id: from.taxId })}</p>}
          {from.registrationNumber && <p>{t("a4.regNo", { number: from.registrationNumber })}</p>}
        </div>
        <div className="text-right">
          <p className="mb-3 text-[20pt] font-bold tracking-wide">{title}</p>
          <table className="ml-auto">
            <tbody>
              {meta.map(([label, value]) => (
                <tr key={label}>
                  <td className="pr-3 text-neutral-600">{label}</td>
                  <td className="font-medium">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </header>

      {billTo && (
        <section className="mt-[10mm] w-[85mm] space-y-0.5 border-l-2 border-neutral-300 pl-3">
          <p className="text-[8pt] font-semibold uppercase tracking-wider text-neutral-600">{t("a4.billTo")}</p>
          <p className="font-semibold">{billTo.name}</p>
          {billTo.address && <p className="whitespace-pre-line">{billTo.address}</p>}
          {billTo.taxId && <p>{t("taxId", { id: billTo.taxId })}</p>}
          {billTo.email && <p>{billTo.email}</p>}
        </section>
      )}

      <table className="mt-[10mm] w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-black text-left text-[9pt]">
            <th className="py-1.5 pr-2 font-semibold">{t("a4.item")}</th>
            <th className="py-1.5 pr-2 text-right font-semibold">{t("a4.qty")}</th>
            <th className="py-1.5 pr-2 text-right font-semibold">{t("a4.unitPrice")}</th>
            <th className="py-1.5 pr-2 text-right font-semibold">{t("totals.tax")}</th>
            <th className="py-1.5 text-right font-semibold">{t("a4.amount")}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.key} className="border-b border-neutral-300 align-top">
              <td className="py-1.5 pr-2">
                {line.name}
                {line.sku && <span className="block text-[8pt] text-neutral-600">{line.sku}</span>}
              </td>
              <td className="py-1.5 pr-2 text-right">{line.quantity}</td>
              <td className="py-1.5 pr-2 text-right">{money(line.unitPrice)}</td>
              <td className="py-1.5 pr-2 text-right">{line.taxRate}%</td>
              <td className="py-1.5 text-right">{money(line.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="ml-auto mt-4 w-[80mm] break-inside-avoid">
        <table className="w-full">
          <tbody>
            <tr>
              <td className="py-0.5">{t("a4.subtotalExcl")}</td>
              <td className="py-0.5 text-right">{money(totals.net)}</td>
            </tr>
            {totals.byRate.map((row) => (
              <tr key={row.rate}>
                <td className="py-0.5 text-neutral-700">
                  {t("a4.taxOn", { rate: row.rate, amount: money(row.net) })}
                </td>
                <td className="py-0.5 text-right">{money(row.tax)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-black text-[12pt] font-bold">
              <td className="pt-1.5">{t("totals.total")}</td>
              <td className="pt-1.5 text-right">{money(totals.gross)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {notes && <section className="mt-[10mm] break-inside-avoid">{notes}</section>}

      {from.invoiceFooter && (
        <footer className="mt-[10mm] whitespace-pre-line border-t border-neutral-300 pt-3 text-[8.5pt] text-neutral-700">
          {from.invoiceFooter}
        </footer>
      )}
    </div>
  );
}
