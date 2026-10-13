import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { countryConfig, type BankAccountDto } from "@pos/shared";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuthStore } from "@/features/auth/store";
import {
  BANK_ACCOUNTS_QUERY_KEY,
  createBankAccount,
  deleteBankAccount,
  fetchBankAccounts,
  formatIban,
  updateBankAccount,
} from "../api";

interface BankForm {
  /** A listed bank's code, or what was typed for "Outro". */
  bank: string;
  accountHolder: string;
  iban: string;
  showOnQuotes: boolean;
  showOnInvoices: boolean;
}

/**
 * The business's bank accounts ("Dados da Empresa"): the bank from the
 * country's list or "Outro" typed in, the holder and the IBAN. They print
 * on quotes/proformas, and on invoices when chosen.
 */
export function BankAccountsSettings() {
  const { t } = useTranslation(["settings", "common"]);
  const queryClient = useQueryClient();
  const country = countryConfig(useAuthStore((s) => s.business?.country) ?? "AO");
  const banks = country?.banks ?? [];
  const accounts = useQuery({ queryKey: BANK_ACCOUNTS_QUERY_KEY, queryFn: fetchBankAccounts });
  const [editing, setEditing] = React.useState<BankAccountDto | "new" | null>(null);
  const [form, setForm] = React.useState<BankForm>({ bank: "", accountHolder: "", iban: "", showOnQuotes: true, showOnInvoices: false });
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!editing) return;
    setError(null);
    if (editing === "new") {
      setForm({ bank: "", accountHolder: useAuthStore.getState().business?.legalName ?? "", iban: "", showOnQuotes: true, showOnInvoices: false });
    } else {
      setForm({
        bank: editing.bankCode === "OTHER" ? editing.bankName : editing.bankCode,
        accountHolder: editing.accountHolder,
        iban: formatIban(editing.iban),
        showOnQuotes: editing.showOnQuotes,
        showOnInvoices: editing.showOnInvoices,
      });
    }
  }, [editing]);

  const done = (message: string) => {
    void queryClient.invalidateQueries({ queryKey: BANK_ACCOUNTS_QUERY_KEY });
    toast.success(message);
    setEditing(null);
  };

  const save = useMutation({
    mutationFn: () => {
      const listed = banks.some((b) => b.code === form.bank);
      const dto = {
        bankCode: listed ? form.bank : "OTHER",
        bankName: listed ? undefined : form.bank.trim(),
        accountHolder: form.accountHolder.trim(),
        iban: form.iban,
        showOnQuotes: form.showOnQuotes,
        showOnInvoices: form.showOnInvoices,
      };
      return editing && editing !== "new" ? updateBankAccount(editing.id, dto) : createBankAccount(dto);
    },
    onSuccess: () => done(t("banks.saved")),
    onError: (err) => setError((err as Error).message),
  });
  const remove = useMutation({
    mutationFn: () => deleteBankAccount((editing as BankAccountDto).id),
    onSuccess: () => done(t("banks.deleted")),
    onError: (err) => setError((err as Error).message),
  });

  const valid = form.bank.trim() !== "" && form.accountHolder.trim() !== "" && form.iban.trim() !== "";

  return (
    <div className="space-y-3">
      {accounts.data && accounts.data.length > 0 ? (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("banks.bank")}</TableHead>
                <TableHead>{t("banks.holder")}</TableHead>
                <TableHead>IBAN</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.data.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.bankName}</TableCell>
                  <TableCell>{a.accountHolder}</TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs">{formatIban(a.iban)}</TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => setEditing(a)}>
                      {t("common:actions.edit")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("banks.none")}</p>
      )}
      <Button variant="outline" onClick={() => setEditing("new")}>
        {t("banks.add")}
      </Button>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing === "new" ? t("banks.add") : t("banks.edit")}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) save.mutate();
            }}
          >
            <div className="space-y-2">
              <Label>{t("banks.bank")}</Label>
              <Combobox
                aria-label={t("banks.bank")}
                value={form.bank || null}
                onChange={(v) => setForm((f) => ({ ...f, bank: v ?? "" }))}
                placeholder={t("banks.chooseBank")}
                allowOther
                options={banks.map((b) => ({ value: b.code, label: b.name }))}
              />
              <p className="text-xs text-muted-foreground">{t("banks.otherHint")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bank-holder">{t("banks.holder")}</Label>
              <Input id="bank-holder" value={form.accountHolder} onChange={(e) => setForm((f) => ({ ...f, accountHolder: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bank-iban">IBAN</Label>
              <Input
                id="bank-iban"
                className="font-mono"
                placeholder="AO06 0000 0000 0000 0000 0000 0"
                value={form.iban}
                onChange={(e) => setForm((f) => ({ ...f, iban: e.target.value }))}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={form.showOnQuotes} onChange={(e) => setForm((f) => ({ ...f, showOnQuotes: e.target.checked }))} />
              {t("banks.showOnQuotes")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={form.showOnInvoices} onChange={(e) => setForm((f) => ({ ...f, showOnInvoices: e.target.checked }))} />
              {t("banks.showOnInvoices")}
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              {editing && editing !== "new" && (
                <Button type="button" variant="outline" className="text-destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
                  {t("common:actions.delete")}
                </Button>
              )}
              <Button type="submit" className="flex-1" disabled={!valid || save.isPending}>
                {save.isPending ? t("common:actions.saving") : t("common:actions.save")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
