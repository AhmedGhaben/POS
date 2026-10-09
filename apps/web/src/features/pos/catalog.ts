import type { CategoryDto, ProductDto } from "@pos/shared";
import { useAuthStore } from "@/features/auth/store";
import { fetchCategories } from "@/features/categories/api";
import { fetchProducts } from "@/features/products/api";
import { isUnreachableError } from "@/lib/api-client";
import { loadCatalog, saveCatalog } from "@/lib/offline-db";
import { isWorkingOffline } from "./offline-store";

/**
 * A copy of the sellable catalog on this computer, so the till can keep
 * selling (and start up) while the server is unreachable. Refreshed in the
 * background by the sync engine; prices are those of the last refresh.
 */
const REFRESH_EVERY_MS = 10 * 60_000;
let lastRefresh = 0;

function key(kind: "products" | "categories") {
  const businessId = useAuthStore.getState().user?.businessId ?? "none";
  return `${businessId}:${kind}`;
}

export async function refreshCatalog({ force = false } = {}): Promise<void> {
  if (!useAuthStore.getState().accessToken) return;
  if (!force && Date.now() - lastRefresh < REFRESH_EVERY_MS) return;
  const [products, categories] = await Promise.all([fetchProducts(), fetchCategories()]);
  await Promise.all([saveCatalog(key("products"), products), saveCatalog(key("categories"), categories)]);
  lastRefresh = Date.now();
}

export async function catalogSavedAt(): Promise<string | null> {
  return (await loadCatalog(key("products")))?.savedAt ?? null;
}

async function savedProducts(): Promise<ProductDto[]> {
  return (await loadCatalog<ProductDto[]>(key("products")))?.data ?? [];
}

/** Same matching as the API's product search (name, SKU or barcode). */
export function filterProducts(products: ProductDto[], search?: string, categoryId?: string): ProductDto[] {
  const needle = search?.trim().toLowerCase();
  return products.filter(
    (p) =>
      (!categoryId || p.categoryId === categoryId) &&
      (!needle ||
        p.name.toLowerCase().includes(needle) ||
        p.sku.toLowerCase().includes(needle) ||
        (p.barcode ?? "").toLowerCase().includes(needle)),
  );
}

/** Ask the server; if it can't be reached, answer from the saved copy. */
async function withFallback<T>(online: () => Promise<T>, offline: () => Promise<T>): Promise<T> {
  if (isWorkingOffline()) return offline();
  try {
    return await online();
  } catch (err) {
    if (isUnreachableError(err)) return offline();
    throw err;
  }
}

export function posFetchProducts(search?: string, categoryId?: string): Promise<ProductDto[]> {
  return withFallback(
    () => fetchProducts(search, categoryId),
    async () => filterProducts(await savedProducts(), search, categoryId),
  );
}

export function posFetchCategories(): Promise<CategoryDto[]> {
  return withFallback(
    () => fetchCategories(),
    async () => (await loadCatalog<CategoryDto[]>(key("categories")))?.data ?? [],
  );
}

export async function findSavedByBarcode(barcode: string): Promise<ProductDto | null> {
  return (await savedProducts()).find((p) => p.barcode === barcode) ?? null;
}
