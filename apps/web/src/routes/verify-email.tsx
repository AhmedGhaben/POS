import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { useAuthStore } from "@/features/auth/store";
import { logout, verifyEmail } from "@/features/auth/api";

type Result =
  | { status: "verifying" }
  | { status: "success"; email: string }
  | { status: "error"; message: string | null };

/**
 * Landing page for the link in the verification email. Works logged in or
 * out — and copes with the link being opened while signed in as a different
 * account (e.g. the demo owner), in which case it offers to switch.
 */
export function VerifyEmailPage() {
  const { t } = useTranslation("auth");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const currentUser = useAuthStore((s) => s.user);
  const isLoggedIn = useAuthStore((s) => s.accessToken !== null);
  const markEmailVerified = useAuthStore((s) => s.markEmailVerified);
  const clearSession = useAuthStore((s) => s.clearSession);
  // A null message means "the link has no code" (translated at render).
  const [result, setResult] = React.useState<Result>(
    token ? { status: "verifying" } : { status: "error", message: null },
  );
  // Tokens are single-use: StrictMode runs effects twice in dev, and a second
  // call would fail and overwrite the success state.
  const requested = React.useRef(false);

  React.useEffect(() => {
    if (!token || requested.current) return;
    requested.current = true;
    verifyEmail(token)
      .then(({ email }) => {
        // Only update the local session if it's the account that was verified.
        const signedInEmail = useAuthStore.getState().user?.email;
        if (signedInEmail?.toLowerCase() === email.toLowerCase()) markEmailVerified();
        setResult({ status: "success", email });
      })
      .catch((err: Error) => setResult({ status: "error", message: err.message }));
  }, [token, markEmailVerified]);

  async function switchAccount(email: string) {
    await logout().catch(() => {});
    clearSession();
    navigate("/login", { replace: true, state: { email } });
  }

  if (result.status === "verifying") {
    return (
      <AuthLayout title={t("verify.verifyingTitle")}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("verify.oneMoment")}
        </div>
      </AuthLayout>
    );
  }

  if (result.status === "success") {
    const signedInAsOther =
      isLoggedIn && currentUser && currentUser.email.toLowerCase() !== result.email.toLowerCase();

    return (
      <AuthLayout title={t("verify.doneTitle")}>
        <div className="mb-4 flex items-start gap-2 text-sm">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
          <span>
            <Trans t={t} i18nKey="verify.confirmed" values={{ email: result.email }} components={{ b: <span className="font-medium" /> }} />
          </span>
        </div>
        {signedInAsOther ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              <Trans
                t={t}
                i18nKey="verify.otherAccount"
                values={{ email: currentUser.email }}
                components={{ b: <span className="font-medium text-foreground" /> }}
              />
            </p>
            <Button className="w-full" onClick={() => switchAccount(result.email)}>
              {t("verify.signInAs", { email: result.email })}
            </Button>
            <Button asChild variant="ghost" className="w-full">
              <Link to="/">{t("verify.stayAs", { email: currentUser.email })}</Link>
            </Button>
          </div>
        ) : isLoggedIn ? (
          <Button asChild className="w-full">
            <Link to="/">{t("verify.goToDashboard")}</Link>
          </Button>
        ) : (
          <Button className="w-full" onClick={() => navigate("/login", { state: { email: result.email } })}>
            {t("login.submit")}
          </Button>
        )}
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t("verify.failedTitle")}>
      <div className="mb-2 flex items-center gap-2 text-sm text-destructive">
        <XCircle className="h-5 w-5" /> {result.message ?? t("verify.missingCode")}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        {isLoggedIn ? t("verify.expiredSignedIn") : t("verify.expiredSignedOut")}
      </p>
      <Button asChild className="w-full">
        <Link to={isLoggedIn ? "/" : "/login"}>{isLoggedIn ? t("verify.goToDashboard") : t("login.submit")}</Link>
      </Button>
    </AuthLayout>
  );
}
