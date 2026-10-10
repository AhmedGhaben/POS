import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { forgotPassword } from "@/features/auth/api";

function BackToLogin() {
  const { t } = useTranslation("auth");
  return (
    <Link to="/login" className="font-medium text-primary hover:underline">
      {t("forgot.backToLogin")}
    </Link>
  );
}

export function ForgotPasswordPage() {
  const { t } = useTranslation("auth");
  const [email, setEmail] = React.useState("");
  const mutation = useMutation({ mutationFn: () => forgotPassword(email) });

  if (mutation.isSuccess) {
    // The API answers the same way whether or not the account exists, so the
    // page must too — otherwise it reveals which emails are registered.
    return (
      <AuthLayout title={t("forgot.sentTitle")} footer={<BackToLogin />}>
        <p className="text-sm text-muted-foreground">
          <Trans
            t={t}
            i18nKey="forgot.sentBody"
            values={{ email }}
            components={{ b: <span className="font-medium text-foreground" /> }}
          />
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t("forgot.title")} description={t("forgot.description")} footer={<BackToLogin />}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="email">{t("fields.email")}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        {mutation.error && <p className="text-sm text-destructive">{(mutation.error as Error).message}</p>}
        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? t("forgot.submitting") : t("forgot.submit")}
        </Button>
      </form>
    </AuthLayout>
  );
}
