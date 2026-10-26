import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-client";
import { inviteAccountant } from "../api";

/**
 * "Give accounting access" for someone on the staff (an in-house
 * accountant). One login has one role, so this invites an accountant login
 * of their own, with its own email address, through the accountant invite;
 * their staff login stays as it is.
 */
export function GiveAccountingAccessDialog({
  person,
  onClose,
}: {
  person: { firstName: string; lastName: string; staffEmail: string | null } | null;
  onClose: () => void;
}) {
  const { t } = useTranslation("accounting");
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState({ email: "", firstName: "", lastName: "", ocpcaNumber: "" });
  React.useEffect(() => {
    if (person) setForm({ email: "", firstName: person.firstName, lastName: person.lastName, ocpcaNumber: "" });
  }, [person]);

  const invite = useMutation({
    mutationFn: () => inviteAccountant({ ...form, email: form.email.trim(), ocpcaNumber: form.ocpcaNumber.trim() || undefined }),
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: ["accounting", "accountants"] });
      toast.success(r.newLogin ? t("accountants.invited") : t("accountants.added"));
      onClose();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("failed")),
  });
  const sameAsStaff = !!person?.staffEmail && form.email.trim().toLowerCase() === person.staffEmail.toLowerCase();
  const ready = /\S+@\S+\.\S+/.test(form.email) && !sameAsStaff && form.firstName.trim() && form.lastName.trim();

  return (
    <Dialog open={person !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("accountants.staffTitle", { name: person ? `${person.firstName} ${person.lastName}` : "" })}</DialogTitle>
          <DialogDescription>{t("accountants.staffExplain")}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) invite.mutate();
          }}
        >
          {(["email", "firstName", "lastName", "ocpcaNumber"] as const).map((k) => (
            <div key={k} className={`space-y-1 ${k === "email" ? "sm:col-span-2" : ""}`}>
              <Label htmlFor={`staff-accountant-${k}`}>{t(`accountants.fields.${k}`)}</Label>
              <Input
                id={`staff-accountant-${k}`}
                type={k === "email" ? "email" : "text"}
                value={form[k]}
                autoFocus={k === "email"}
                onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
              />
              {k === "email" && sameAsStaff && <p className="text-xs text-destructive">{t("accountants.staffSameEmail")}</p>}
            </div>
          ))}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("accountants.close")}
            </Button>
            <Button type="submit" disabled={!ready || invite.isPending}>
              {t("accountants.invite")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
