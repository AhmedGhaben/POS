import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/features/auth/store";
import { toast } from "sonner";

interface SaftExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SaftExportDialog({ open, onOpenChange }: SaftExportDialogProps) {
  const { t } = useTranslation();
  const auth = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [storeId, setStoreId] = useState("");
  const [saftType, setSaftType] = useState("FACTURACAO");

  const handleExport = async () => {
    if (!startDate || !endDate) {
      toast.error(t("reports.saft.selectDateRange" as any));
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        ...(storeId && { storeId }),
      });

      const response = await fetch(`/api/fiscal-documents/saft/export?${params}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth.accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error("Export failed");
      }

      const data = await response.json();
      const blob = new Blob([data.content], { type: data.mimeType });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success(t("reports.saft.exportSuccess" as any));

      onOpenChange(false);
    } catch (error) {
      toast.error(t("reports.saft.exportError" as any));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("reports.saft.export" as any)}</DialogTitle>
          <DialogDescription>{t("reports.saft.exportDescription" as any)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("reports.saft.type" as any)}</Label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="FACTURACAO"
                  checked={saftType === "FACTURACAO"}
                  onChange={(e) => setSaftType(e.target.value)}
                />
                <span>{t("reports.saft.facturacao" as any)}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="INVENTARIOS"
                  checked={saftType === "INVENTARIOS"}
                  onChange={(e) => setSaftType(e.target.value)}
                />
                <span>{t("reports.saft.inventarios" as any)}</span>
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="start-date">{t("reports.saft.startDate" as any)}</Label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="end-date">{t("reports.saft.endDate" as any)}</Label>
            <Input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              {t("common.cancel" as any)}
            </Button>
            <Button onClick={handleExport} disabled={loading}>
              {loading ? t("common.loading" as any) : t("reports.saft.export" as any)}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
