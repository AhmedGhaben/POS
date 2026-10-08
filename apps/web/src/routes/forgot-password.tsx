import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { forgotPassword } from "@/features/auth/api";

const backToLogin = (
  <Link to="/login" className="font-medium text-primary hover:underline">
    Back to sign in
  </Link>
);

export function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const mutation = useMutation({ mutationFn: () => forgotPassword(email) });

  if (mutation.isSuccess) {
    // The API answers the same way whether or not the account exists, so the
    // page must too — otherwise it reveals which emails are registered.
    return (
      <AuthLayout title="Check your email" footer={backToLogin}>
        <p className="text-sm text-muted-foreground">
          If an account exists for <span className="font-medium text-foreground">{email}</span>,
          we've sent a link to reset your password. It expires in 1 hour.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Forgot your password?"
      description="Enter your email and we'll send you a reset link."
      footer={backToLogin}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
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
          {mutation.isPending ? "Sending..." : "Send reset link"}
        </Button>
      </form>
    </AuthLayout>
  );
}
