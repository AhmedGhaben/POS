import { useQuery } from "@tanstack/react-query";
import type { ProductDto } from "@pos/shared";
import { fetchProducts } from "@/features/products/api";
import { useMoney } from "@/features/business/use-money";

interface ProductGridProps {
  categoryId: string | null;
  onSelect: (product: ProductDto) => void;
}

/** Browsable grid for the currently selected category — click to add to cart. */
export function ProductGrid({ categoryId, onSelect }: ProductGridProps) {
  const money = useMoney();
  const productsQuery = useQuery({
    queryKey: ["pos-category-products", categoryId],
    queryFn: () => fetchProducts(undefined, categoryId ?? undefined),
    enabled: !!categoryId,
  });

  if (!categoryId) {
    return null;
  }

  return (
    <div className="grid max-h-48 grid-cols-3 gap-2 overflow-y-auto pb-3">
      {productsQuery.data?.map((product) => (
        <button
          key={product.id}
          type="button"
          onClick={() => onSelect(product)}
          className="rounded-md border p-2 text-left text-sm hover:bg-accent"
        >
          <p className="truncate font-medium">{product.name}</p>
          <p className="text-muted-foreground">{money(product.sellPrice)}</p>
        </button>
      ))}
      {productsQuery.data?.length === 0 && (
        <p className="col-span-3 py-2 text-center text-sm text-muted-foreground">
          No products in this category.
        </p>
      )}
    </div>
  );
}
