import * as React from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import type { BusinessDto } from "@pos/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useAuthStore } from "@/features/auth/store";
import { BUSINESS_QUERY_KEY, fetchBusiness, updateBusiness } from "@/features/business/api";
import { supportedCurrencies } from "@/features/business/currencies";
import { LogoUploader } from "@/features/business/components/LogoUploader";
import { StoresSettings } from "@/features/business/components/StoresSettings";
import { formatMoney } from "@/lib/format";

const settingsSchema = z.object({
  name: z.string().trim().min(1, "Business name is required").max(100),
  legalName: z.string().max(150),
  taxId: z.string().max(50),
  registrationNumber: z.string().max(50),
  address: z.string().max(300),
  phone: z.string().max(40),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email")]),
  website: z.string().max(100),
  currency: z.string().length(3),
  defaultTaxRate: z
    .string()
    .refine((v) => v !== "" && !Number.isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 100, "0 to 100"),
  receiptHeader: z.string().max(300),
  receiptFooter: z.string().max(300),
  invoiceFooter: z.string().max(1000),
});

type SettingsValues = z.infer<typeof settingsSchema>;

function toFormValues(b: BusinessDto): SettingsValues {
  return {
    name: b.name,
    legalName: b.legalName ?? "",
    taxId: b.taxId ?? "",
    registrationNumber: b.registrationNumber ?? "",
    address: b.address ?? "",
    phone: b.phone ?? "",
    email: b.email ?? "",
    website: b.website ?? "",
    currency: b.currency,
    defaultTaxRate: String(Number(b.defaultTaxRate)),
    receiptHeader: b.receiptHeader ?? "",
    receiptFooter: b.receiptFooter ?? "",
    invoiceFooter: b.invoiceFooter ?? "",
  };
}

/** Text fields: blank clears the value on the server. */
const TEXT_FIELDS: { name: keyof SettingsValues; label: string; description?: string; multiline?: boolean }[] = [
  { name: "legalName", label: "Legal name", description: "If different from the business name, e.g. \"Corner Cafe LLC\"." },
  { name: "taxId", label: "Tax / VAT number" },
  { name: "registrationNumber", label: "Company registration number" },
  { name: "address", label: "Address", multiline: true },
  { name: "phone", label: "Phone" },
  { name: "email", label: "Email" },
  { name: "website", label: "Website" },
];

export function SettingsPage() {
  const role = useAuthStore((s) => s.user?.role);
  const setBusiness = useAuthStore((s) => s.setBusiness);
  const queryClient = useQueryClient();
  const businessQuery = useQuery({ queryKey: BUSINESS_QUERY_KEY, queryFn: fetchBusiness });
  const currencies = React.useMemo(supportedCurrencies, []);

  const form = useForm<SettingsValues>({ resolver: zodResolver(settingsSchema) });
  const { reset } = form;
  React.useEffect(() => {
    if (businessQuery.data) reset(toFormValues(businessQuery.data));
  }, [businessQuery.data, reset]);

  function saved(business: BusinessDto) {
    queryClient.setQueryData(BUSINESS_QUERY_KEY, business);
    setBusiness(business);
  }

  const saveMutation = useMutation({
    mutationFn: (values: SettingsValues) => updateBusiness({ ...values, defaultTaxRate: Number(values.defaultTaxRate) }),
    onSuccess: (business) => {
      saved(business);
      toast.success("Settings saved");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  if (role !== "OWNER") return <Navigate to="/dashboard" replace />;

  const business = businessQuery.data;
  const currency = form.watch("currency");

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Your business details appear on receipts and invoices.
        </p>
      </div>

      {!business ? (
        <p className="text-sm text-muted-foreground">
          {businessQuery.isError ? "Couldn't load settings. Check your connection." : "Loading..."}
        </p>
      ) : (
        <>
          <Form {...form}>
            <form className="space-y-6" onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))}>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Business</CardTitle>
                  <CardDescription>Company details for receipts and A4 invoices.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel>Business name</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {TEXT_FIELDS.map(({ name, label, description, multiline }) => (
                    <FormField
                      key={name}
                      control={form.control}
                      name={name}
                      render={({ field }) => (
                        <FormItem className={multiline || description ? "sm:col-span-2" : undefined}>
                          <FormLabel>{label}</FormLabel>
                          <FormControl>
                            {multiline ? <Textarea rows={2} {...field} /> : <Input {...field} />}
                          </FormControl>
                          {description && <FormDescription>{description}</FormDescription>}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Money</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Currency</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {currencies.map((c) => (
                              <SelectItem key={c.code} value={c.code}>
                                {c.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {currency && <FormDescription>Example: {formatMoney(1234.5, currency)}</FormDescription>}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="defaultTaxRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Default tax %</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" min="0" max="100" {...field} />
                        </FormControl>
                        <FormDescription>Pre-filled on new products. Existing products keep their rate.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Receipts & invoices</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="receiptHeader"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Receipt header</FormLabel>
                        <FormControl>
                          <Textarea rows={2} placeholder="e.g. Open 7 days, 8am–8pm" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="receiptFooter"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Receipt footer</FormLabel>
                        <FormControl>
                          <Textarea rows={2} placeholder="Thank you!" {...field} />
                        </FormControl>
                        <FormDescription>Defaults to "Thank you!" when blank.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="invoiceFooter"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Invoice footer</FormLabel>
                        <FormControl>
                          <Textarea rows={3} placeholder="Bank details, payment terms…" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button type="submit" disabled={saveMutation.isPending || !form.formState.isDirty}>
                  {saveMutation.isPending ? "Saving..." : "Save settings"}
                </Button>
              </div>
            </form>
          </Form>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Logo</CardTitle>
            </CardHeader>
            <CardContent>
              <LogoUploader business={business} onSaved={saved} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Stores</CardTitle>
              <CardDescription>Each store's address and phone print on its receipts.</CardDescription>
            </CardHeader>
            <CardContent>
              <StoresSettings />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
