import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuthStore } from "@/features/auth/store";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { acceptInvitation, declineInvitation, fetchClients, saveProfile, switchBusiness } from "../api";

/**
 * An accountant's clients: what needs doing in each (records not posted,
 * errors, months gone by still open, last year's SAF-T file), and moving
 * from one to another. Invitations from other companies wait at the top
 * until accepted or declined. Their OCPCA number, printed on the statements.
 */
export function AccountantClients() {
  const { t } = useTranslation("accounting");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setSession = useAuthStore((s) => s.setSession);
  const clients = useQuery({ queryKey: ["accountant", "clients"], queryFn: fetchClients });
  const [ocpca, setOcpca] = React.useState("");
  const fail = (error: unknown) => toast.error(error instanceof ApiError ? error.message : t("failed"));
  const switchTo = useMutation({
    mutationFn: switchBusiness,
    onSuccess: (session) => {
      setSession(session.accessToken, session.user, session.stores, session.business);
      queryClient.clear();
      navigate("/accounting", { replace: true });
      toast.success(t("accountant.switched", { name: session.business.name }));
    },
    onError: fail,
  });
  const answer = useMutation({
    mutationFn: async ({ businessId, accept }: { businessId: string; accept: boolean; name: string }) => {
      if (accept) await acceptInvitation(businessId);
      else await declineInvitation(businessId);
    },
    onSuccess: (_r, v) => {
      void queryClient.invalidateQueries({ queryKey: ["accountant", "clients"] });
      toast.success(t(v.accept ? "accountant.accepted" : "accountant.declined", { name: v.name }));
    },
    onError: fail,
  });
  const profile = useMutation({ mutationFn: () => saveProfile(ocpca.trim() || null), onSuccess: () => toast.success(t("saved")), onError: fail });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("accountant.title")}</CardTitle>
        <CardDescription>{t("accountant.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("accountant.company")}</TableHead>
              <TableHead className="text-right">{t("accountant.pending")}</TableHead>
              <TableHead className="text-right">{t("accountant.errors")}</TableHead>
              <TableHead className="text-right">{t("accountant.openMonths")}</TableHead>
              <TableHead>{t("accountant.lastYearSaft")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.data?.map((c) =>
              c.invitation === "PENDING" ? (
                <TableRow key={c.businessId} data-testid="accountant-invitation">
                  <TableCell colSpan={5}>
                    <span className="font-medium">{c.name}</span>
                    {c.taxId && <span className="block text-xs text-muted-foreground">NIF {c.taxId}</span>}
                    <Badge variant="outline" className="mt-1">
                      {t("accountant.invitation")}
                    </Badge>
                    <span className="block text-xs text-muted-foreground">
                      {c.invitedBy ? t("accountant.invitedBy", { name: c.invitedBy, date: formatDate(c.invitedAt) }) : t("accountant.invitedOn", { date: formatDate(c.invitedAt) })}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button size="sm" className="mr-2" disabled={answer.isPending} onClick={() => answer.mutate({ businessId: c.businessId, accept: true, name: c.name })}>
                      {t("accountant.accept")}
                    </Button>
                    <Button size="sm" variant="outline" disabled={answer.isPending} onClick={() => answer.mutate({ businessId: c.businessId, accept: false, name: c.name })}>
                      {t("accountant.decline")}
                    </Button>
                  </TableCell>
                </TableRow>
              ) : (
              <TableRow key={c.businessId} className={c.current ? "bg-muted/40" : ""}>
                <TableCell>
                  <span className="font-medium">{c.name}</span>
                  {c.taxId && <span className="block text-xs text-muted-foreground">NIF {c.taxId}</span>}
                  {!c.accountingEnabled && <Badge variant="outline">{t("accountant.notEnabled")}</Badge>}
                </TableCell>
                <TableCell className="text-right">{c.pending}</TableCell>
                <TableCell className={`text-right ${c.errors ? "text-destructive" : ""}`}>{c.errors}</TableCell>
                <TableCell className="text-right">{c.openMonths}</TableCell>
                <TableCell>{c.lastYearSaftMade ? t("accountant.made") : t("accountant.notMade")}</TableCell>
                <TableCell className="text-right">
                  {c.current ? (
                    <Badge variant="secondary">{t("accountant.current")}</Badge>
                  ) : (
                    <Button size="sm" variant="outline" disabled={switchTo.isPending} onClick={() => switchTo.mutate(c.businessId)}>
                      {t("accountant.open")}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
              ),
            )}
          </TableBody>
        </Table>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="ocpca">{t("accountant.ocpca")}</Label>
            <Input id="ocpca" className="w-56" value={ocpca} maxLength={30} onChange={(e) => setOcpca(e.target.value)} placeholder={t("accountant.ocpcaPlaceholder")} />
          </div>
          <Button variant="outline" onClick={() => profile.mutate()} disabled={profile.isPending}>
            {t("save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
