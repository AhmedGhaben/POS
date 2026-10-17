import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { fetchAccountants, inviteAccountant, revokeAccountant } from "../api";

const KEY = ["accounting", "accountants"] as const;

/** The owner gives an outside accountant access to the books (and takes it away). */
export function AccountantsSettings() {
  const { t } = useTranslation("accounting");
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: KEY, queryFn: fetchAccountants });
  const [form, setForm] = React.useState({ email: "", firstName: "", lastName: "", ocpcaNumber: "" });
  const fail = (error: unknown) => toast.error(error instanceof ApiError ? error.message : t("failed"));
  const refresh = () => void queryClient.invalidateQueries({ queryKey: KEY });
  const invite = useMutation({
    mutationFn: () => inviteAccountant({ ...form, ocpcaNumber: form.ocpcaNumber.trim() || undefined }),
    onSuccess: (r) => {
      refresh();
      setForm({ email: "", firstName: "", lastName: "", ocpcaNumber: "" });
      toast.success(r.newLogin ? t("accountants.invited") : t("accountants.added"));
    },
    onError: fail,
  });
  const revoke = useMutation({ mutationFn: revokeAccountant, onSuccess: () => (refresh(), toast.success(t("accountants.revoked"))), onError: fail });
  const ready = /\S+@\S+\.\S+/.test(form.email) && form.firstName.trim() && form.lastName.trim();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("accountants.title")}</CardTitle>
        <CardDescription>{t("accountants.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="divide-y rounded-md border">
          {list.data?.map((a) => (
            <li key={a.userId} className="flex flex-wrap items-center gap-3 p-2 text-sm">
              <div className="flex-1">
                <p className="font-medium">
                  {a.firstName} {a.lastName}
                  {a.ocpcaNumber && <span className="ml-2 text-xs text-muted-foreground">OCPCA {a.ocpcaNumber}</span>}
                  {a.pending && (
                    <Badge variant="outline" className="ml-2">
                      {t("accountants.pending")}
                    </Badge>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {a.email} · {t(a.pending ? "accountants.invitedOn" : "accountants.since", { date: formatDate(a.since) })}
                </p>
              </div>
              <Button size="sm" variant="outline" className="text-destructive" onClick={() => revoke.mutate(a.userId)} disabled={revoke.isPending}>
                {t(a.pending ? "accountants.cancelInvitation" : "accountants.revoke")}
              </Button>
            </li>
          ))}
          {list.data?.length === 0 && <li className="p-3 text-sm text-muted-foreground">{t("accountants.none")}</li>}
        </ul>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) invite.mutate();
          }}
        >
          {(["email", "firstName", "lastName", "ocpcaNumber"] as const).map((k) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={`accountant-${k}`}>{t(`accountants.fields.${k}`)}</Label>
              <Input id={`accountant-${k}`} type={k === "email" ? "email" : "text"} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
            </div>
          ))}
          <Button type="submit" className="sm:col-span-2 sm:w-fit" disabled={!ready || invite.isPending}>
            {t("accountants.invite")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
