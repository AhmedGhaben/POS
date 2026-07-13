import { useQuery } from "@tanstack/react-query";
import { fetchCategories } from "@/features/categories/api";
import { cn } from "@/lib/utils";

interface CategoryFilterProps {
  selectedCategoryId: string | null;
  onSelect: (categoryId: string | null) => void;
}

/** Lets a cashier browse by category when they don't know the exact name/barcode. */
export function CategoryFilter({ selectedCategoryId, onSelect }: CategoryFilterProps) {
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const categories = categoriesQuery.data ?? [];

  if (categories.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 py-3">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          "rounded-full border px-3 py-1 text-xs font-medium hover:bg-accent",
          selectedCategoryId === null && "border-primary bg-primary text-primary-foreground",
        )}
      >
        All
      </button>
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          onClick={() => onSelect(category.id)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium hover:bg-accent",
            selectedCategoryId === category.id && "border-primary bg-primary text-primary-foreground",
          )}
        >
          {category.name}
        </button>
      ))}
    </div>
  );
}
