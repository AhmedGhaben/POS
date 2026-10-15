import { annulmentCode, countryConfig, findExemption, type CustomerDto, type SaleDto } from "@pos/shared";
import { useAuthStore } from "@/features/auth/store";
import { useDocumentLanguage } from "@/i18n/use-document-language";
import { AgtQr } from "./AgtQr";
import { saleDocument } from "../sale-document";
import { ANNULLED_STAMP, certificationLine, documentQrValue, documentTitle, NOT_VALID_WATERMARK } from "../fiscal-text";

/** Under the shop's header: the document's type and number, and who bought. */
export function ReceiptFiscalTop({ sale, customer: chosen }: { sale: SaleDto; customer?: CustomerDto | null }) {
  const doc = saleDocument(sale);
  // The sale's own buyer (reprints), or the one chosen at the till.
  const customer = sale.customer ?? chosen;
  const { t } = useDocumentLanguage();
  const country = useAuthStore((s) => s.business?.country);
  if (!doc) return null;
  const config = countryConfig(doc.seller?.country ?? country);
  const code = sale.voidReason ? annulmentCode(sale.voidReason) : null;
  // The legal wording, in Portuguese whatever the language (AGT documentCancelReason).
  const annulled = code ? config?.annulmentReasons[code] : null;
  const buyerName = customer && !customer.isFinalConsumer ? customer.name : "Consumidor Final";
  const buyerNif = customer && !customer.isFinalConsumer && customer.taxId ? customer.taxId : (config?.finalConsumerTaxId ?? "999999999");
  return (
    <div className="text-center">
      <p className="text-sm font-bold">{documentTitle(doc.documentType, doc.seller?.country ?? country)}</p>
      <p className="font-bold">{doc.documentNo}</p>
      {(doc.status === "A" || sale.status === "VOIDED") && (
        <>
          <p className="font-bold">*** {ANNULLED_STAMP} ***</p>
          {annulled && <p>{annulled}</p>}
        </>
      )}
      <p>{t("fiscal.receiptCustomer", { name: buyerName })}</p>
      <p>{t("fiscal.nif", { nif: buyerNif })}</p>
    </div>
  );
}

/** Under the totals: IVA per rate, exemption reasons, the hash line, the AGT QR code. */
export function ReceiptFiscalBottom({ sale }: { sale: SaleDto }) {
  const doc = saleDocument(sale);
  const { t, money } = useDocumentLanguage();
  const business = useAuthStore((s) => s.business);
  if (!doc) return null;
  const country = doc.seller?.country ?? business?.country;
  const config = countryConfig(country);
  const rates = new Map<number, { base: number; tax: number }>();
  const exemptions = new Set<string>();
  for (const line of sale.lineItems) {
    const total = Number(line.lineTotal);
    const tax = Number(line.taxAmount);
    const rate = line.taxRate != null ? Number(line.taxRate) : total - tax > 0 ? Math.round((tax / (total - tax)) * 10_000) / 100 : 0;
    const row = rates.get(rate) ?? { base: 0, tax: 0 };
    row.base += total - tax;
    row.tax += tax;
    rates.set(rate, row);
    if (line.exemptionCode) exemptions.add(line.exemptionCode);
  }
  const certificate = doc.seller?.certificate ?? null;
  const qr = documentQrValue(country, doc.seller?.taxId ?? business?.taxId, doc.documentNo);
  return (
    <div className="mt-2 space-y-1">
      {[...rates].map(([rate, r]) => (
        <div key={rate} className="flex justify-between">
          <span>{t("fiscal.receiptTax", { rate })}</span>
          <span>
            {money(r.base)} / {money(r.tax)}
          </span>
        </div>
      ))}
      {[...exemptions].map((code) => (
        <p key={code} className="text-[10px]">
          {code}: {(config && findExemption(config, code)?.legalText) || ""}
        </p>
      ))}
      <p className="text-center text-[10px]">{doc.hashExcerpt ? certificationLine(doc.hashExcerpt, certificate) : t("fiscal.pendingSignature")}</p>
      {!certificate && <p className="text-center font-bold">{NOT_VALID_WATERMARK}</p>}
      {qr && <AgtQr value={qr} size={140} className="mx-auto max-w-full" />}
    </div>
  );
}
