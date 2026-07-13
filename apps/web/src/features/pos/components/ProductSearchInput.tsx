import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import type { ProductDto } from "@pos/shared";
import { Input } from "@/components/ui/input";
import { fetchProducts } from "@/features/products/api";
import { findByBarcode } from "@/features/pos/api";

interface ProductSearchInputProps {
  onSelect: (product: ProductDto) => void;
}

/**
 * Single always-(re)focused field for both barcode-scanner input (keyboard
 * wedge scanners type digits + Enter) and manual name/SKU search. On Enter,
 * an exact barcode match resolves immediately; otherwise falls back to
 * fuzzy search results the cashier can click.
 */
export function ProductSearchInput({ onSelect }: ProductSearchInputProps) {
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const searchQuery = useQuery({
    queryKey: ["pos-search", query],
    queryFn: () => fetchProducts(query),
    enabled: query.trim().length > 0,
  });

  const refocus = React.useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  React.useEffect(() => {
    refocus();
  }, [refocus]);

  async function handleSelect(product: ProductDto) {
    onSelect(product);
    setQuery("");
    refocus();
  }

  async function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || !query.trim()) return;
    e.preventDefault();

    const exactBarcodeMatch = await findByBarcode(query.trim());
    if (exactBarcodeMatch) {
      await handleSelect(exactBarcodeMatch);
      return;
    }

    const results = await fetchProducts(query.trim());
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
        placeholder="Scan barcode or search by name / SKU..."
        className="h-14 text-lg"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={refocus}
      />
      {query.trim().length > 0 && results.length > 0 && (
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
              <span className="text-muted-foreground">${Number(product.sellPrice).toFixed(2)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
