import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LanguagePicker } from "./LanguagePicker";
import { StorbitLogo } from "@/components/brand/StorbitLogo";

interface AuthLayoutProps {
  title: string;
  description?: React.ReactNode;
  /** Links shown under the card, e.g. "Already have an account? Sign in". */
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/** Centered card used by the public pages: login, sign-up, password reset, email verification. */
export function AuthLayout({ title, description, footer, className, children }: AuthLayoutProps) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-4">
      <LanguagePicker className="absolute right-4 top-4 h-10 bg-card" />
      <StorbitLogo className="h-9" />
      <Card className={cn("w-full max-w-sm", className)}>
        <CardHeader>
          {/* Brand accent: a short green bar, no illustration, no gradient. */}
          <span aria-hidden className="mb-2 block h-[3px] w-16 rounded-full bg-sb-link" />
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
      {footer && <div className="text-sm text-muted-foreground">{footer}</div>}
    </div>
  );
}
