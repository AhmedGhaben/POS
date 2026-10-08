import { Link, Navigate } from "react-router-dom";
import { MonitorSmartphone, Package } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/features/auth/store";

interface NextStep {
  to: string;
  icon: LucideIcon;
  title: string;
  description: string;
}

const NEXT_STEPS: NextStep[] = [
  {
    to: "/products?new=1",
    icon: Package,
    title: "Add your first product",
    description: "Name, price and stock, so it shows up at the register.",
  },
  {
    to: "/pos",
    icon: MonitorSmartphone,
    title: "Open the POS",
    description: "Ring up a sale on this device: cash or card.",
  },
];

/** First-run screen shown once, right after sign-up. */
export function WelcomePage() {
  const user = useAuthStore((s) => s.user);
  const storeName = useAuthStore((s) => s.stores[0]?.name);

  if (user?.role !== "OWNER") {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-2xl space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">Welcome, {user.firstName}!</h1>
          <p className="text-muted-foreground">
            {storeName ? `${storeName} is ready.` : "Your store is ready."} Here's how to get started.
          </p>
          {user.emailVerified === false && (
            <p className="text-sm text-muted-foreground">
              We've sent a verification link to <span className="font-medium">{user.email}</span>.
            </p>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {NEXT_STEPS.map(({ to, icon: Icon, title, description }) => (
            <Link key={to} to={to} className="group rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Card className="h-full transition-colors group-hover:border-primary">
                <CardHeader>
                  <Icon className="mb-2 h-6 w-6 text-primary" />
                  <CardTitle className="text-base">{title}</CardTitle>
                  <CardDescription>{description}</CardDescription>
                </CardHeader>
                <CardContent />
              </Card>
            </Link>
          ))}
        </div>
        <div className="text-center">
          <Button asChild variant="ghost">
            <Link to="/dashboard">Skip to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
