import type { StoreDto } from "@pos/shared";
import { useAuthStore } from "@/features/auth/store";
import { logoSrc } from "@/features/business/api";
import { useDocumentLanguage } from "@/i18n/use-document-language";

/** Top of an 80 mm slip (receipt or quote): logo, names, store contact, tax ID, custom header. */
export function SlipHeader({ store }: { store: StoreDto | undefined }) {
  const business = useAuthStore((s) => s.business);
  const { t } = useDocumentLanguage();
  const logo = logoSrc(business);
  const storeName = store?.name ?? t("store");
  // Show the business name too when the store has its own (e.g. "Main Street").
  const businessName = business && business.name !== storeName ? business.name : null;

  return (
    <>
      {logo && (
        // Grayscale: thermal printers are monochrome, and colour logos dither badly.
        <img src={logo} alt="" className="mx-auto mb-1 max-h-16 max-w-[200px] object-contain grayscale" />
      )}
      {businessName && <p className="text-center text-sm font-semibold">{businessName}</p>}
      <p className={businessName ? "text-center" : "text-center text-sm font-semibold"}>{storeName}</p>
      {store?.address && <p className="whitespace-pre-line text-center">{store.address}</p>}
      {store?.phone && <p className="text-center">{store.phone}</p>}
      {business?.taxId && <p className="text-center">{t("taxId", { id: business.taxId })}</p>}
      {business?.receiptHeader && <p className="mt-1 whitespace-pre-line text-center">{business.receiptHeader}</p>}
    </>
  );
}
