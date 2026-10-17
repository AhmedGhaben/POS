import { amountInWords, countryConfig, type FiscalDocumentDto } from "@pos/shared";
import { logoSrc } from "@/features/business/api";
import { useDocumentLanguage } from "@/i18n/use-document-language";
import { AgtQr } from "./AgtQr";
import { ANNULLED_STAMP, certificationLine, documentQrValue, documentTitle, MECHANISM_NAMES, NOT_VALID_WATERMARK } from "../fiscal-text";

/**
 * A fiscal document on A4 (Factura-Recibo, Nota de Crédito, Factura
 * Pró-forma...), drawn only from what was frozen on it when issued, so a
 * reprint reads the same years later. Amounts are without tax per line;
 * taxes are summed per rate, exempt lines show their legal reason.
 */
export function FiscalA4({ doc, copyLabel }: { doc: FiscalDocumentDto; /** Original, Duplicado... or "2ª Via"; default Original. */ copyLabel?: string }) {
  const { t, money, qty, date, dateTime } = useDocumentLanguage(doc.currency, doc.storeId);
  const s = doc.seller;
  const config = countryConfig(s.country);
  const logo = logoSrc(s);
  const qr = documentQrValue(s.country, s.taxId, doc.documentNo);
  const regime = config?.ivaRegimes.find((r) => r.code === s.ivaRegime)?.name;

  const byRate = new Map<string, { rate: string; code: string; base: number; tax: number }>();
  const exemptions = new Map<string, string>();
  for (const line of doc.lines) {
    for (const tax of line.taxes) {
      const key = `${tax.taxCode}-${tax.percentage}`;
      const row = byRate.get(key) ?? { rate: tax.percentage, code: tax.taxCode, base: 0, tax: 0 };
      row.base += Number(line.netAmount);
      row.tax += Number(tax.amount);
      byRate.set(key, row);
      if (tax.exemptionCode) exemptions.set(tax.exemptionCode, tax.exemptionReason ?? "");
    }
  }
  const anyDiscount = doc.lines.some((l) => Number(l.discountAmount) > 0);
  // A receipt (RC) lists the invoices it settled instead of products.
  const receipt = doc.documentType === "RC";
  const address = [s.address, [s.postalCode, s.city].filter(Boolean).join(" "), s.province ? config?.provinces.find((p) => p.code === s.province)?.name : null]
    .filter(Boolean)
    .join(", ");
  const buyerAddress = doc.buyerAddress
    ? [doc.buyerAddress.address, [doc.buyerAddress.postalCode, doc.buyerAddress.city].filter(Boolean).join(" "), doc.buyerAddress.province ? config?.provinces.find((p) => p.code === doc.buyerAddress!.province)?.name : null]
        .filter(Boolean)
        .join(", ")
    : "";

  return (
    <div className="a4-doc relative w-[210mm] min-h-[297mm] overflow-hidden bg-white p-[15mm] font-sans text-[9.5pt] leading-snug text-black">
      {!s.certificate && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
          <span className="-rotate-[30deg] whitespace-nowrap text-[34pt] font-bold tracking-widest text-neutral-300">{NOT_VALID_WATERMARK}</span>
        </div>
      )}
      <header className="relative flex items-start justify-between gap-8">
        <div className="space-y-0.5">
          {logo && <img src={logo} alt="" className="mb-3 max-h-[22mm] max-w-[60mm] object-contain" />}
          <p className="text-[12pt] font-semibold">{s.legalName || s.name}</p>
          {s.legalName && s.legalName !== s.name && <p>{s.name}</p>}
          {address && <p>{address}</p>}
          {[s.phone, s.email, s.website].filter(Boolean).length > 0 && <p>{[s.phone, s.email, s.website].filter(Boolean).join(" · ")}</p>}
          {s.taxId && <p className="font-medium">NIF: {s.taxId}</p>}
          {s.registrationNumber && <p>{t("fiscal.registration", { number: s.registrationNumber })}</p>}
          {regime && <p>{regime}</p>}
          <p className="text-neutral-600">{t("fiscal.store", { name: s.store.name })}</p>
        </div>
        <div className="text-right">
          <p className="text-[16pt] font-bold">{documentTitle(doc.documentType, s.country)}</p>
          <p className="text-[12pt] font-semibold">{doc.documentNo}</p>
          <p className="mt-1 font-medium text-neutral-700">{copyLabel ?? t("fiscal.original")}</p>
          <table className="ml-auto mt-2">
            <tbody>
              <tr>
                <td className="pr-3 text-neutral-600">{t("fiscal.issueDate")}</td>
                <td className="font-medium">{date(doc.invoiceDate.slice(0, 10))}</td>
              </tr>
              <tr>
                <td className="pr-3 text-neutral-600">{t("fiscal.recordedAt")}</td>
                <td className="font-medium">{dateTime(doc.systemEntryDate)}</td>
              </tr>
            </tbody>
          </table>
          {doc.status === "A" && (
            <div className="mt-2 inline-block border-2 border-black px-2 py-0.5 text-left">
              <p className="font-bold tracking-widest">{ANNULLED_STAMP}</p>
              {doc.statusReason && <p className="text-[8pt]">{doc.statusReason}</p>}
            </div>
          )}
        </div>
      </header>

      <section className="relative mt-[8mm] flex justify-between gap-6">
        <div className="w-[95mm] space-y-0.5 border-l-2 border-neutral-400 pl-3">
          <p className="text-[8pt] font-semibold uppercase tracking-wider text-neutral-600">{t("fiscal.customer")}</p>
          <p className="font-semibold">{doc.buyerName}</p>
          <p>NIF: {doc.buyerTaxId}</p>
          {buyerAddress && <p>{buyerAddress}</p>}
        </div>
        {(doc.referencedDocument || doc.reason) && (
          <div className="space-y-0.5 text-right">
            {doc.referencedDocument && (
              <p>
                {t("fiscal.reference")}: <span className="font-medium">{doc.referencedDocument.documentNo}</span>
              </p>
            )}
            {doc.reason && (
              <p>
                {t("fiscal.reason")}: {doc.reason}
              </p>
            )}
          </div>
        )}
      </section>

      {receipt && (
        <table className="relative mt-[8mm] w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-black text-left text-[8.5pt]">
              <th className="py-1.5 pr-2 font-semibold">{t("fiscal.settledDocument")}</th>
              <th className="py-1.5 pr-2 font-semibold">{t("fiscal.issueDate")}</th>
              <th className="py-1.5 pr-2 text-right font-semibold">{t("fiscal.documentTotal")}</th>
              <th className="py-1.5 text-right font-semibold">{t("fiscal.amountSettled")}</th>
            </tr>
          </thead>
          <tbody>
            {(doc.settled ?? []).map((a) => (
              <tr key={a.documentNo} className="border-b border-neutral-300">
                <td className="py-1 pr-2">{a.documentNo}</td>
                <td className="py-1 pr-2">{date(a.invoiceDate.slice(0, 10))}</td>
                <td className="py-1 pr-2 text-right">{money(a.grossTotal)}</td>
                <td className="py-1 text-right">{money(a.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!receipt && (
      <table className="relative mt-[8mm] w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-black text-left text-[8.5pt]">
            <th className="py-1.5 pr-2 font-semibold">{t("fiscal.code")}</th>
            <th className="py-1.5 pr-2 font-semibold">{t("fiscal.description")}</th>
            <th className="py-1.5 pr-2 text-right font-semibold">{t("fiscal.quantity")}</th>
            <th className="py-1.5 pr-2 text-right font-semibold">{t("fiscal.unitPrice")}</th>
            {anyDiscount && <th className="py-1.5 pr-2 text-right font-semibold">{t("fiscal.discount")}</th>}
            <th className="py-1.5 pr-2 text-right font-semibold">{t("fiscal.taxRate")}</th>
            <th className="py-1.5 text-right font-semibold">{t("fiscal.amount")}</th>
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((line) => {
            const tax = line.taxes[0];
            return (
              <tr key={line.id} className="border-b border-neutral-300 align-top">
                <td className="py-1 pr-2 text-neutral-700">{line.productCode}</td>
                <td className="py-1 pr-2">
                  {line.productDescription}
                  {line.referenceDocumentNo && (
                    <span className="block text-[8pt] text-neutral-600">
                      {t("fiscal.lineReference", { document: line.referenceDocumentNo, line: line.referenceLineNumber ?? "-" })}
                    </span>
                  )}
                </td>
                <td className="py-1 pr-2 text-right">{qty(line.quantity, line.unit)}</td>
                <td className="py-1 pr-2 text-right">{money(line.unitPrice)}</td>
                {anyDiscount && <td className="py-1 pr-2 text-right">{Number(line.discountAmount) > 0 ? `-${money(line.discountAmount)}` : ""}</td>}
                <td className="py-1 pr-2 text-right">
                  {Number(tax?.percentage ?? 0)}%{tax?.exemptionCode ? ` (${tax.exemptionCode})` : ""}
                </td>
                <td className="py-1 text-right">{money(line.netAmount)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      )}

      <section className="relative mt-4 flex items-start justify-between gap-6 break-inside-avoid">
        <div className="w-[95mm] space-y-2">
          {!receipt && (
          <table className="w-full text-[8.5pt]">
            <thead>
              <tr className="border-b border-black text-left">
                <th className="py-0.5 font-semibold">{t("fiscal.taxSummary")}</th>
                <th className="py-0.5 text-right font-semibold">{t("fiscal.taxBase")}</th>
                <th className="py-0.5 text-right font-semibold">{t("fiscal.taxAmount")}</th>
              </tr>
            </thead>
            <tbody>
              {[...byRate.values()].map((r) => (
                <tr key={`${r.code}-${r.rate}`}>
                  <td className="py-0.5">
                    IVA {Number(r.rate)}% ({r.code})
                  </td>
                  <td className="py-0.5 text-right">{money(r.base)}</td>
                  <td className="py-0.5 text-right">{money(r.tax)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
          {exemptions.size > 0 && (
            <div className="text-[8pt]">
              <p className="font-semibold">{t("fiscal.exemptions")}</p>
              {[...exemptions].map(([code, reason]) => (
                <p key={code}>
                  {code}: {reason}
                </p>
              ))}
            </div>
          )}
          {doc.payments && doc.payments.length > 0 && (
            <div className="text-[8.5pt]">
              <p className="font-semibold">{t("fiscal.payments")}</p>
              {doc.payments.map((p, i) => (
                <p key={i}>
                  {MECHANISM_NAMES[p.mechanism] ?? p.mechanism}: {money(p.amount)}
                </p>
              ))}
              {doc.paymentReference && <p>{t("fiscal.paymentReference", { reference: doc.paymentReference })}</p>}
            </div>
          )}
        </div>
        <table className="w-[75mm]">
          <tbody>
            {!receipt && (
            <>
            <tr>
              <td className="py-0.5">{t("fiscal.netTotal")}</td>
              <td className="py-0.5 text-right">{money(doc.netTotal)}</td>
            </tr>
            {Number(doc.discountTotal) > 0 && (
              <tr>
                <td className="py-0.5">{t("fiscal.discounts")}</td>
                <td className="py-0.5 text-right">{money(doc.discountTotal)}</td>
              </tr>
            )}
            <tr>
              <td className="py-0.5">{t("fiscal.taxTotal")}</td>
              <td className="py-0.5 text-right">{money(doc.taxPayable)}</td>
            </tr>
            </>
            )}
            <tr className="border-t-2 border-black text-[11pt] font-bold">
              <td className="pt-1.5">{receipt ? t("fiscal.received") : t("fiscal.total")}</td>
              <td className="pt-1.5 text-right">{money(doc.grossTotal)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {config && <p className="relative mt-3 text-[8.5pt] italic">{t("fiscal.inWords", { words: amountInWords(doc.grossTotal, config.currencyWords) })}</p>}

      <footer className="relative mt-[10mm] flex items-end justify-between gap-6 break-inside-avoid">
        <div className="space-y-1 text-[8pt]">
          <p className="font-medium">{certificationLine(doc.hashExcerpt, s.certificate)}</p>
          {s.invoiceFooter && <p className="whitespace-pre-line">{s.invoiceFooter}</p>}
        </div>
        {qr && <AgtQr value={qr} size={110} className="shrink-0" />}
      </footer>
    </div>
  );
}
