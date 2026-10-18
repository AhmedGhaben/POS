import { useQuery } from "@tanstack/react-query";
import type { PurchaseDetailDto } from "@pos/shared";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AttachmentsPanel } from "@/features/accounting/components/AttachmentsPanel";
import { PrintArea } from "@/components/print/PrintArea";
import { PrintButton } from "@/components/print/PrintButton";
import { useAuthStore } from "@/features/auth/store";
import { logoSrc } from "@/features/business/api";
import { useMoney } from "@/features/business/use-money";
import { printDocument } from "@/features/desktop/printing";
import { A4Preview } from "@/features/invoices/components/A4Preview";
import { formatCalendarDate, formatDateTime } from "@/lib/format";
import { fetchPurchase } from "../api";

/** A purchase on A4: for the supplier file and the accountant (not a fiscal document). */
function PurchaseA4({ p }: { p: PurchaseDetailDto }) {
  const { t } = useTranslation(["stock", "common"]);
  const money = useMoney();
  const business = useAuthStore((s) => s.business);
  const logo = logoSrc(business);
  const net = Number(p.subtotal);
  return (
    <div className="a4-doc relative w-[210mm] min-h-[297mm] bg-white p-[15mm] font-sans text-[9.5pt] leading-snug text-black">
      <header className="flex items-start justify-between gap-8">
        <div className="space-y-0.5">
          {logo && <img src={logo} alt="" className="mb-3 max-h-[22mm] max-w-[60mm] object-contain" />}
          <p className="text-[12pt] font-semibold">{business?.legalName || business?.name}</p>
          {business?.taxId && <p>NIF: {business.taxId}</p>}
          <p className="text-neutral-600">{p.store.name}</p>
        </div>
        <div className="text-right">
          <p className="text-[16pt] font-bold">{t("purchases.a4Title")}</p>
          <p className="text-[12pt] font-semibold">{p.purchaseNumber}</p>
          <p>{formatDateTime(p.createdAt)}</p>
        </div>
      </header>
      <section className="mt-[8mm] flex justify-between gap-6">
        <div className="w-[95mm] space-y-0.5 border-l-2 border-neutral-400 pl-3">
          <p className="text-[8pt] font-semibold uppercase tracking-wider text-neutral-600">{t("purchases.supplier")}</p>
          <p className="font-semibold">{p.supplier.name}</p>
          {p.supplier.taxId && <p>NIF: {p.supplier.taxId}</p>}
          {p.supplier.address && <p>{[p.supplier.address, p.supplier.city].filter(Boolean).join(", ")}</p>}
        </div>
        {p.supplierDocNo && (
          <div className="space-y-0.5 text-right">
            <p className="text-[8pt] font-semibold uppercase tracking-wider text-neutral-600">{t("purchases.supplierDocument")}</p>
            <p className="font-medium">{p.supplierDocNo}</p>
            {p.supplierDocDate && <p>{formatCalendarDate(p.supplierDocDate.slice(0, 10))}</p>}
            {p.supplierDocHash && p.supplierDocHash !== "0" && <p>Hash: {p.supplierDocHash}</p>}
          </div>
        )}
      </section>
      <table className="mt-[8mm] w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-black text-left text-[8.5pt]">
            <th className="py-1.5 pr-2 font-semibold">{t("columns.product")}</th>
            <th className="py-1.5 pr-2 text-right font-semibold">{t("qty")}</th>
            <th className="py-1.5 pr-2 text-right font-semibold">{t("purchases.unitCost")}</th>
            <th className="py-1.5 text-right font-semibold">{t("columns.total")}</th>
          </tr>
        </thead>
        <tbody>
          {p.lineItems.map((l) => (
            <tr key={l.id} className="border-b border-neutral-300">
              <td className="py-1 pr-2">
                {l.product.name} <span className="text-neutral-600">{l.product.sku}</span>
              </td>
              <td className="py-1 pr-2 text-right">{l.quantity}</td>
              <td className="py-1 pr-2 text-right">{money(l.unitCost)}</td>
              <td className="py-1 text-right">{money(l.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="ml-auto mt-4 w-[80mm]">
        <tbody>
          <tr>
            <td className="py-0.5">{t("purchases.net")}</td>
            <td className="py-0.5 text-right">{money(net)}</td>
          </tr>
          {(p.taxLines ?? []).map((l) => (
            <tr key={l.id}>
              <td className="py-0.5">
                IVA {Number(l.taxRate)}% · {t("purchases.deductibleShort", { percent: Number(l.deductiblePercent) })} · {l.typology}
              </td>
              <td className="py-0.5 text-right">{money(l.taxAmount)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-black font-bold">
            <td className="pt-1">{t("columns.total")}</td>
            <td className="pt-1 text-right">{money(p.total)}</td>
          </tr>
          {Number(p.withholdingAmount ?? 0) > 0 && (
            <>
              <tr>
                <td className="py-0.5">{t("purchases.withheld")} ({Number(p.withholdingPercent)}%)</td>
                <td className="py-0.5 text-right">-{money(p.withholdingAmount!)}</td>
              </tr>
              <tr className="font-semibold">
                <td className="py-0.5">{t("purchases.toPay")}</td>
                <td className="py-0.5 text-right">{money(Number(p.total) - Number(p.withholdingAmount))}</td>
              </tr>
            </>
          )}
          <tr>
            <td className="py-0.5">{t("purchases.paidAmount")}</td>
            <td className="py-0.5 text-right">{money(p.paidAmount ?? 0)}</td>
          </tr>
        </tbody>
      </table>
      {p.allocations.length > 0 && (
        <div className="mt-4 text-[8.5pt]">
          <p className="font-semibold">{t("purchases.payments")}</p>
          {p.allocations.map((a) => (
            <p key={a.id}>
              {formatCalendarDate(a.payment.paidOn.slice(0, 10))} · {t(`common:paymentMethods.${a.payment.method}`)}
              {a.payment.reference ? ` · ${a.payment.reference}` : ""}: {money(a.amount)}
            </p>
          ))}
        </div>
      )}
      <p className="mt-[10mm] text-[8pt] text-neutral-600">
        {t("purchases.recordedBy", { name: `${p.createdBy.firstName} ${p.createdBy.lastName}` })}
      </p>
    </div>
  );
}

export function PurchaseDetailDialog({ purchaseId, onClose }: { purchaseId: string | null; onClose: () => void }) {
  const { t } = useTranslation(["stock", "common", "accounting"]);
  const query = useQuery({ queryKey: ["purchase", purchaseId], queryFn: () => fetchPurchase(purchaseId!), enabled: !!purchaseId });
  const p = query.data;
  return (
    <Dialog open={!!purchaseId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{p ? `${p.purchaseNumber} · ${p.supplier.name}` : t("purchases.a4Title")}</DialogTitle>
          <DialogDescription>{t("purchases.detailDescription")}</DialogDescription>
        </DialogHeader>
        {!p ? (
          <p className="text-sm text-muted-foreground">{t("common:actions.loading")}</p>
        ) : (
          <>
            <A4Preview>
              <PurchaseA4 p={p} />
            </A4Preview>
            <PrintButton onPrint={({ copies, deviceName }) => printDocument({ copies, deviceName })} />
            <div className="border-t pt-3">
              <p className="mb-2 text-sm font-medium">{t("accounting:attachments.supplierPapers")}</p>
              <AttachmentsPanel ownerType="PURCHASE" ownerId={p.id} />
            </div>
            <PrintArea format="a4">
              <PurchaseA4 p={p} />
            </PrintArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
