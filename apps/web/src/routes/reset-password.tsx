import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { resetPassword } from "@/features/auth/api";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const mutation = useMutation({ mutationFn: () => resetPassword(token, password) });

  if (!token) {
    return (
      <AuthLayout title="Invalid reset link">
        <p className="mb-4 text-sm text-muted-foreground">
          This link is missing its reset code. Request a new one.
        </p>
        <Button asChild className="w-full">
          <Link to="/forgot-password">Request a new link</Link>
        </Button>
      </AuthLayout>
    );
  }

  if (mutation.isSuccess) {
    return (
      <AuthLayout title="Password updated">
        <p className="mb-4 text-sm text-muted-foreground">
          Your password has been changed and you've been signed out on all devices.
        </p>
        <Button asChild className="w-full">
          <Link to="/login">Sign in</Link>
        </Button>
      </AuthLayout>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setValidationError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setValidationError("Passwords don't match");
      return;
    }
    setValidationError(null);
    mutation.mutate();
  }

  const error = validationError ?? (mutation.error as Error | null)?.message;

  return (
    <AuthLayout
      title="Choose a new password"
      footer={
        <Link to="/forgot-password" className="hover:underline">
          Link expired? Request a new one
        </Link>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
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
          <Label htmlFor="confirm">Confirm password</Label>
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
          {mutation.isPending ? "Saving..." : "Set new password"}
        </Button>
      </form>
    </AuthLayout>
  );
}
