import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMoney } from "@/features/business/use-money";
import { ApiError } from "@/lib/api-client";
import { ACCOUNTS_KEY, fetchAccounts, postOpening } from "../api";
import { centsToNumber } from "../amounts";
import { parseOpeningCsv } from "../opening-csv";

/**
 * Opening balances for a year: pasted or loaded from a spreadsheet saved
 * as CSV (account code; debit; credit), checked, then posted as one
 * entry in the Abertura journal (period 0).
 */
export function OpeningBalancesDialog({ open, onClose, onDone, defaultYear }: { open: boolean; onClose: () => void; onDone: () => void; defaultYear: number }) {
  const { t } = useTranslation("accounting");
  const money = useMoney();
  const accounts = useQuery({ queryKey: ACCOUNTS_KEY, queryFn: fetchAccounts, enabled: open });
  const [year, setYear] = React.useState(defaultYear);
  const [text, setText] = React.useState("");
  React.useEffect(() => {
    if (open) {
      setYear(defaultYear);
      setText("");
    }
  }, [open, defaultYear]);
  const rows = React.useMemo(() => parseOpeningCsv(text, accounts.data ?? []), [text, accounts.data]);
  const names = new Map((accounts.data ?? []).map((a) => [a.code, a.name]));
  const debit = rows.reduce((s, r) => s + r.debit, 0);
  const credit = rows.reduce((s, r) => s + r.credit, 0);
  const errors = rows.filter((r) => r.error);
  const ready = rows.length >= 2 && !errors.length && debit === credit && debit > 0;
  const post = useMutation({
    mutationFn: () => postOpening(year, rows.map((r) => ({ accountId: r.accountId!, debit: centsToNumber(r.debit), credit: centsToNumber(r.credit) }))),
    onSuccess: (e) => {
      toast.success(t("entries.saved", { id: e.transactionId }));
      onDone();
      onClose();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("failed")),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("opening.title")}</DialogTitle>
          <DialogDescription>{t("opening.hint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
          <div className="space-y-1">
            <Label htmlFor="opening-year">{t("entries.year")}</Label>
            <Input id="opening-year" type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || year)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="opening-file">{t("opening.file")}</Label>
            <Input
              id="opening-file"
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) setText(await file.text());
              }}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="opening-text">{t("opening.paste")}</Label>
          <Textarea id="opening-text" rows={6} className="font-mono text-xs" placeholder={"11.5;800000,00;\n45.1.1;200000,00;\n51.1;;1000000,00"} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        {rows.length > 0 && (
          <div className="max-h-64 overflow-y-auto rounded-md border text-sm">
            <table className="w-full">
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line} className="border-b">
                    <td className="p-1 font-mono text-xs">{r.code}</td>
                    <td className="p-1">{r.error ? <span className="text-destructive">{t(`opening.errors.${r.error as "amount"}`, { line: r.line })}</span> : names.get(r.code)}</td>
                    <td className="p-1 text-right">{r.debit ? money(centsToNumber(r.debit)) : ""}</td>
                    <td className="p-1 text-right">{r.credit ? money(centsToNumber(r.credit)) : ""}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="font-medium">
                <tr>
                  <td colSpan={2} className={`p-1 ${debit === credit ? "text-emerald-600" : "text-destructive"}`}>
                    {debit === credit ? t("entries.balanced") : t("entries.difference", { amount: money(centsToNumber(Math.abs(debit - credit))) })}
                  </td>
                  <td className="p-1 text-right">{money(centsToNumber(debit))}</td>
                  <td className="p-1 text-right">{money(centsToNumber(credit))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <Button disabled={!ready || post.isPending} onClick={() => post.mutate()}>
          {t("opening.post", { year })}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
