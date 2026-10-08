import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { useAuthStore } from "@/features/auth/store";
import { verifyEmail } from "@/features/auth/api";

type Status = "verifying" | "success" | "error";

/** Landing page for the link in the verification email. Works logged in or out. */
export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const isLoggedIn = useAuthStore((s) => s.accessToken !== null);
  const markEmailVerified = useAuthStore((s) => s.markEmailVerified);
  const [status, setStatus] = React.useState<Status>(token ? "verifying" : "error");
  const [message, setMessage] = React.useState<string>("This link is missing its verification code.");
  // Tokens are single-use: StrictMode runs effects twice in dev, and a second
  // call would fail and overwrite the success state.
  const requested = React.useRef(false);

  React.useEffect(() => {
    if (!token || requested.current) return;
    requested.current = true;
    verifyEmail(token)
      .then(() => {
        markEmailVerified();
        setStatus("success");
      })
      .catch((err: Error) => {
        setMessage(err.message);
        setStatus("error");
      });
  }, [token, markEmailVerified]);

  const continueLink = isLoggedIn ? "/" : "/login";
  const continueLabel = isLoggedIn ? "Go to dashboard" : "Sign in";

  if (status === "verifying") {
    return (
      <AuthLayout title="Verifying your email">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> One moment...
        </div>
      </AuthLayout>
    );
  }

  if (status === "success") {
    return (
      <AuthLayout title="Email verified">
        <div className="mb-4 flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-5 w-5 text-green-600" /> Thanks — your email address is confirmed.
        </div>
        <Button asChild className="w-full">
          <Link to={continueLink}>{continueLabel}</Link>
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Couldn't verify your email">
      <div className="mb-2 flex items-center gap-2 text-sm text-destructive">
        <XCircle className="h-5 w-5" /> {message}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        {isLoggedIn
          ? "Links expire after 24 hours and work once. Use “Resend link” in the banner to get a new one."
          : "Links expire after 24 hours and work once. Sign in and use “Resend link” to get a new one."}
      </p>
      <Button asChild className="w-full">
        <Link to={continueLink}>{continueLabel}</Link>
      </Button>
    </AuthLayout>
  );
}
