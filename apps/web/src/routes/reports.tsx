import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SaftExportDialog } from "@/features/reports/components/SaftExportDialog";

export function ReportsPage() {
  const { t } = useTranslation();
  const [showSaftDialog, setShowSaftDialog] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t("reports.title" as any)}</h1>
        <p className="text-muted-foreground">{t("reports.description" as any)}</p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("reports.saft.title" as any)}</CardTitle>
            <CardDescription>{t("reports.saft.description" as any)}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{t("reports.saft.exportInfo" as any)}</p>
              <Button onClick={() => setShowSaftDialog(true)}>{t("reports.saft.export" as any)}</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <SaftExportDialog open={showSaftDialog} onOpenChange={setShowSaftDialog} />
    </div>
  );
}
