import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { EyeOff, LayoutGrid, List } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ProductDto } from "@pos/shared";
import { Button } from "@/components/ui/button";
import { posFetchProducts } from "@/features/pos/catalog";
import { productPhotoSrc } from "@/features/products/api";
import { useMoney } from "@/features/business/use-money";
import { cn } from "@/lib/utils";
import { isOutOfStock, type StockLevels } from "@/features/pos/stock-check";

interface ProductGridProps {
  categoryId: string | null;
  onSelect: (product: ProductDto) => void;
  /** The stock the till knows about, to hide what's run out (when this till asks). */
  stockLevels?: StockLevels | null;
}

type View = "grid" | "list";
const VIEW_KEY = "pos-product-view";

/** Grid or list, remembered on this device. */
function useProductView(): [View, (view: View) => void] {
  const [view, setView] = React.useState<View>(() => (localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid"));
  const change = React.useCallback((next: View) => {
    localStorage.setItem(VIEW_KEY, next);
    setView(next);
  }, []);
  return [view, change];
}

const HIDE_OUT_OF_STOCK_KEY = "pos-hide-out-of-stock";

/** Hide products that have run out (tester #32), remembered on this device. */
function useHideOutOfStock(): [boolean, (hide: boolean) => void] {
  const [hide, setHide] = React.useState(() => localStorage.getItem(HIDE_OUT_OF_STOCK_KEY) === "1");
  const change = React.useCallback((next: boolean) => {
    localStorage.setItem(HIDE_OUT_OF_STOCK_KEY, next ? "1" : "0");
    setHide(next);
  }, []);
  return [hide, change];
}

/** Browsable products of the selected category, as tiles or a list — click to add to the cart. */
export function ProductGrid({ categoryId, onSelect, stockLevels }: ProductGridProps) {
  const { t } = useTranslation("pos");
  const money = useMoney();
  const [view, setView] = useProductView();
  const [hideOutOfStock, setHideOutOfStock] = useHideOutOfStock();
  const productsQuery = useQuery({
    queryKey: ["pos-category-products", categoryId],
    queryFn: () => posFetchProducts(undefined, categoryId ?? undefined),
    enabled: !!categoryId,
  });

  if (!categoryId) {
    return null;
  }

  const all = productsQuery.data ?? [];
  const products = hideOutOfStock ? all.filter((p) => !isOutOfStock(p, stockLevels)) : all;

  return (
    <div className="pb-3">
      <div className="mb-1 flex justify-end gap-1">
        <Button
          type="button"
          size="icon"
          variant={hideOutOfStock ? "secondary" : "ghost"}
          className="h-7 w-7"
          aria-pressed={hideOutOfStock}
          aria-label={t("view.hideOutOfStock")}
          title={t("view.hideOutOfStock")}
          onClick={() => setHideOutOfStock(!hideOutOfStock)}
        >
          <EyeOff className="h-3.5 w-3.5" />
        </Button>
        <div className="flex gap-1" role="radiogroup" aria-label={t("view.label")}>
        {(["grid", "list"] as const).map((v) => (
          <Button
            key={v}
            type="button"
            size="icon"
            variant={view === v ? "secondary" : "ghost"}
            className="h-7 w-7"
            role="radio"
            aria-checked={view === v}
            aria-label={t(`view.${v}`)}
            title={t(`view.${v}`)}
            onClick={() => setView(v)}
          >
            {v === "grid" ? <LayoutGrid className="h-3.5 w-3.5" /> : <List className="h-3.5 w-3.5" />}
          </Button>
        ))}
        </div>
      </div>
      {view === "grid" ? (
        <div className="grid max-h-48 grid-cols-3 gap-2 overflow-y-auto">
          {products.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => onSelect(product)}
              className="flex items-center gap-2 rounded-md border bg-card p-2 text-left text-sm shadow-sm transition-colors hover:border-ring hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {productPhotoSrc(product) && (
                <img src={productPhotoSrc(product)!} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded object-cover" />
              )}
              <span className="min-w-0">
                <span className="block truncate font-medium">{product.name}</span>
                <span className="block text-muted-foreground">
                  {money(product.sellPrice)}
                  {product.unit && product.unit !== "un" && `/${product.unit}`}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="max-h-48 divide-y overflow-y-auto rounded-md border">
          {products.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => onSelect(product)}
              className={cn("flex w-full items-center justify-between gap-3 bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring")}
            >
              <span className="min-w-0 flex-1 truncate font-medium">{product.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{product.sku}</span>
              <span className="w-28 shrink-0 text-right">
                {money(product.sellPrice)}
                {product.unit && product.unit !== "un" && `/${product.unit}`}
              </span>
            </button>
          ))}
        </div>
      )}
      {all.length > 0 && products.length === 0 && <p className="py-2 text-center text-sm text-muted-foreground">{t("view.allOutOfStock")}</p>}
      {productsQuery.data?.length === 0 && <p className="py-2 text-center text-sm text-muted-foreground">{t("categories.empty")}</p>}
    </div>
  );
}
