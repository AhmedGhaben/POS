import { Link, Navigate } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { MonitorSmartphone, Package, UserPlus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/features/auth/store";

interface NextStep {
  to: string;
  icon: LucideIcon;
  key: "product" | "cashier" | "pos";
}

const NEXT_STEPS: NextStep[] = [
  { to: "/products?new=1", icon: Package, key: "product" },
  { to: "/employees?new=1", icon: UserPlus, key: "cashier" },
  { to: "/pos", icon: MonitorSmartphone, key: "pos" },
];

/** First-run screen shown once, right after sign-up. */
export function WelcomePage() {
  const { t } = useTranslation("auth");
  const user = useAuthStore((s) => s.user);
  const storeName = useAuthStore((s) => s.stores[0]?.name);

  if (user?.role !== "OWNER") {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-3xl space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">{t("welcome.title", { name: user.firstName })}</h1>
          <p className="text-muted-foreground">
            {storeName ? t("welcome.storeReady", { store: storeName }) : t("welcome.anyStoreReady")}{" "}
            {t("welcome.getStarted")}
          </p>
          {user.emailVerified === false && (
            <p className="text-sm text-muted-foreground">
              <Trans t={t} i18nKey="welcome.verifySent" values={{ email: user.email }} components={{ b: <span className="font-medium" /> }} />
            </p>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {NEXT_STEPS.map(({ to, icon: Icon, key }) => (
            <Link key={to} to={to} className="group rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Card className="h-full transition-colors group-hover:border-primary">
                <CardHeader>
                  <Icon className="mb-2 h-6 w-6 text-primary" />
                  <CardTitle className="text-base">{t(`welcome.steps.${key}.title`)}</CardTitle>
                  <CardDescription>{t(`welcome.steps.${key}.description`)}</CardDescription>
                </CardHeader>
                <CardContent />
              </Card>
            </Link>
          ))}
        </div>
        <div className="text-center">
          <Button asChild variant="ghost">
            <Link to="/dashboard">{t("welcome.skip")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
