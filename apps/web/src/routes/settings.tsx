import * as React from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { countryConfig, type BusinessDto } from "@pos/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useAuthStore } from "@/features/auth/store";
import { BUSINESS_QUERY_KEY, fetchBusiness, updateBusiness } from "@/features/business/api";
import { supportedCurrencies } from "@/features/business/currencies";
import { LogoUploader } from "@/features/business/components/LogoUploader";
import { StoresSettings } from "@/features/business/components/StoresSettings";
import { TaxRatesSettings } from "@/features/business/components/TaxRatesSettings";
import { BankAccountsSettings } from "@/features/business/components/BankAccountsSettings";
import { TillsSettings } from "@/features/business/components/TillsSettings";
import { formatMoney } from "@/lib/format";
import { LANGUAGES } from "@/i18n";

const settingsSchema = z.object({
  name: z.string().trim().min(1, "validation.required").max(100),
  legalName: z.string().max(150),
  // NIF: letters and numbers (Angola: e.g. 000415195LA035).
  taxId: z.union([z.literal(""), z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9 .-]*$/, "settings:business.lettersAndNumbers").max(50)]),
  registrationNumber: z.string().max(50),
  legalForm: z.string(),
  eacCode: z.union([z.literal(""), z.string().trim().regex(/^[0-9A-Za-z.]+$/, "settings:business.lettersAndNumbers").max(10)]),
  address: z.string().max(300),
  city: z.string().max(80),
  postalCode: z.string().max(20),
  province: z.string(),
  eInvoicingActive: z.boolean(),
  phone: z.string().max(40),
  email: z.union([z.literal(""), z.string().trim().email("validation.email")]),
  website: z.string().max(100),
  currency: z.string().length(3),
  language: z.string(),
  defaultTaxRate: z
    .string()
    .refine((v) => v !== "" && !Number.isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 100, "settings:money.taxRange"),
  maxDiscountPercent: z
    .string()
    .refine((v) => v.trim() === "" || (!Number.isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 100), "settings:money.maxDiscountRange"),
  shiftDifferenceThreshold: z
    .string()
    .refine((v) => v.trim() === "" || (!Number.isNaN(Number(v)) && Number(v) >= 0), "settings:tills.thresholdRange"),
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
    legalForm: b.legalForm ?? "",
    eacCode: b.eacCode ?? "",
    address: b.address ?? "",
    city: b.city ?? "",
    postalCode: b.postalCode ?? "",
    province: b.province ?? "",
    eInvoicingActive: !!b.eInvoicingActive,
    phone: b.phone ?? "",
    email: b.email ?? "",
    website: b.website ?? "",
    currency: b.currency,
    language: b.language ?? "en",
    defaultTaxRate: String(Number(b.defaultTaxRate)),
    maxDiscountPercent: b.maxDiscountPercent == null ? "" : String(Number(b.maxDiscountPercent)),
    shiftDifferenceThreshold: b.shiftDifferenceThreshold == null ? "" : String(Number(b.shiftDifferenceThreshold)),
    receiptHeader: b.receiptHeader ?? "",
    receiptFooter: b.receiptFooter ?? "",
    invoiceFooter: b.invoiceFooter ?? "",
  };
}

/** Text fields: blank clears the value on the server. */
const TEXT_FIELDS: {
  name: "legalName" | "taxId" | "registrationNumber" | "eacCode" | "address" | "city" | "postalCode" | "phone" | "email" | "website";
  described?: boolean;
  multiline?: boolean;
}[] = [
  { name: "legalName", described: true },
  { name: "taxId" },
  { name: "registrationNumber" },
  { name: "eacCode" },
  { name: "address", multiline: true },
  { name: "city" },
  { name: "postalCode" },
  { name: "phone" },
  { name: "email" },
  { name: "website" },
];

export function SettingsPage() {
  const { t } = useTranslation(["settings", "common"]);
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
    mutationFn: (values: SettingsValues) =>
      updateBusiness({
        ...values,
        defaultTaxRate: Number(values.defaultTaxRate),
        maxDiscountPercent: values.maxDiscountPercent.trim() === "" ? null : Number(values.maxDiscountPercent),
        shiftDifferenceThreshold: values.shiftDifferenceThreshold.trim() === "" ? null : Number(values.shiftDifferenceThreshold),
      }),
    onSuccess: (business) => {
      saved(business);
      toast.success(t("saved"));
    },
    onError: (err) => toast.error((err as Error).message),
  });

  if (role !== "OWNER") return <Navigate to="/dashboard" replace />;

  const business = businessQuery.data;
  const currency = form.watch("currency");
  // Lists (legal forms, provinces…) from the business's country config.
  const country = countryConfig(businessQuery.data?.country ?? "AO");

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("common:nav.settings")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("subtitle")}
        </p>
      </div>

      {!business ? (
        <p className="text-sm text-muted-foreground">
          {businessQuery.isError ? t("loadFailed") : t("common:actions.loading")}
        </p>
      ) : (
        <>
          <Form {...form}>
            <form className="space-y-6" onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))}>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("business.title")}</CardTitle>
                  <CardDescription>{t("business.description")}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel>{t("business.name")}</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="legalForm"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("business.fields.legalForm")}</FormLabel>
                        <FormControl>
                          <Combobox
                            value={field.value || null}
                            onChange={(v) => field.onChange(v ?? "")}
                            placeholder={t("business.choose")}
                            clearLabel={t("business.none")}
                            options={(country?.legalForms ?? []).map((f) => ({ value: f.code, label: f.name }))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="province"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("business.fields.province")}</FormLabel>
                        <FormControl>
                          <Combobox
                            value={field.value || null}
                            onChange={(v) => field.onChange(v ?? "")}
                            placeholder={t("business.choose")}
                            clearLabel={t("business.none")}
                            options={(country?.provinces ?? []).map((p) => ({ value: p.code, label: p.name }))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {TEXT_FIELDS.map(({ name, described, multiline }) => (
                    <FormField
                      key={name}
                      control={form.control}
                      name={name}
                      render={({ field }) => (
                        <FormItem className={multiline || described ? "sm:col-span-2" : undefined}>
                          <FormLabel>{t(`business.fields.${name}`)}</FormLabel>
                          <FormControl>
                            {multiline ? <Textarea rows={2} {...field} /> : <Input {...field} />}
                          </FormControl>
                          {described && <FormDescription>{t(`business.hints.${name as "legalName"}`)}</FormDescription>}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("money.title")}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("money.currency")}</FormLabel>
                        <FormControl>
                          <Combobox
                            value={field.value}
                            onChange={(v) => field.onChange(v ?? "")}
                            options={currencies.map((c) => ({ value: c.code, label: c.label }))}
                          />
                        </FormControl>
                        {currency && <FormDescription>{t("money.example", { amount: formatMoney(1234.5, currency) })}</FormDescription>}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="defaultTaxRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("money.defaultTax")}</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" min="0" max="100" {...field} />
                        </FormControl>
                        <FormDescription>{t("money.defaultTaxHint")}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="maxDiscountPercent"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("money.maxDiscount")}</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" min="0" max="100" placeholder={t("money.noLimit")} {...field} />
                        </FormControl>
                        <FormDescription>{t("money.maxDiscountHint")}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("tills.title")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-sm text-muted-foreground">{t("tills.shiftsAlwaysOn")}</p>
                  <FormField
                    control={form.control}
                    name="shiftDifferenceThreshold"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("tills.threshold")}</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" min="0" placeholder={t("tills.noThreshold")} {...field} />
                        </FormControl>
                        <FormDescription>{t("tills.thresholdHint")}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("agt.title")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <FormField
                    control={form.control}
                    name="eInvoicingActive"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-start gap-3">
                          <FormControl>
                            <input type="checkbox" className="mt-1 h-4 w-4" checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />
                          </FormControl>
                          <div>
                            <FormLabel>{t("agt.eInvoicing")}</FormLabel>
                            <FormDescription>{t("agt.eInvoicingHint")}</FormDescription>
                          </div>
                        </div>
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("documents.title")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="language"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("documents.language")}</FormLabel>
                        <FormControl>
                          <Combobox
                            value={field.value}
                            onChange={(v) => v !== null && field.onChange(v)}
                            aria-label={t("documents.language")}
                            options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
                          />
                        </FormControl>
                        <FormDescription>{t("documents.languageHint")}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="receiptHeader"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("documents.receiptHeader")}</FormLabel>
                        <FormControl>
                          <Textarea rows={2} placeholder={t("documents.receiptHeaderPlaceholder")} {...field} />
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
                        <FormLabel>{t("documents.receiptFooter")}</FormLabel>
                        <FormControl>
                          <Textarea rows={2} placeholder={t("documents.receiptFooterPlaceholder")} {...field} />
                        </FormControl>
                        <FormDescription>{t("documents.receiptFooterHint")}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="invoiceFooter"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("documents.invoiceFooter")}</FormLabel>
                        <FormControl>
                          <Textarea rows={3} placeholder={t("documents.invoiceFooterPlaceholder")} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button type="submit" disabled={saveMutation.isPending || !form.formState.isDirty}>
                  {saveMutation.isPending ? t("common:actions.saving") : t("save")}
                </Button>
              </div>
            </form>
          </Form>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("logo.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <LogoUploader business={business} onSaved={saved} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("stores.title")}</CardTitle>
              <CardDescription>{t("stores.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              <StoresSettings />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("rates.title")}</CardTitle>
              <CardDescription>{t("rates.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              <TaxRatesSettings />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("banks.title")}</CardTitle>
              <CardDescription>{t("banks.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              <BankAccountsSettings />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("tillsList.title")}</CardTitle>
              <CardDescription>{t("tillsList.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              <TillsSettings />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
