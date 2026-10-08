import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { useAuthStore } from "@/features/auth/store";
import { logout, verifyEmail } from "@/features/auth/api";

type Result =
  | { status: "verifying" }
  | { status: "success"; email: string }
  | { status: "error"; message: string };

/**
 * Landing page for the link in the verification email. Works logged in or
 * out — and copes with the link being opened while signed in as a different
 * account (e.g. the demo owner), in which case it offers to switch.
 */
export function VerifyEmailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const currentUser = useAuthStore((s) => s.user);
  const isLoggedIn = useAuthStore((s) => s.accessToken !== null);
  const markEmailVerified = useAuthStore((s) => s.markEmailVerified);
  const clearSession = useAuthStore((s) => s.clearSession);
  const [result, setResult] = React.useState<Result>(
    token
      ? { status: "verifying" }
      : { status: "error", message: "This link is missing its verification code." },
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
      <AuthLayout title="Verifying your email">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> One moment...
        </div>
      </AuthLayout>
    );
  }

  if (result.status === "success") {
    const signedInAsOther =
      isLoggedIn && currentUser && currentUser.email.toLowerCase() !== result.email.toLowerCase();

    return (
      <AuthLayout title="Email verified">
        <div className="mb-4 flex items-start gap-2 text-sm">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
          <span>
            <span className="font-medium">{result.email}</span> is confirmed.
          </span>
        </div>
        {signedInAsOther ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This browser is signed in as{" "}
              <span className="font-medium text-foreground">{currentUser.email}</span>, a different
              account.
            </p>
            <Button className="w-full" onClick={() => switchAccount(result.email)}>
              Sign in as {result.email}
            </Button>
            <Button asChild variant="ghost" className="w-full">
              <Link to="/">Stay as {currentUser.email}</Link>
            </Button>
          </div>
        ) : isLoggedIn ? (
          <Button asChild className="w-full">
            <Link to="/">Go to dashboard</Link>
          </Button>
        ) : (
          <Button className="w-full" onClick={() => navigate("/login", { state: { email: result.email } })}>
            Sign in
          </Button>
        )}
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Couldn't verify your email">
      <div className="mb-2 flex items-center gap-2 text-sm text-destructive">
        <XCircle className="h-5 w-5" /> {result.message}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        {isLoggedIn
          ? "Links expire after 24 hours and work once. Use “Resend link” in the banner to get a new one."
          : "Links expire after 24 hours and work once. Sign in and use “Resend link” to get a new one."}
      </p>
      <Button asChild className="w-full">
        <Link to={isLoggedIn ? "/" : "/login"}>{isLoggedIn ? "Go to dashboard" : "Sign in"}</Link>
      </Button>
    </AuthLayout>
  );
}
