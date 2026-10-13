import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ApproverDto } from "@pos/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PinPad } from "@/features/till/components/PinPad";
import { approve, fetchApprovers, useApprovalStore } from "../approval";

/**
 * "Manager approval": someone who may do this picks their name and types
 * their PIN. The person at the till stays signed in, and the approval is
 * good for this one action only. Mounted once (ProtectedRoute).
 */
export function ManagerApprovalDialog() {
  const { t } = useTranslation("auth");
  const pending = useApprovalStore((s) => s.pending);
  const finish = useApprovalStore((s) => s.finish);
  const [approver, setApprover] = React.useState<ApproverDto | null>(null);
  const [pin, setPin] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setApprover(null);
    setPin("");
    setError(null);
  }, [pending]);

  const approvers = useQuery({
    queryKey: ["approvers", pending?.permission],
    queryFn: () => fetchApprovers(pending!.permission),
    enabled: !!pending,
    staleTime: 0,
  });

  async function submit() {
    if (!pending || !approver || pin.length < 4 || busy) return;
    setBusy(true);
    setError(null);
    const result = await approve(pending, approver, pin);
    setBusy(false);
    setPin("");
    if (result.ok) finish(result.approval);
    else setError(t(`approval.errors.${result.code}`));
  }

  const list = approvers.data ?? [];

  return (
    <Dialog open={!!pending} onOpenChange={(open) => !open && !busy && finish(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> {t("approval.title")}
          </DialogTitle>
          <DialogDescription>{pending?.description}</DialogDescription>
        </DialogHeader>

        {!approver ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("approval.who")}</p>
            {approvers.isLoading && <p className="text-sm text-muted-foreground">{t("approval.loading")}</p>}
            {approvers.isSuccess && list.length === 0 && <p className="text-sm text-destructive">{t("approval.nobody")}</p>}
            {approvers.isError && <p className="text-sm text-destructive">{t("approval.errors.failed")}</p>}
            <div className="grid grid-cols-2 gap-2">
              {list.map((a) => (
                <Button key={a.id} type="button" variant="outline" className="h-auto py-3" onClick={() => setApprover(a)}>
                  {a.firstName} {a.lastName}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("pin.back")}
                onClick={() => {
                  setApprover(null);
                  setPin("");
                  setError(null);
                }}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <p className="font-medium">{t("approval.pinFor", { name: `${approver.firstName} ${approver.lastName}` })}</p>
            </div>
            <PinPad value={pin} onChange={setPin} onSubmit={() => void submit()} disabled={busy} />
            {error && <p className="text-center text-sm text-destructive">{error}</p>}
          </div>
        )}

        <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={() => finish(null)}>
          {t("approval.cancel")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
