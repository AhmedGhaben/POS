import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Download, Plus } from "lucide-react";
import { downloadCsv } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import type { ProductDto } from "@pos/shared";
import { createProduct, fetchProducts } from "@/features/products/api";
import { fetchCategories } from "@/features/categories/api";
import { useMoney } from "@/features/business/use-money";
import { useAuthStore } from "@/features/auth/store";

const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  sku: z.string().min(1, "SKU is required"),
  barcode: z.string().optional(),
  categoryId: z.string().optional(),
  costPrice: z.coerce.number().min(0, "Must be 0 or more"),
  sellPrice: z.coerce.number().min(0, "Must be 0 or more"),
  taxRate: z.coerce.number().min(0, "Must be 0 or more"),
});

const defaultValues = {
  name: "",
  sku: "",
  barcode: "",
  categoryId: "",
  costPrice: "",
  sellPrice: "",
  taxRate: "0",
};

export function ProductsPage() {
  const money = useMoney();
  const [search, setSearch] = React.useState("");
  // `?new=1` (from the /welcome screen) opens the create dialog straight away.
  const [searchParams, setSearchParams] = useSearchParams();
  const [dialogOpen, setDialogOpen] = React.useState(() => searchParams.get("new") === "1");
  React.useEffect(() => {
    if (searchParams.has("new")) setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);
  const queryClient = useQueryClient();

  const productsQuery = useQuery({
    queryKey: ["products", search],
    queryFn: () => fetchProducts(search || undefined),
  });
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });

  // New products start at the business's default tax rate (Settings → Money).
  const defaultTaxRate = useAuthStore((s) => s.business?.defaultTaxRate ?? "0");
  const freshValues = React.useMemo(
    () => ({ ...defaultValues, taxRate: String(Number(defaultTaxRate)) }),
    [defaultTaxRate],
  );
  const form = useForm<z.input<typeof productSchema>, unknown, z.output<typeof productSchema>>({
    resolver: zodResolver(productSchema),
    defaultValues: freshValues,
  });

  const createMutation = useMutation({
    mutationFn: (values: z.output<typeof productSchema>) =>
      createProduct({
        name: values.name,
        sku: values.sku,
        barcode: values.barcode || undefined,
        categoryId: values.categoryId || undefined,
        costPrice: values.costPrice,
        sellPrice: values.sellPrice,
        taxRate: values.taxRate,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setDialogOpen(false);
      form.reset(freshValues);
      toast.success("Product created");
    },
    onError: (error) => {
      toast.error((error as Error).message);
    },
  });

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Products</h1>
          <p className="text-sm text-muted-foreground">Manage your product catalog.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={!productsQuery.data?.length}
            onClick={() =>
              downloadCsv(
                "products.csv",
                [
                  { header: "Name", value: (p: ProductDto) => p.name },
                  { header: "SKU", value: (p: ProductDto) => p.sku },
                  { header: "Barcode", value: (p: ProductDto) => p.barcode },
                  { header: "Cost price", value: (p: ProductDto) => ("costPrice" in p ? p.costPrice : "") },
                  { header: "Sell price", value: (p: ProductDto) => p.sellPrice },
                  { header: "Tax %", value: (p: ProductDto) => p.taxRate },
                ],
                productsQuery.data ?? [],
              )
            }
          >
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
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
            <Form {...form}>
              <form
                className="space-y-3"
                onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
              >
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="sku"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SKU</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="barcode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Barcode</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="categoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Uncategorized" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {categoriesQuery.data?.map((category) => (
                            <SelectItem key={category.id} value={category.id}>
                              {category.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-3 gap-3">
                  <FormField
                    control={form.control}
                    name="costPrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cost price</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} value={field.value as string} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="sellPrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sell price</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} value={field.value as string} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="taxRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tax %</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} value={field.value as string} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Saving..." : "Save product"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Input
        placeholder="Search by name, SKU, or barcode..."
        className="mb-4 max-w-sm"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Barcode</TableHead>
                <TableHead className="text-right">Sell price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productsQuery.data?.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>{product.name}</TableCell>
                  <TableCell className="text-muted-foreground">{product.sku}</TableCell>
                  <TableCell className="text-muted-foreground">{product.barcode ?? "—"}</TableCell>
                  <TableCell className="text-right">{money(product.sellPrice)}</TableCell>
                </TableRow>
              ))}
              {productsQuery.data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="p-6 text-center text-muted-foreground">
                    No products yet.
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
