import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createProduct, fetchProducts } from "@/features/products/api";
import { fetchCategories } from "@/features/categories/api";

export function ProductsPage() {
  const [search, setSearch] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const queryClient = useQueryClient();

  const productsQuery = useQuery({
    queryKey: ["products", search],
    queryFn: () => fetchProducts(search || undefined),
  });
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });

  const [form, setForm] = React.useState({
    name: "",
    sku: "",
    barcode: "",
    categoryId: "",
    costPrice: "",
    sellPrice: "",
    taxRate: "0",
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createProduct({
        name: form.name,
        sku: form.sku,
        barcode: form.barcode || undefined,
        categoryId: form.categoryId || undefined,
        costPrice: Number(form.costPrice),
        sellPrice: Number(form.sellPrice),
        taxRate: Number(form.taxRate) || 0,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setDialogOpen(false);
      setForm({ name: "", sku: "", barcode: "", categoryId: "", costPrice: "", sellPrice: "", taxRate: "0" });
    },
  });

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Products</h1>
          <p className="text-sm text-muted-foreground">Manage your product catalog.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> New product
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New product</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sku">SKU</Label>
                  <Input id="sku" required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="barcode">Barcode</Label>
                  <Input id="barcode" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.categoryId} onValueChange={(v) => setForm({ ...form, categoryId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Uncategorized" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoriesQuery.data?.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="costPrice">Cost price</Label>
                  <Input id="costPrice" type="number" step="0.01" required value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sellPrice">Sell price</Label>
                  <Input id="sellPrice" type="number" step="0.01" required value={form.sellPrice} onChange={(e) => setForm({ ...form, sellPrice: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="taxRate">Tax %</Label>
                  <Input id="taxRate" type="number" step="0.01" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} />
                </div>
              </div>
              {createMutation.isError && (
                <p className="text-sm text-destructive">
                  {(createMutation.error as Error).message}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Saving..." : "Save product"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Input
        placeholder="Search by name, SKU, or barcode..."
        className="mb-4 max-w-sm"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-3 font-medium">Name</th>
                <th className="p-3 font-medium">SKU</th>
                <th className="p-3 font-medium">Barcode</th>
                <th className="p-3 font-medium text-right">Sell price</th>
              </tr>
            </thead>
            <tbody>
              {productsQuery.data?.map((product) => (
                <tr key={product.id} className="border-b last:border-0">
                  <td className="p-3">{product.name}</td>
                  <td className="p-3 text-muted-foreground">{product.sku}</td>
                  <td className="p-3 text-muted-foreground">{product.barcode ?? "—"}</td>
                  <td className="p-3 text-right">${Number(product.sellPrice).toFixed(2)}</td>
                </tr>
              ))}
              {productsQuery.data?.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-muted-foreground">
                    No products yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
