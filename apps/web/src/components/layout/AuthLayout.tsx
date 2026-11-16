import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useTheme } from "@/theme/ThemeProvider";
import { LanguagePicker } from "./LanguagePicker";

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
  const { theme } = useTheme();
  return (
    <div className="storbit-ui storbit-shell relative flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-4 text-foreground">
      <LanguagePicker className="absolute right-4 top-4 h-9 bg-background" />
      <Card className={cn("w-full max-w-sm", className)}>
        <CardHeader>
          <div className="mx-auto mb-2 w-fit px-3 py-2">
            <img src={theme === "dark" ? "/brand/storbit-logo-light.png" : "/brand/storbit-logo-original.png"} alt="STORBIT" className="h-auto w-36 max-w-full" width="2172" height="724" />
          </div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
      {footer && <div className="text-sm text-muted-foreground">{footer}</div>}
    </div>
  );
}
