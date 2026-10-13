import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { roundQuantity, unitDecimals, type ProductDto } from "@pos/shared";
import { Input } from "@/components/ui/input";
import { posFetchProducts } from "@/features/pos/catalog";
import { findByBarcode } from "@/features/pos/api";
import { splitQuantityPrefix } from "@/features/pos/quantity";
import { useTranslation } from "react-i18next";
import { useMoney } from "@/features/business/use-money";

interface ProductSearchInputProps {
  /** quantity: from the "3*" shortcut, else 1. */
  onSelect: (product: ProductDto, quantity: number) => void;
  /** Blur targets inside this element (e.g. the customer/payment sidebar)
   * are left alone instead of refocusing the scanner input, so the cashier
   * can type into those controls without focus being stolen back. */
  suppressRefocusRef?: React.RefObject<HTMLElement>;
}

/**
 * Single always-(re)focused field for both barcode-scanner input (keyboard
 * wedge scanners type digits + Enter) and manual name/SKU search. On Enter,
 * an exact barcode match resolves immediately; otherwise falls back to
 * fuzzy search results the cashier can click.
 */
export function ProductSearchInput({ onSelect, suppressRefocusRef }: ProductSearchInputProps) {
  const { t } = useTranslation("pos");
  const money = useMoney();
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  // "3*" before a barcode or name adds that many (features/pos/quantity.ts);
  // "0,5*" half a kilo of something sold by weight.
  const { quantity, query: search } = splitQuantityPrefix(query, 3);

  const searchQuery = useQuery({
    queryKey: ["pos-search", search],
    queryFn: () => posFetchProducts(search),
    enabled: search.trim().length > 0,
  });

  const refocus = React.useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  React.useEffect(() => {
    refocus();
  }, [refocus]);

  async function handleSelect(product: ProductDto) {
    // Whole numbers for things sold by the unit.
    onSelect(product, Math.max(roundQuantity(quantity, product.unit), unitDecimals(product.unit) > 0 ? 0.001 : 1));
    setQuery("");
    refocus();
  }

  async function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || !search.trim()) return;
    e.preventDefault();

    const exactBarcodeMatch = await findByBarcode(search.trim());
    if (exactBarcodeMatch) {
      await handleSelect(exactBarcodeMatch);
      return;
    }

    const results = await posFetchProducts(search.trim());
    if (results.length === 1) {
      await handleSelect(results[0]);
    }
    // Multiple/zero results: leave the dropdown open for the cashier to pick.
  }

  const results = searchQuery.data ?? [];

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        autoFocus
        placeholder={t("search.placeholder")}
        className="h-14 text-lg"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={(e) => {
          const target = e.relatedTarget as HTMLElement | null;
          if (suppressRefocusRef?.current?.contains(target)) return;
          // Fields that take typing elsewhere on the till (e.g. a cart line's quantity).
          if (target?.closest("[data-keep-focus]")) return;
          refocus();
        }}
      />
      {search.trim().length > 0 && results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
          {results.map((product) => (
            <button
              key={product.id}
              type="button"
              className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-accent"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(product)}
            >
              <span>{product.name}</span>
              <span className="text-muted-foreground">{money(product.sellPrice)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
