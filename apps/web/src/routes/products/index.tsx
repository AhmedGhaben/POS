import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Download, Pencil, Plus, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { downloadCsv } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ProductDto } from "@pos/shared";
import { fetchProducts } from "@/features/products/api";
import { fieldHeader } from "@/features/products/import-rows";
import { ImportProductsDialog } from "@/features/products/components/ImportProductsDialog";
import { ProductFormDialog } from "@/features/products/components/ProductFormDialog";
import { fetchCategories } from "@/features/categories/api";
import { useMoney } from "@/features/business/use-money";
import { useAuthStore } from "@/features/auth/store";

export function ProductsPage() {
  const { t } = useTranslation(["products", "common"]);
  const money = useMoney();
  const [search, setSearch] = React.useState("");
  const [showArchived, setShowArchived] = React.useState(false);
  // `?new=1` (from the /welcome screen) opens the create dialog straight away.
  const [searchParams, setSearchParams] = useSearchParams();
  const [dialogOpen, setDialogOpen] = React.useState(() => searchParams.get("new") === "1");
  const [editing, setEditing] = React.useState<ProductDto | null>(null);
  const [importOpen, setImportOpen] = React.useState(false);
  React.useEffect(() => {
    if (searchParams.has("new")) setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  // Matches the API: owners and managers edit, cashiers only browse.
  const role = useAuthStore((s) => s.user?.role);
  const canEdit = role === "OWNER" || role === "MANAGER";

  const productsQuery = useQuery({
    queryKey: ["products", search, showArchived],
    queryFn: () => fetchProducts(search || undefined, undefined, showArchived),
  });
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (product: ProductDto) => {
    if (!canEdit) return;
    setEditing(product);
    setDialogOpen(true);
  };

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("common:nav.products")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("subtitle")}
            {canEdit && ` ${t("clickToEdit")}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={!productsQuery.data?.length}
            onClick={() =>
              downloadCsv(
                t("exportFile"),
                [
                  { header: fieldHeader("name"), value: (p: ProductDto) => p.name },
                  { header: fieldHeader("sku"), value: (p: ProductDto) => p.sku },
                  { header: fieldHeader("barcode"), value: (p: ProductDto) => p.barcode },
                  {
                    header: fieldHeader("category"),
                    value: (p: ProductDto) => categoriesQuery.data?.find((c) => c.id === p.categoryId)?.name ?? "",
                  },
                  // Blank when the user can't see costs, so re-importing leaves them unchanged.
                  { header: fieldHeader("costPrice"), value: (p: ProductDto) => ("costPrice" in p ? p.costPrice : "") },
                  { header: fieldHeader("sellPrice"), value: (p: ProductDto) => p.sellPrice },
                  { header: fieldHeader("taxRate"), value: (p: ProductDto) => p.taxRate },
                ],
                productsQuery.data ?? [],
              )
            }
          >
            <Download className="mr-2 h-4 w-4" /> {t("common:actions.exportCsv")}
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" /> {t("common:actions.importCsv")}
          </Button>
          <ImportProductsDialog open={importOpen} onOpenChange={setImportOpen} />
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" /> {t("newProduct")}
          </Button>
          <ProductFormDialog open={dialogOpen} onOpenChange={setDialogOpen} product={editing} />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Input
          placeholder={t("searchPlaceholder")}
          className="max-w-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {canEdit && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            {t("showArchived")}
          </label>
        )}
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.name")}</TableHead>
                <TableHead>{t("columns.sku")}</TableHead>
                <TableHead>{t("columns.barcode")}</TableHead>
                <TableHead className="text-right">{t("columns.sellPrice")}</TableHead>
                {canEdit && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {productsQuery.data?.map((product) => (
                <TableRow
                  key={product.id}
                  className={canEdit ? "cursor-pointer" : undefined}
                  onClick={() => openEdit(product)}
                >
                  <TableCell>{product.name}</TableCell>
                  <TableCell className="text-muted-foreground">{product.sku}</TableCell>
                  <TableCell className="text-muted-foreground">{product.barcode ?? "—"}</TableCell>
                  <TableCell className="text-right">{money(product.sellPrice)}</TableCell>
                  {canEdit && (
                    <TableCell className="py-1 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("editNamed", { name: product.name })}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(product);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {productsQuery.data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canEdit ? 5 : 4} className="p-6 text-center text-muted-foreground">
                    {showArchived ? t("emptyArchived") : t("empty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
