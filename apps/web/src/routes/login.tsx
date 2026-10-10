import * as React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { useAuthStore } from "@/features/auth/store";
import { login } from "@/features/auth/api";
import { ApiError } from "@/lib/api-client";

export function LoginPage() {
  const { t } = useTranslation("auth");
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  // Router state (not a query param, to keep the address out of history) can
  // pre-fill the email, e.g. when /verify-email sends the user here to switch accounts.
  const location = useLocation();
  const [email, setEmail] = React.useState(
    () => (location.state as { email?: string } | null)?.email ?? "",
  );
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { accessToken, user, stores, business } = await login(email, password);
      setSession(accessToken, user, stores, business);
      navigate(user.role === "CASHIER" ? "/pos" : "/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("login.failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title={t("login.title")}
      description={t("login.description")}
      footer={
        <>
          {t("login.newHere")}{" "}
          <Link to="/signup" className="font-medium text-primary hover:underline">
            {t("login.createAccount")}
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">{t("fields.email")}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{t("fields.password")}</Label>
            <Link to="/forgot-password" className="text-sm text-muted-foreground hover:underline">
              {t("login.forgot")}
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? t("login.submitting") : t("login.submit")}
        </Button>
      </form>
    </AuthLayout>
  );
}
