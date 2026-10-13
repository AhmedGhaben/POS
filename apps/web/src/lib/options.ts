import type { ComboboxOption } from "@/components/ui/combobox";

/** Products by name, with the SKU beside it; the SKU and barcode also find them. */
export function productOptions(
  products: { id: string; name: string; sku: string; barcode?: string | null }[] | undefined,
): ComboboxOption[] {
  return (products ?? []).map((p) => ({
    value: p.id,
    label: p.name,
    description: p.sku,
    keywords: p.barcode ? [p.barcode] : undefined,
  }));
}

export function storeOptions(stores: { id: string; name: string }[] | undefined): ComboboxOption[] {
  return (stores ?? []).map((s) => ({ value: s.id, label: s.name }));
}
