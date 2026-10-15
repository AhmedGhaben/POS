import * as React from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AGT_STATUS_KEY, correctSubmission, fetchAgtStatus, fetchAgtSubmissions, retrySubmission, type AgtStatus, type AgtSubmissionDto } from "@/features/agt/api";
import { useMoney } from "@/features/business/use-money";
import { FiscalDocumentDialog } from "@/features/fiscal/components/FiscalDocumentDialog";
import { ApiError } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";

const PAGE = 25;
const VARIANT: Record<AgtStatus, "default" | "secondary" | "destructive" | "outline"> = { QUEUED: "outline", SENT: "outline", VALID: "secondary", REJECTED: "destructive" };

/**
 * E-invoicing with AGT (docs/plans/ANGOLA.md, phase 9): every document on
 * its way, what AGT accepted, and what it rejected with its errors. A
 * rejected document is corrected by issuing a new one (a new number) and
 * linking it here; it goes to AGT as the correction.
 */
export function AgtPage() {
  const { t } = useTranslation(["accounts", "common"]);
  const money = useMoney();
  const queryClient = useQueryClient();
  const [status, setStatus] = React.useState<AgtStatus | null>(null);
  const [page, setPage] = React.useState(0);
  const [viewing, setViewing] = React.useState<string | null>(null);
  const [correcting, setCorrecting] = React.useState<AgtSubmissionDto | null>(null);
  const [replacement, setReplacement] = React.useState<string | null>(null);
  React.useEffect(() => setPage(0), [status]);
  const summary = useQuery({ queryKey: AGT_STATUS_KEY, queryFn: fetchAgtStatus });
  const list = useQuery({ queryKey: ["agt", "submissions", status, page], queryFn: () => fetchAgtSubmissions(status, PAGE, page * PAGE), placeholderData: keepPreviousData });
  // New documents not sent yet: candidates to correct a rejected one.
  const candidates = useQuery({ queryKey: ["agt", "submissions", "QUEUED", "candidates"], queryFn: () => fetchAgtSubmissions("QUEUED", 100, 0), enabled: !!correcting });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["agt"] });
  const fail = (error: unknown) => toast.error(error instanceof ApiError ? error.message : t("failed"));
  const retry = useMutation({ mutationFn: retrySubmission, onSuccess: () => (refresh(), toast.success(t("agt.retried"))), onError: fail });
  const correct = useMutation({
    mutationFn: () => correctSubmission(correcting!.id, replacement!),
    onSuccess: () => {
      refresh();
      toast.success(t("agt.corrected"));
      setCorrecting(null);
      setReplacement(null);
    },
    onError: fail,
  });
  const s = summary.data;
  const total = list.data?.total ?? 0;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("agt.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {!s ? t("common:actions.loading") : !s.enabled ? t("agt.off") : !s.businessActive ? t("agt.businessOff") : t("agt.on", { environment: t(`agt.environments.${s.environment}`) })}
        </p>
      </div>
      {s && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(["QUEUED", "SENT", "VALID", "REJECTED"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setStatus(status === k ? null : k)}
              className={`rounded-md border p-3 text-left ${status === k ? "border-primary" : ""}`}
            >
              <p className="text-2xl font-semibold" data-testid={`agt-count-${k}`}>{s.counts[k]}</p>
              <p className="text-sm text-muted-foreground">{t(`agt.statuses.${k}`)}</p>
            </button>
          ))}
        </div>
      )}
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("agt.document")}</TableHead>
                <TableHead>{t("agt.customer")}</TableHead>
                <TableHead className="text-right">{t("agt.total")}</TableHead>
                <TableHead>{t("agt.status")}</TableHead>
                <TableHead>{t("agt.details")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data?.items.map((sub) => (
                <TableRow key={sub.id}>
                  <TableCell>
                    <button type="button" className="font-mono text-xs underline-offset-2 hover:underline" onClick={() => setViewing(sub.document.id)}>
                      {sub.document.documentNo}
                    </button>
                    <span className="block text-xs text-muted-foreground">{formatDateTime(sub.createdAt)}</span>
                  </TableCell>
                  <TableCell>{sub.document.buyerName}</TableCell>
                  <TableCell className="text-right">{money(sub.document.grossTotal)}</TableCell>
                  <TableCell>
                    <Badge variant={VARIANT[sub.status]}>{t(`agt.statuses.${sub.status}`)}</Badge>
                    {sub.correctionOfDocumentNo && <span className="block text-xs text-muted-foreground">{t("agt.correctionOf", { number: sub.correctionOfDocumentNo })}</span>}
                  </TableCell>
                  <TableCell className="max-w-sm text-xs">
                    {sub.errors?.map((e) => (
                      <p key={e.code + e.description}>
                        <span className="font-mono">{e.code}</span> {e.description}
                      </p>
                    ))}
                    {sub.status === "QUEUED" && sub.lastError && <p className="text-muted-foreground">{t("agt.willRetry", { at: formatDateTime(sub.nextAttemptAt), error: sub.lastError.slice(0, 120) })}</p>}
                    {sub.correctedByDocumentId && <p className="text-muted-foreground">{t("agt.correctedAlready")}</p>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {sub.status === "QUEUED" && sub.lastError && (
                      <Button size="sm" variant="ghost" onClick={() => retry.mutate(sub.id)}>
                        {t("agt.retryNow")}
                      </Button>
                    )}
                    {sub.status === "REJECTED" && !sub.correctedByDocumentId && (
                      <Button size="sm" variant="ghost" onClick={() => setCorrecting(sub)}>
                        {t("agt.correct")}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {list.data?.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="p-6 text-center text-muted-foreground">
                    {t("agt.empty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          {t("agt.previous")}
        </Button>
        <Button variant="outline" size="sm" disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}>
          {t("agt.next")}
        </Button>
      </div>

      <Dialog open={!!correcting} onOpenChange={(o) => !o && setCorrecting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("agt.correctTitle", { number: correcting?.document.documentNo ?? "" })}</DialogTitle>
            <DialogDescription>{t("agt.correctDescription")}</DialogDescription>
          </DialogHeader>
          <Combobox
            aria-label={t("agt.newDocument")}
            value={replacement}
            onChange={setReplacement}
            placeholder={t("agt.newDocument")}
            options={(candidates.data?.items ?? [])
              .filter((c) => c.attempts === 0 && !c.correctionOfDocumentNo && c.document.documentType === correcting?.document.documentType)
              .map((c) => ({ value: c.document.id, label: c.document.documentNo, description: `${c.document.buyerName} · ${money(c.document.grossTotal)}` }))}
          />
          <Button disabled={!replacement || correct.isPending} onClick={() => correct.mutate()}>
            {t("agt.sendCorrection")}
          </Button>
        </DialogContent>
      </Dialog>
      <FiscalDocumentDialog documentId={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
