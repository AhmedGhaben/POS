import * as React from "react";
import { toast } from "sonner";
import { DrawerOpenReason, type DrawerSubReason } from "@pos/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DRAWER_SUB_REASON_LABELS, openCashDrawer } from "../drawer";

const REASONS: DrawerSubReason[] = ["CASH_PICKUP", "FLOAT_ADJUSTMENT", "MANAGER_INSPECTION", "OTHER"];

/** "Open drawer" without a sale: asks why, opens, and records it (offline too). */
export function OpenDrawerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [reason, setReason] = React.useState<DrawerSubReason>("CASH_PICKUP");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setReason("CASH_PICKUP");
      setNote("");
    }
  }, [open]);

  const needsNote = reason === "OTHER" && !note.trim();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (needsNote) return;
    setBusy(true);
    const opened = await openCashDrawer({ reason: DrawerOpenReason.MANUAL_OPEN, subReason: reason, note });
    setBusy(false);
    if (opened) {
      toast.success("Drawer opened");
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Open cash drawer</DialogTitle>
          <DialogDescription>No sale. This is recorded with your name, the till and the reason.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">Reason</legend>
            {REASONS.map((r) => (
              <label key={r} className="flex items-center gap-3 text-sm">
                <input
                  type="radio"
                  name="drawer-reason"
                  className="h-4 w-4"
                  checked={reason === r}
                  onChange={() => setReason(r)}
                />
                {DRAWER_SUB_REASON_LABELS[r]}
              </label>
            ))}
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="drawer-note">Note{reason === "OTHER" ? "" : " (optional)"}</Label>
            <Textarea
              id="drawer-note"
              maxLength={300}
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy || needsNote}>
            {busy ? "Opening…" : "Open drawer"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
