import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError } from "@/lib/api-client";
import { formatCalendarDate, formatDateTime } from "@/lib/format";
import { ACCOUNTING_KEY, ACCOUNTS_KEY, fetchAccounts, fetchIntegration, fetchMapping, INTEGRATION_KEY, MAPPING_KEY, runIntegration, setMapping, type MappingGroup, type SourceType } from "../api";

const SOURCE_TYPES: SourceType[] = ["FISCAL_DOCUMENT", "FISCAL_DOCUMENT_ANNULMENT", "PURCHASE", "SUPPLIER_PAYMENT", "EXPENSE", "SHIFT_DIFFERENCE", "CASH_MOVEMENT", "STOCK_ADJUSTMENT"];
const GROUPS: MappingGroup[] = ["sales", "iva", "payments", "stock", "cash", "expenses"];

/**
 * The integration monitor: what the POS has that isn't in the books yet,
 * what couldn't be posted and why, and the accounts each kind of posting uses.
 */
export function IntegrationTab({ canWrite }: { canWrite: boolean }) {
  const { t } = useTranslation("accounting");
  const queryClient = useQueryClient();
  const monitor = useQuery({ queryKey: INTEGRATION_KEY, queryFn: fetchIntegration });
  const mapping = useQuery({ queryKey: MAPPING_KEY, queryFn: fetchMapping });
  const accounts = useQuery({ queryKey: ACCOUNTS_KEY, queryFn: fetchAccounts });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ACCOUNTING_KEY });
  const fail = (error: unknown) => toast.error(error instanceof ApiError ? error.message : t("failed"));
  const run = useMutation({
    mutationFn: runIntegration,
    onSuccess: (r) => {
      refresh();
      toast.success(t("integration.ran", { posted: r.posted, skipped: r.skipped, failed: r.failed }));
    },
    onError: fail,
  });
  const save = useMutation({ mutationFn: (v: { key: string; accountId: string | null }) => setMapping(v.key, v.accountId), onSuccess: () => (refresh(), toast.success(t("saved"))), onError: fail });
  const options = React.useMemo(() => (accounts.data ?? []).filter((a) => a.category === "GM" && a.isActive).map((a) => ({ value: a.id, label: `${a.code} ${a.name}` })), [accounts.data]);
  const m = monitor.data;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>{t("integration.title")}</CardTitle>
            <CardDescription>{t("integration.description")}</CardDescription>
          </div>
          {canWrite && (
            <Button onClick={() => run.mutate()} disabled={run.isPending}>
              <Play className="mr-2 h-4 w-4" aria-hidden />
              {run.isPending ? t("integration.running") : t("integration.run")}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {m && (
            <>
              <p className="text-sm text-muted-foreground">
                {t("integration.summary", { posted: m.postedTotal, pending: m.pendingTotal })}
                {m.lastPostedAt && ` · ${t("integration.lastPosted", { at: formatDateTime(m.lastPostedAt) })}`}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {SOURCE_TYPES.map((type) => (
                  <div key={type} className="rounded-md border p-2">
                    <p className="text-xl font-semibold" data-testid={`pending-${type}`}>{m.pending[type] ?? 0}</p>
                    <p className="text-xs text-muted-foreground">{t(`integration.sources.${type}`)}</p>
                  </div>
                ))}
              </div>
              <div>
                <h3 className="mb-2 font-medium">{t("integration.errors")}</h3>
                {m.errors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("integration.noErrors")}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("entries.date")}</TableHead>
                        <TableHead>{t("integration.record")}</TableHead>
                        <TableHead>{t("integration.reason")}</TableHead>
                        <TableHead className="text-right">{t("integration.attempts")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {m.errors.map((e) => (
                        <TableRow key={`${e.sourceType}-${e.sourceId}`}>
                          <TableCell className="whitespace-nowrap">{formatCalendarDate(e.documentDate)}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{t(`integration.sources.${e.sourceType}`)}</Badge>
                            {e.documentNo && <span className="ml-2 font-mono text-xs">{e.documentNo}</span>}
                          </TableCell>
                          <TableCell className="text-sm text-destructive">{e.message}</TableCell>
                          <TableCell className="text-right">{e.attempts}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("mapping.title")}</CardTitle>
          <CardDescription>{t("mapping.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {GROUPS.map((group) => (
            <div key={group}>
              <h3 className="mb-2 font-medium">{t(`mapping.groups.${group}`)}</h3>
              <div className="grid gap-2">
                {(mapping.data ?? [])
                  .filter((k) => k.group === group)
                  .map((k) => (
                    <div key={k.key} className="grid items-center gap-2 sm:grid-cols-[18rem_1fr_auto]">
                      <span className="text-sm">
                        {t(`mapping.keys.${k.key.replace(/\./g, "_") as "stock"}`, { defaultValue: k.key })}
                        <span className="block font-mono text-xs text-muted-foreground">{k.key}</span>
                      </span>
                      {canWrite ? (
                        <Combobox
                          aria-label={k.key}
                          value={k.custom ? (k.account?.id ?? null) : null}
                          onChange={(v) => save.mutate({ key: k.key, accountId: v })}
                          options={options}
                          clearLabel={t("mapping.useDefault")}
                          placeholder={k.account ? `${k.account.code} ${k.account.name}` : k.defaultCode === "@till" ? t("mapping.till") : k.defaultCode === "@bank" ? t("mapping.bank") : (k.defaultCode ?? "")}
                        />
                      ) : (
                        <span className="text-sm">{k.account ? `${k.account.code} ${k.account.name}` : k.defaultCode === "@till" ? t("mapping.till") : t("mapping.bank")}</span>
                      )}
                      <span className="text-xs text-muted-foreground">{k.custom ? t("mapping.custom") : t("mapping.default")}</span>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
