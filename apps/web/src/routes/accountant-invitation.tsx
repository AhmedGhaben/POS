import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { useAuthStore } from "@/features/auth/store";
import { acceptInvitationLink } from "@/features/accounting/api";

type Result = { status: "accepting" } | { status: "success"; email: string; businessName: string } | { status: "error"; message: string | null };

/**
 * Landing page for the link in the email another company sends an
 * accountant who already has a login (docs/ACCOUNTING-DECISIONS.md, B1c).
 * Works signed out: the email is the proof.
 */
export function AccountantInvitationPage() {
  const { t } = useTranslation("accounting");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const signedInEmail = useAuthStore((s) => s.user?.email);
  const [result, setResult] = React.useState<Result>(token ? { status: "accepting" } : { status: "error", message: null });
  // The link works once: StrictMode runs effects twice in dev.
  const requested = React.useRef(false);

  React.useEffect(() => {
    if (!token || requested.current) return;
    requested.current = true;
    acceptInvitationLink(token)
      .then(({ email, businessName }) => {
        void queryClient.invalidateQueries({ queryKey: ["accountant", "clients"] });
        setResult({ status: "success", email, businessName });
      })
      .catch((err: Error) => setResult({ status: "error", message: err.message }));
  }, [token, queryClient]);

  if (result.status === "accepting") {
    return (
      <AuthLayout title={t("invitation.acceptingTitle")}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("invitation.oneMoment")}
        </div>
      </AuthLayout>
    );
  }

  if (result.status === "success") {
    const sameAccount = signedInEmail?.toLowerCase() === result.email.toLowerCase();
    return (
      <AuthLayout title={t("invitation.doneTitle")}>
        <div className="mb-4 flex items-start gap-2 text-sm">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
          <span>{t("invitation.done", { name: result.businessName, email: result.email })}</span>
        </div>
        {sameAccount ? (
          <Button asChild className="w-full">
            <Link to="/accounting">{t("invitation.toClients")}</Link>
          </Button>
        ) : (
          <Button className="w-full" onClick={() => navigate("/login", { state: { email: result.email } })}>
            {t("invitation.signIn")}
          </Button>
        )}
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t("invitation.failedTitle")}>
      <div className="mb-2 flex items-center gap-2 text-sm text-destructive">
        <XCircle className="h-5 w-5" /> {result.message ?? t("invitation.missing")}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">{t("invitation.failedHint")}</p>
      <Button asChild className="w-full">
        <Link to={signedInEmail ? "/accounting" : "/login"}>{signedInEmail ? t("invitation.toClients") : t("invitation.signIn")}</Link>
      </Button>
    </AuthLayout>
  );
}
