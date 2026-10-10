import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { resetPassword } from "@/features/auth/api";

export function ResetPasswordPage() {
  const { t } = useTranslation(["auth", "common"]);
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  // Staff invites reuse reset tokens; only the wording differs.
  const isInvite = searchParams.get("invite") === "1";
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const mutation = useMutation({ mutationFn: () => resetPassword(token, password) });

  if (!token) {
    return (
      <AuthLayout title={t("reset.invalidTitle")}>
        <p className="mb-4 text-sm text-muted-foreground">{t("reset.invalidBody")}</p>
        <Button asChild className="w-full">
          <Link to="/forgot-password">{t("reset.requestNew")}</Link>
        </Button>
      </AuthLayout>
    );
  }

  if (mutation.isSuccess) {
    return (
      <AuthLayout title={isInvite ? t("reset.inviteDoneTitle") : t("reset.doneTitle")}>
        <p className="mb-4 text-sm text-muted-foreground">
          {isInvite ? t("reset.inviteDoneBody") : t("reset.doneBody")}
        </p>
        <Button asChild className="w-full">
          <Link to="/login">{t("login.submit")}</Link>
        </Button>
      </AuthLayout>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setValidationError(t("common:validation.passwordLength"));
      return;
    }
    if (password !== confirm) {
      setValidationError(t("reset.mismatch"));
      return;
    }
    setValidationError(null);
    mutation.mutate();
  }

  const error = validationError ?? (mutation.error as Error | null)?.message;

  return (
    <AuthLayout
      title={isInvite ? t("reset.inviteTitle") : t("reset.title")}
      footer={
        <Link to="/forgot-password" className="hover:underline">
          {t("reset.expired")}
        </Link>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="password">{t("fields.newPassword")}</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">{t("fields.confirmPassword")}</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? t("common:actions.saving") : isInvite ? t("reset.inviteSubmit") : t("reset.submit")}
        </Button>
      </form>
    </AuthLayout>
  );
}
