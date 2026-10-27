import type { FiscalBankDetailsDto } from "@pos/shared";
import { formatIban } from "@/features/business/api";
import { useDocumentLanguage } from "@/i18n/use-document-language";

/**
 * "Coordenadas bancárias" on an A4 quote, proforma or invoice, so the
 * customer can pay by transfer. Labels come from the document's language.
 */
export function BankDetails({ accounts, storeId }: { accounts: FiscalBankDetailsDto[] | undefined; storeId?: string }) {
  const { t } = useDocumentLanguage(undefined, storeId);
  if (!accounts?.length) return null;
  return (
    <div className="break-inside-avoid text-[8.5pt]">
      <p className="font-semibold">{t("bank.heading")}</p>
      {accounts.map((a) => (
        <p key={a.iban}>
          {t("bank.bank")}: {a.bankName} · {t("bank.holder")}: {a.accountHolder} · IBAN: <span className="whitespace-nowrap font-medium">{formatIban(a.iban)}</span>
        </p>
      ))}
    </div>
  );
}
