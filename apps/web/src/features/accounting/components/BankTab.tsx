import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMoney } from "@/features/business/use-money";
import { ApiError } from "@/lib/api-client";
import { formatCalendarDate } from "@/lib/format";
import {
  ACCOUNTS_KEY,
  autoMatchStatement,
  fetchAccounts,
  fetchStatement,
  fetchStatements,
  importStatement,
  matchBankLine,
  parseStatement,
  postBankLine,
  unmatchBankLine,
  type BankMapping,
} from "../api";

const FIELDS = ["date", "description", "amount", "debit", "credit", "reference"] as const;
type Field = (typeof FIELDS)[number];
const column = (i: number) => String.fromCharCode(65 + i);

/**
 * Bank reconciliation: import the bank's statement (CSV or Excel, saying
 * which column is what), let it match the bank account's postings, match
 * the rest by hand, and post what's only at the bank (fees, interest).
 */
export function BankTab({ canWrite }: { canWrite: boolean }) {
  const { t } = useTranslation("accounting");
  const money = useMoney();
  const queryClient = useQueryClient();
  const accounts = useQuery({ queryKey: ACCOUNTS_KEY, queryFn: fetchAccounts });
  const statements = useQuery({ queryKey: ["accounting", "bank"], queryFn: fetchStatements });
  const [selected, setSelected] = React.useState<string | null>(null);
  const statement = useQuery({ queryKey: ["accounting", "bank", selected], queryFn: () => fetchStatement(selected!), enabled: !!selected });
  const [bankId, setBankId] = React.useState<string | null>(null);
  const [file, setFile] = React.useState<{ name: string; rows: string[][] } | null>(null);
  const [mapping, setMapping] = React.useState<Partial<Record<Field, number>>>({});
  const [skipRows, setSkipRows] = React.useState(1);
  const [counter, setCounter] = React.useState<Record<string, string | null>>({});
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["accounting"] });
  const fail = (error: unknown) => toast.error(error instanceof ApiError ? error.message : t("failed"));

  const bankOptions = (accounts.data ?? []).filter((a) => a.category === "GM" && a.isActive && a.classNo === 4).map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }));
  const otherOptions = (accounts.data ?? []).filter((a) => a.category === "GM" && a.isActive).map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }));
  const columns = file ? Math.max(...file.rows.slice(0, 20).map((r) => r.length)) : 0;
  const columnOptions = Array.from({ length: columns }, (_, i) => ({ value: String(i), label: `${t("bank.column")} ${column(i)}${file?.rows[0]?.[i] ? `: ${file.rows[0][i]}` : ""}` }));
  const ready = !!bankId && !!file && mapping.date !== undefined && mapping.description !== undefined && (mapping.amount !== undefined || mapping.debit !== undefined || mapping.credit !== undefined);

  const parse = useMutation({
    mutationFn: async (f: File) => {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(f);
      });
      return { name: f.name, rows: (await parseStatement(f.name, dataUrl)).rows };
    },
    onSuccess: (r) => {
      setFile(r);
      setMapping({});
    },
    onError: fail,
  });
  const doImport = useMutation({
    mutationFn: () => importStatement({ accountId: bankId!, fileName: file!.name, rows: file!.rows, mapping: { ...mapping, skipRows } as BankMapping }),
    onSuccess: (r) => {
      refresh();
      setFile(null);
      setSelected(r.id);
      toast.success(t("bank.imported", { lines: r.lines, matched: r.matched }));
    },
    onError: fail,
  });
  const auto = useMutation({ mutationFn: () => autoMatchStatement(selected!), onSuccess: (r) => (refresh(), toast.success(t("bank.autoMatched", { count: r.matched }))), onError: fail });
  const post = useMutation({ mutationFn: (v: { lineId: string; accountId: string }) => postBankLine(v.lineId, v.accountId), onSuccess: (r) => (refresh(), toast.success(t("entries.saved", { id: r.transactionId }))), onError: fail });
  const match = useMutation({ mutationFn: (v: { lineId: string; ledgerLineId: string }) => matchBankLine(v.lineId, v.ledgerLineId), onSuccess: refresh, onError: fail });
  const unmatch = useMutation({ mutationFn: unmatchBankLine, onSuccess: refresh, onError: fail });
  const s = statement.data;

  return (
    <div className="space-y-4">
      {canWrite && (
        <Card>
          <CardHeader>
            <CardTitle>{t("bank.importTitle")}</CardTitle>
            <CardDescription>{t("bank.importHint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="bank-account">{t("bank.account")}</Label>
                <Combobox id="bank-account" value={bankId} onChange={setBankId} options={bankOptions} placeholder={t("entries.chooseAccount")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bank-file">{t("bank.file")}</Label>
                <Input
                  id="bank-file"
                  type="file"
                  accept=".csv,.txt,.xlsx,text/csv"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) parse.mutate(f);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
            {file && (
              <>
                <div className="overflow-x-auto rounded-md border text-xs">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        {Array.from({ length: columns }, (_, i) => (
                          <th key={i} className="p-1 text-left font-medium">
                            {column(i)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {file.rows.slice(0, 6).map((r, i) => (
                        <tr key={i} className={`border-t ${i < skipRows ? "text-muted-foreground line-through" : ""}`}>
                          {Array.from({ length: columns }, (_, j) => (
                            <td key={j} className="whitespace-nowrap p-1">
                              {r[j]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {FIELDS.map((f) => (
                    <div key={f} className="space-y-1">
                      <Label htmlFor={`bank-map-${f}`}>{t(`bank.fields.${f}`)}</Label>
                      <Combobox
                        id={`bank-map-${f}`}
                        value={mapping[f] === undefined ? null : String(mapping[f])}
                        onChange={(v) => setMapping((m) => ({ ...m, [f]: v === null ? undefined : Number(v) }))}
                        clearLabel={t("bank.none")}
                        placeholder={t("bank.none")}
                        options={columnOptions}
                      />
                    </div>
                  ))}
                  <div className="space-y-1">
                    <Label htmlFor="bank-skip">{t("bank.skipRows")}</Label>
                    <Input id="bank-skip" type="number" min={0} value={skipRows} onChange={(e) => setSkipRows(Math.max(0, Number(e.target.value) || 0))} />
                  </div>
                </div>
                <Button disabled={!ready || doImport.isPending} onClick={() => doImport.mutate()}>
                  <Upload className="mr-2 h-4 w-4" aria-hidden />
                  {t("bank.import")}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-md space-y-1">
          <Label htmlFor="bank-statement">{t("bank.statement")}</Label>
          <Combobox
            id="bank-statement"
            value={selected}
            onChange={setSelected}
            placeholder={t("bank.chooseStatement")}
            options={(statements.data ?? []).map((st) => ({ value: st.id, label: `${st.fileName} · ${formatCalendarDate(st.periodFrom)}–${formatCalendarDate(st.periodTo)}`, description: t("bank.lines", { count: st._count.lines }) }))}
          />
        </div>
        {canWrite && selected && (
          <Button variant="outline" onClick={() => auto.mutate()} disabled={auto.isPending}>
            {t("bank.autoMatch")}
          </Button>
        )}
      </div>

      {s && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {s.account.code} {s.account.name}
            </CardTitle>
            <CardDescription>{t("bank.totals", { statement: money(s.totals.statement), matched: money(s.totals.matched), open: money(s.totals.open) })}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("entries.date")}</TableHead>
                  <TableHead>{t("entries.description")}</TableHead>
                  <TableHead className="text-right">{t("entries.amount")}</TableHead>
                  <TableHead>{t("bank.state")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.lines.map((l) => {
                  const candidates = s.unexplained.filter((u) => u.amount === l.amount);
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="whitespace-nowrap">{formatCalendarDate(l.date)}</TableCell>
                      <TableCell>
                        {l.description}
                        {l.reference && <span className="ml-1 font-mono text-xs text-muted-foreground">{l.reference}</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">{money(l.amount)}</TableCell>
                      <TableCell>
                        {l.matched ? (
                          <Badge variant="secondary" title={l.matched.transactionId}>
                            {t(`bank.kinds.${l.matchKind as "AUTO"}`)} · {l.matched.transactionId}
                          </Badge>
                        ) : (
                          <Badge variant="outline">{t("bank.open")}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="min-w-72">
                        {canWrite && l.matched && l.matchKind !== "POSTED" && (
                          <Button size="sm" variant="ghost" onClick={() => unmatch.mutate(l.id)}>
                            {t("bank.unmatch")}
                          </Button>
                        )}
                        {canWrite && !l.matched && (
                          <div className="flex flex-wrap items-center gap-1">
                            {candidates.map((c) => (
                              <Button key={c.lineId} size="sm" variant="outline" onClick={() => match.mutate({ lineId: l.id, ledgerLineId: c.lineId })}>
                                {t("bank.matchWith", { id: c.transactionId })}
                              </Button>
                            ))}
                            <div className="w-56">
                              <Combobox aria-label={t("bank.counterAccount")} value={counter[l.id] ?? null} onChange={(v) => setCounter((c) => ({ ...c, [l.id]: v }))} options={otherOptions} placeholder={t("bank.counterAccount")} />
                            </div>
                            <Button size="sm" disabled={!counter[l.id] || post.isPending} onClick={() => post.mutate({ lineId: l.id, accountId: counter[l.id]! })}>
                              {t("bank.post")}
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div>
              <h3 className="mb-1 font-medium">{t("bank.unexplained")}</h3>
              {s.unexplained.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("bank.nothingUnexplained")}</p>
              ) : (
                <ul className="text-sm">
                  {s.unexplained.map((u) => (
                    <li key={u.lineId} className="flex gap-3">
                      <span>{formatCalendarDate(u.date)}</span>
                      <span className="font-mono text-xs">{u.transactionId}</span>
                      <span className="flex-1">{u.description}</span>
                      <span>{money(u.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
