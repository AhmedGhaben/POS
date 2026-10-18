import * as React from "react";
import { createPortal } from "react-dom";
import { useMutation } from "@tanstack/react-query";
import type { FiscalDocumentDto } from "@pos/shared";
import { Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { FiscalA4 } from "@/features/fiscal/components/FiscalA4";
import { REPRINT_LABEL } from "@/features/fiscal/fiscal-text";
import { ApiError, apiClient, saveFile } from "@/lib/api-client";
import { fetchArchiveDocuments } from "../api";
import { completeArchive, documentPdf, exactPdfs, settled, type ArchivePdf } from "../archive";

type Progress = { done: number; total: number } | null;

/**
 * The period's document archive as one ZIP (docs/ACCOUNTING-DECISIONS.md,
 * B2a). The server gives the SAF-T files, attachments and index; every
 * fiscal document is drawn here, off screen, with the A4 template it prints
 * with (as a "2ª Via") and turned into a PDF one after another.
 */
export function ArchiveCard({ today }: { today: string }) {
  const { t } = useTranslation("accounting");
  const [from, setFrom] = React.useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = React.useState(today);
  const [progress, setProgress] = React.useState<Progress>(null);
  // The document being drawn, and who's waiting for its PDF.
  const [stage, setStage] = React.useState<{ doc: FiscalDocumentDto; done: (pdf: Uint8Array) => void; fail: (e: unknown) => void } | null>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!stage || !stageRef.current) return;
    const container = stageRef.current;
    let cancelled = false;
    void settled(container)
      .then(() => (cancelled ? null : documentPdf(container)))
      .then((pdf) => pdf && stage.done(pdf), stage.fail);
    return () => {
      cancelled = true;
    };
  }, [stage]);

  const draw = React.useCallback((doc: FiscalDocumentDto) => new Promise<Uint8Array>((done, fail) => setStage({ doc, done, fail })), []);

  const archive = useMutation({
    mutationFn: async () => {
      const server = await apiClient.download(`/accounting/archive?startDate=${from}&endDate=${to}`);
      const pdfs: ArchivePdf[] = [];
      let offset: number | null = 0;
      while (offset !== null) {
        const page = await fetchArchiveDocuments(from, to, offset);
        for (const { path, document } of page.documents) {
          setProgress({ done: pdfs.length, total: page.total });
          pdfs.push({ path, data: await draw(document) });
        }
        offset = page.next;
      }
      setStage(null);
      const zip = completeArchive(new Uint8Array(await server.blob.arrayBuffer()), pdfs);
      saveFile({ blob: new Blob([zip as Uint8Array<ArrayBuffer>], { type: "application/zip" }), fileName: server.fileName });
      return pdfs.length;
    },
    onSuccess: (count) => toast.success(t("archive.done", { count })),
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("failed")),
    onSettled: () => {
      setStage(null);
      setProgress(null);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("archive.title")}</CardTitle>
        <CardDescription>{t("archive.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="archive-from">{t("archive.from")}</Label>
            <DateInput id="archive-from" value={from} onChange={setFrom} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="archive-to">{t("archive.to")}</Label>
            <DateInput id="archive-to" value={to} onChange={setTo} />
          </div>
          <Button variant="outline" onClick={() => archive.mutate()} disabled={archive.isPending || !from || !to}>
            <Download className="mr-2 h-4 w-4" aria-hidden />
            {archive.isPending ? t("saft.making") : t("archive.download")}
          </Button>
        </div>
        {progress && (
          <p className="text-sm text-muted-foreground" role="status">
            {t("archive.progress", { done: progress.done, total: progress.total })}
          </p>
        )}
        {!exactPdfs() && <p className="text-xs text-muted-foreground">{t("archive.browserNote")}</p>}
      </CardContent>
      {stage &&
        createPortal(
          // Behind the app (in view, which the browser's own rendering needs), at A4 width; black on white whatever the theme.
          <div ref={stageRef} aria-hidden style={{ position: "fixed", left: 0, top: 0, zIndex: -1, pointerEvents: "none" }}>
            <FiscalA4 doc={stage.doc} copyLabel={REPRINT_LABEL} />
          </div>,
          document.body,
        )}
    </Card>
  );
}
