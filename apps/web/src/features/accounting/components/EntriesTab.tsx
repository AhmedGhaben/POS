import * as React from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookCopy, ChevronDown, ChevronRight, Plus, Scale, Search, Undo2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { DateInput } from "@/components/ui/date-input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMoney } from "@/features/business/use-money";
import { ApiError } from "@/lib/api-client";
import { formatCalendarDate } from "@/lib/format";
import { ACCOUNTING_KEY, ENTRIES_KEY, fetchEntries, fetchJournals, JOURNALS_KEY, reverseEntry, type EntryDto } from "../api";
import { usePeriodName } from "../use-period-name";
import { draftFromTemplate, emptyDraft, type EntryDraft } from "../entry-draft";
import { OpeningBalancesDialog } from "./OpeningBalancesDialog";
import { TemplatesDialog } from "./TemplatesDialog";
import { EntryForm } from "./EntryForm";

const PAGE = 25;

/** Every entry, manual and automatic, newest first; post a new one or reverse one. */
export function EntriesTab({ canWrite, today, newDraft }: { canWrite: boolean; today: string; newDraft?: EntryDraft | null }) {
  const { t } = useTranslation("accounting");
  const money = useMoney();
  const periodName = usePeriodName();
  const queryClient = useQueryClient();
  const [year, setYear] = React.useState(Number(today.slice(0, 4)));
  const [period, setPeriod] = React.useState<number | null>(null);
  const [journalId, setJournalId] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [open, setOpen] = React.useState<Set<string>>(new Set());
  const [creating, setCreating] = React.useState<EntryDraft | null>(null);
  const [reversing, setReversing] = React.useState<EntryDto | null>(null);
  const [reverseDate, setReverseDate] = React.useState(today);
  const [showTemplates, setShowTemplates] = React.useState(false);
  const [showOpening, setShowOpening] = React.useState(false);
  React.useEffect(() => setPage(0), [year, period, journalId, search]);
  React.useEffect(() => {
    if (newDraft) setCreating(newDraft);
  }, [newDraft]);

  const journals = useQuery({ queryKey: JOURNALS_KEY, queryFn: fetchJournals });
  const filters = { year, period: period ?? undefined, journalId: journalId ?? undefined, search: search.trim() || undefined, take: PAGE, skip: page * PAGE };
  const entries = useQuery({ queryKey: [...ENTRIES_KEY, filters], queryFn: () => fetchEntries(filters), placeholderData: keepPreviousData });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ACCOUNTING_KEY });
  const reverse = useMutation({
    mutationFn: () => reverseEntry(reversing!.id, { date: reverseDate }),
    onSuccess: (e) => {
      refresh();
      setReversing(null);
      toast.success(t("entries.reversed", { id: e.transactionId }));
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("failed")),
  });
  const toggle = (id: string) => setOpen((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])));
  const total = entries.data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-28 space-y-1">
          <Label htmlFor="entries-year">{t("entries.year")}</Label>
          <Input id="entries-year" type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || year)} />
        </div>
        <div className="w-56 space-y-1">
          <Label htmlFor="entries-period">{t("entries.period")}</Label>
          <Combobox
            id="entries-period"
            value={period === null ? null : String(period)}
            onChange={(v) => setPeriod(v === null ? null : Number(v))}
            clearLabel={t("entries.allPeriods")}
            placeholder={t("entries.allPeriods")}
            options={Array.from({ length: 16 }, (_, n) => ({ value: String(n), label: `${n} · ${periodName(year, n)}` }))}
          />
        </div>
        <div className="w-56 space-y-1">
          <Label htmlFor="entries-journal">{t("entries.journal")}</Label>
          <Combobox
            id="entries-journal"
            value={journalId}
            onChange={setJournalId}
            clearLabel={t("entries.allJournals")}
            placeholder={t("entries.allJournals")}
            options={(journals.data ?? []).map((j) => ({ value: j.id, label: `${j.code} – ${j.name}` }))}
          />
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input className="pl-8" placeholder={t("entries.search")} aria-label={t("entries.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {canWrite && (
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setShowOpening(true)}>
              <Scale className="mr-2 h-4 w-4" aria-hidden />
              {t("opening.button")}
            </Button>
            <Button variant="outline" onClick={() => setShowTemplates(true)}>
              <BookCopy className="mr-2 h-4 w-4" aria-hidden />
              {t("templates.button")}
            </Button>
            <Button onClick={() => setCreating(emptyDraft(today))}>
              <Plus className="mr-2 h-4 w-4" aria-hidden />
              {t("entries.new")}
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>{t("entries.date")}</TableHead>
                <TableHead>{t("entries.transactionId")}</TableHead>
                <TableHead>{t("entries.description")}</TableHead>
                <TableHead className="text-right">{t("entries.amount")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.data?.items.map((e) => (
                <React.Fragment key={e.id}>
                  <TableRow className="cursor-pointer" onClick={() => toggle(e.id)}>
                    <TableCell>{open.has(e.id) ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatCalendarDate(e.postingDate)}</TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {e.journal.code} {e.docArchivalNumber}
                      <span className="block text-muted-foreground">{t("entries.periodShort", { n: e.period })} · {e.transactionType}</span>
                    </TableCell>
                    <TableCell>
                      {e.description}
                      <span className="ml-2">
                        <Badge variant="outline">{t(`entries.origins.${e.origin as "MANUAL"}`, { defaultValue: e.origin })}</Badge>
                        {e.reversedBy && (
                          <Badge variant="secondary" className="ml-1">
                            {t("entries.reversedBadge")}
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{money(e.totalDebit)}</TableCell>
                    <TableCell className="text-right">
                      {canWrite && !e.reversedBy && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setReverseDate(today);
                            setReversing(e);
                          }}
                        >
                          <Undo2 className="mr-1 h-4 w-4" aria-hidden />
                          {t("entries.reverse")}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                  {open.has(e.id) && (
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableCell />
                      <TableCell colSpan={5}>
                        <p className="mb-2 text-xs text-muted-foreground">
                          {t("entries.details", { id: e.transactionId, date: formatCalendarDate(e.transactionDate) })}
                          {e.reverses && ` · ${t("entries.reversesInfo", { id: e.reverses.transactionId })}`}
                          {e.reversedBy && ` · ${t("entries.reversedByInfo", { id: e.reversedBy.transactionId })}`}
                        </p>
                        <table className="w-full text-sm">
                          <tbody>
                            {e.lines.map((l) => (
                              <tr key={l.lineNumber}>
                                <td className="py-0.5 font-mono text-xs">{l.account.code}</td>
                                <td className="py-0.5">
                                  {l.account.name}
                                  {l.description !== e.description && <span className="text-muted-foreground"> · {l.description}</span>}
                                  {l.sourceDocumentId && <span className="ml-1 font-mono text-xs text-muted-foreground">[{l.sourceDocumentId}]</span>}
                                </td>
                                <td className="py-0.5 text-right">{Number(l.debit) ? money(l.debit) : ""}</td>
                                <td className="py-0.5 text-right">{Number(l.credit) ? money(l.credit) : ""}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
              {entries.data?.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="p-6 text-center text-muted-foreground">
                    {t("entries.empty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
        {t("entries.count", { count: total })}
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          {t("previous")}
        </Button>
        <Button variant="outline" size="sm" disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}>
          {t("next")}
        </Button>
      </div>

      {creating && (
        <EntryForm
          open={!!creating}
          initial={creating}
          onClose={() => setCreating(null)}
          onSaved={() => {
            setCreating(null);
            refresh();
          }}
        />
      )}
      <TemplatesDialog
        open={showTemplates}
        canWrite={canWrite}
        onClose={() => setShowTemplates(false)}
        onUse={(tpl) => {
          setShowTemplates(false);
          setCreating(draftFromTemplate(tpl, today));
        }}
      />
      <OpeningBalancesDialog open={showOpening} onClose={() => setShowOpening(false)} onDone={refresh} defaultYear={Number(today.slice(0, 4))} />
      <Dialog open={!!reversing} onOpenChange={(o) => !o && setReversing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("entries.reverseTitle", { id: reversing?.transactionId ?? "" })}</DialogTitle>
            <DialogDescription>{t("entries.reverseHint")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reverse-date">{t("entries.reverseDate")}</Label>
            <DateInput id="reverse-date" value={reverseDate} onChange={setReverseDate} />
          </div>
          <Button disabled={reverse.isPending || !reverseDate} onClick={() => reverse.mutate()}>
            {t("entries.reverse")}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
