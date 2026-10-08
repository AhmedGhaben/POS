import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { MailWarning, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/features/auth/store";
import { resendVerification } from "@/features/auth/api";

const DISMISS_KEY = "pos-verify-banner-dismissed";

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/** Nags unverified owners until they click the link; dismissible for the browser session. */
export function VerifyEmailBanner() {
  const user = useAuthStore((s) => s.user);
  const [dismissed, setDismissed] = React.useState(readDismissed);
  const resend = useMutation({
    mutationFn: resendVerification,
    onSuccess: () => toast.success(`Verification link sent to ${user?.email}`),
    onError: (err) => toast.error((err as Error).message),
  });

  // `undefined` means a session persisted before this field existed — don't nag.
  if (user?.emailVerified !== false || dismissed) return null;

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Storage blocked: dismissal just won't survive a reload.
    }
    setDismissed(true);
  }

  return (
    <div className="flex items-center gap-3 border-b bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <MailWarning className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        Verify your email address — we sent a link to <span className="font-medium">{user.email}</span>.
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-7"
        disabled={resend.isPending || resend.isSuccess}
        onClick={() => resend.mutate()}
      >
        {resend.isSuccess ? "Sent" : resend.isPending ? "Sending..." : "Resend link"}
      </Button>
      <button type="button" aria-label="Dismiss" onClick={dismiss} className="rounded p-1 hover:bg-amber-100 dark:hover:bg-amber-900/40">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
