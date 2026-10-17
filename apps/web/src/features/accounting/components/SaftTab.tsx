import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Download, FileCode2, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiClient, saveFile } from "@/lib/api-client";
import { checkSaft, type SaftCheckDto } from "../api";
import { ArchiveCard } from "./ArchiveCard";

/**
 * The SAF-T (AO) accounting file for a year (due by 10 April): check the
 * books first, then make the file. A year still open can be exported as a
 * draft for a trial run.
 */
export function SaftTab({ today, canWrite }: { today: string; canWrite: boolean }) {
  const { t } = useTranslation("accounting");
  const [year, setYear] = React.useState(Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) <= 4 ? 1 : 0));
  const [draft, setDraft] = React.useState(false);
  const [check, setCheck] = React.useState<SaftCheckDto | null>(null);
  const fail = (error: unknown) => toast.error(error instanceof ApiError ? error.message : t("failed"));
  const verify = useMutation({ mutationFn: () => checkSaft(year, draft), onSuccess: setCheck, onError: fail });
  const make = useMutation({
    mutationFn: async () => saveFile(await apiClient.download(`/accounting/saft?year=${year}${draft ? "&draft=true" : ""}`)),
    onSuccess: () => toast.success(t("saft.done")),
    onError: fail,
  });
  React.useEffect(() => setCheck(null), [year, draft]);

  return (
    <div className="space-y-4">
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileCode2 className="h-5 w-5" aria-hidden />
          {t("saft.title")}
        </CardTitle>
        <CardDescription>{t("saft.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-28 space-y-1">
            <Label htmlFor="saft-year">{t("entries.year")}</Label>
            <Input id="saft-year" type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || year)} />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={draft} onChange={(e) => setDraft(e.target.checked)} />
            {t("saft.draft")}
          </label>
        </div>
        {canWrite ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => verify.mutate()} disabled={verify.isPending}>
              {t("saft.check")}
            </Button>
            <Button onClick={() => make.mutate()} disabled={make.isPending || !check?.ready}>
              <Download className="mr-2 h-4 w-4" aria-hidden />
              {make.isPending ? t("saft.making") : t("saft.make")}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("readOnly")}</p>
        )}
        {check && (
          <div className="space-y-2" role="status">
            {check.ready && (
              <p className="flex items-center gap-2 text-sm text-emerald-600">
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                {t("saft.ready")}
              </p>
            )}
            {check.issues.map((issue) => (
              <p key={issue.code} className={`flex items-start gap-2 text-sm ${issue.blocking ? "text-destructive" : "text-amber-600"}`}>
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {t(`saft.issues.${issue.code}`, { detail: issue.detail ?? "" })}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
    <ArchiveCard today={today} />
    </div>
  );
}
