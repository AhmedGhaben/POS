import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DateInput } from "@/components/ui/date-input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMoney } from "@/features/business/use-money";
import { ApiError } from "@/lib/api-client";
import { ACCOUNTS_KEY, createEntry, createTemplate, fetchAccounts, fetchJournals, JOURNALS_KEY, type EntryDto, type TransactionType } from "../api";
import { centsToInput, centsToNumber, parseCents } from "../amounts";
import { draftTotals, newLine, type DraftLine, type EntryDraft } from "../entry-draft";
import { usePeriodName } from "../use-period-name";

/**
 * A manual entry (lançamento): debit and credit lines that must balance
 * before it can be saved. Posted entries never change; a mistake is
 * corrected with an estorno.
 */
export function EntryForm({ open, onClose, onSaved, initial, title }: { open: boolean; onClose: () => void; onSaved: (entry: EntryDto) => void; initial: EntryDraft; title?: string }) {
  const { t } = useTranslation("accounting");
  const money = useMoney();
  const periodName = usePeriodName();
  const journals = useQuery({ queryKey: JOURNALS_KEY, queryFn: fetchJournals, enabled: open });
  const accounts = useQuery({ queryKey: ACCOUNTS_KEY, queryFn: fetchAccounts, enabled: open });
  const [draft, setDraft] = React.useState<EntryDraft>(initial);
  React.useEffect(() => {
    if (open) setDraft(initial);
  }, [open, initial]);

  const accountOptions = React.useMemo(
    () => (accounts.data ?? []).filter((a) => a.category === "GM" && a.isActive).map((a) => ({ value: a.id, label: `${a.code} ${a.name}` })),
    [accounts.data],
  );
  const journalOptions = (journals.data ?? []).filter((j) => j.isActive && j.kind !== "OPENING").map((j) => ({ value: j.id, label: `${j.code} – ${j.name}` }));
  const totals = draftTotals(draft.lines);
  const balanced = totals.valid && totals.debit === totals.credit && totals.debit > 0;
  const linesReady = draft.lines.every((l) => (parseCents(l.debit) ?? 0) + (parseCents(l.credit) ?? 0) === 0 || l.accountId);
  const posting = draft.postingDate || draft.transactionDate;
  const yearEnd = posting.endsWith("-12-31");

  const setLine = (key: number, patch: Partial<DraftLine>) => setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  const [templateName, setTemplateName] = React.useState("");
  const saveTemplate = useMutation({
    mutationFn: () =>
      createTemplate({
        name: templateName.trim(),
        journalId: draft.journalId!,
        description: draft.description.trim(),
        transactionType: draft.transactionType,
        lines: draft.lines
          .filter((l) => l.accountId)
          .map((l) => {
            const d = parseCents(l.debit) ?? 0;
            const c = parseCents(l.credit) ?? 0;
            return { accountId: l.accountId!, side: c > 0 ? ("C" as const) : ("D" as const), amount: d || c ? centsToNumber(d || c) : null, description: l.description.trim() || null };
          }),
      }),
    onSuccess: () => {
      setTemplateName("");
      toast.success(t("templates.saved"));
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("failed")),
  });
  const save = useMutation({
    mutationFn: () =>
      createEntry({
        journalId: draft.journalId!,
        transactionDate: draft.transactionDate,
        postingDate: draft.postingDate || undefined,
        period: yearEnd && draft.period && draft.period > 12 ? draft.period : undefined,
        description: draft.description.trim(),
        transactionType: draft.transactionType,
        lines: draft.lines
          .map((l) => ({ accountId: l.accountId!, debit: centsToNumber(parseCents(l.debit) ?? 0), credit: centsToNumber(parseCents(l.credit) ?? 0), description: l.description.trim() || undefined }))
          .filter((l) => l.debit > 0 || l.credit > 0),
      }),
    onSuccess: (entry) => {
      toast.success(t("entries.saved", { id: entry.transactionId }));
      onSaved(entry);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("failed")),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{title ?? t("entries.newTitle")}</DialogTitle>
          <DialogDescription>{t("entries.newHint")}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (balanced && linesReady && draft.journalId && draft.description.trim()) save.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="entry-journal">{t("entries.journal")}</Label>
              <Combobox id="entry-journal" value={draft.journalId} onChange={(v) => setDraft((d) => ({ ...d, journalId: v }))} options={journalOptions} placeholder={t("entries.chooseJournal")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="entry-date">{t("entries.transactionDate")}</Label>
              <DateInput id="entry-date" value={draft.transactionDate} onChange={(v) => setDraft((d) => ({ ...d, transactionDate: v }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="entry-posting">{t("entries.postingDate")}</Label>
              <DateInput id="entry-posting" value={draft.postingDate} onChange={(v) => setDraft((d) => ({ ...d, postingDate: v }))} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="entry-description">{t("entries.description")}</Label>
              <Input id="entry-description" value={draft.description} maxLength={200} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="entry-type">{t("entries.type")}</Label>
              <Combobox
                id="entry-type"
                value={draft.transactionType}
                onChange={(v) => v && setDraft((d) => ({ ...d, transactionType: v as TransactionType }))}
                options={(["N", "R", "A", "J"] as const).map((k) => ({ value: k, label: `${k} – ${t(`entries.types.${k}`)}` }))}
              />
            </div>
            {yearEnd && (
              <div className="space-y-1">
                <Label htmlFor="entry-period">{t("entries.period")}</Label>
                <Combobox
                  id="entry-period"
                  value={String(draft.period ?? 12)}
                  onChange={(v) => v && setDraft((d) => ({ ...d, period: Number(v) }))}
                  options={[12, 13, 14, 15].map((n) => ({ value: String(n), label: `${n} · ${periodName(Number(posting.slice(0, 4)), n)}` }))}
                />
              </div>
            )}
          </div>

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-2 font-medium">{t("entries.account")}</th>
                  <th className="w-32 p-2 text-right font-medium">{t("entries.debit")}</th>
                  <th className="w-32 p-2 text-right font-medium">{t("entries.credit")}</th>
                  <th className="p-2 font-medium">{t("entries.lineDescription")}</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {draft.lines.map((l, i) => (
                  <tr key={l.key} className="border-t">
                    <td className="min-w-64 p-1">
                      <Combobox aria-label={t("entries.accountOfLine", { n: i + 1 })} value={l.accountId} onChange={(v) => setLine(l.key, { accountId: v })} options={accountOptions} placeholder={t("entries.chooseAccount")} />
                    </td>
                    <td className="p-1">
                      <Input
                        aria-label={t("entries.debitOfLine", { n: i + 1 })}
                        inputMode="decimal"
                        className={`text-right ${parseCents(l.debit) === null ? "border-destructive" : ""}`}
                        value={l.debit}
                        onChange={(e) => setLine(l.key, { debit: e.target.value, ...(e.target.value ? { credit: "" } : {}) })}
                      />
                    </td>
                    <td className="p-1">
                      <Input
                        aria-label={t("entries.creditOfLine", { n: i + 1 })}
                        inputMode="decimal"
                        className={`text-right ${parseCents(l.credit) === null ? "border-destructive" : ""}`}
                        value={l.credit}
                        onChange={(e) => setLine(l.key, { credit: e.target.value, ...(e.target.value ? { debit: "" } : {}) })}
                      />
                    </td>
                    <td className="p-1">
                      <Input aria-label={t("entries.descriptionOfLine", { n: i + 1 })} value={l.description} maxLength={200} onChange={(e) => setLine(l.key, { description: e.target.value })} />
                    </td>
                    <td className="p-1">
                      <Button type="button" size="icon" variant="ghost" aria-label={t("entries.removeLine")} disabled={draft.lines.length <= 2} onClick={() => setDraft((d) => ({ ...d, lines: d.lines.filter((x) => x.key !== l.key) }))}>
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t bg-muted/30 font-medium">
                <tr>
                  <td className="p-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        // A new line takes what's still missing on the other side.
                        const gap = totals.debit - totals.credit;
                        setDraft((d) => ({ ...d, lines: [...d.lines, newLine(gap > 0 ? { credit: centsToInput(gap) } : gap < 0 ? { debit: centsToInput(-gap) } : {})] }));
                      }}
                    >
                      <Plus className="mr-1 h-4 w-4" aria-hidden />
                      {t("entries.addLine")}
                    </Button>
                  </td>
                  <td className="p-2 text-right" data-testid="entry-total-debit">{money(centsToNumber(totals.debit))}</td>
                  <td className="p-2 text-right" data-testid="entry-total-credit">{money(centsToNumber(totals.credit))}</td>
                  <td colSpan={2} className={`p-2 ${balanced ? "text-emerald-600" : "text-destructive"}`} role="status">
                    {balanced ? t("entries.balanced") : t("entries.difference", { amount: money(centsToNumber(Math.abs(totals.debit - totals.credit))) })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <Button type="submit" disabled={!balanced || !linesReady || !draft.journalId || !draft.description.trim() || save.isPending}>
            {t("entries.post")}
          </Button>
          <div className="flex flex-wrap items-end gap-2 border-t pt-3">
            <div className="space-y-1">
              <Label htmlFor="template-name">{t("templates.saveAs")}</Label>
              <Input id="template-name" className="w-64" value={templateName} maxLength={80} placeholder={t("templates.namePlaceholder")} onChange={(e) => setTemplateName(e.target.value)} />
            </div>
            <Button type="button" variant="outline" disabled={!templateName.trim() || !draft.journalId || !draft.description.trim() || saveTemplate.isPending} onClick={() => saveTemplate.mutate()}>
              {t("templates.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
