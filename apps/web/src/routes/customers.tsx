import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import type { CustomerDto } from "@pos/shared";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMoney } from "@/features/business/use-money";
import { CUSTOMERS_KEY, fetchCustomersWithBalance } from "@/features/accounts/api";
import { CustomerAccountSheet } from "@/features/accounts/components/CustomerAccountSheet";
import { CustomerFormDialog } from "@/features/accounts/components/CustomerFormDialog";

/**
 * Customers (docs/plans/ANGOLA.md, phase 4): who they are, their credit
 * limit and what they owe; open one for their account (invoices on credit,
 * receipts, take a payment).
 */
export function CustomersPage() {
  const { t } = useTranslation(["accounts", "common"]);
  const money = useMoney();
  const [search, setSearch] = React.useState("");
  const [editing, setEditing] = React.useState<CustomerDto | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [account, setAccount] = React.useState<CustomerDto | null>(null);
  const customers = useQuery({ queryKey: [...CUSTOMERS_KEY, search], queryFn: () => fetchCustomersWithBalance(search.trim() || undefined) });
  const owing = (customers.data ?? []).reduce((s, c) => s + Number(c.balance ?? 0), 0);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("common:nav.customers")}</h1>
          <p className="text-sm text-muted-foreground">{t("customers.subtitle", { amount: money(owing) })}</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" /> {t("customers.new")}
        </Button>
      </div>
      <Input placeholder={t("customers.search")} aria-label={t("customers.search")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("customers.name")}</TableHead>
                <TableHead>{t("customers.taxId")}</TableHead>
                <TableHead>{t("customers.phone")}</TableHead>
                <TableHead className="text-right">{t("customers.creditLimit")}</TableHead>
                <TableHead className="text-right">{t("customers.balance")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.data?.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-muted-foreground">{c.taxId ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.phone ?? "—"}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{c.creditLimit == null ? t("account.noCredit") : money(c.creditLimit)}</TableCell>
                  <TableCell className={`text-right ${Number(c.balance) > 0 ? "font-semibold" : "text-muted-foreground"}`}>{money(c.balance ?? 0)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button size="sm" variant="ghost" onClick={() => setAccount(c)}>
                      {t("customers.account")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditing(c);
                        setFormOpen(true);
                      }}
                    >
                      {t("common:actions.edit")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {customers.data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="p-6 text-center text-muted-foreground">
                    {t("customers.empty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <CustomerFormDialog customer={editing} open={formOpen} onOpenChange={setFormOpen} />
      <CustomerAccountSheet customer={account} onClose={() => setAccount(null)} />
    </div>
  );
}
