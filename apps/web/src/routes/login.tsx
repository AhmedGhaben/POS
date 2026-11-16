import { homePathFor } from "@/components/layout/nav-items";
import * as React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoginLayout } from "@/components/layout/LoginLayout";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { useAuthStore } from "@/features/auth/store";
import { login } from "@/features/auth/api";
import { ApiError } from "@/lib/api-client";
import { useDeviceStore } from "@/features/desktop/bridge";
import { useTillMode } from "@/features/till/lock-store";
import { PinSignIn } from "@/features/till/components/PinSignIn";

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
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  // On a till with PINs, the name buttons come first.
  const tillMode = useTillMode();
  const [useEmail, setUseEmail] = React.useState(false);
  React.useEffect(() => {
    void useDeviceStore.getState().load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { accessToken, user, stores, business } = await login(email, password);
      setSession(accessToken, user, stores, business);
      navigate(homePathFor(user.role));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("login.failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <LoginLayout
      footer={
        <>
          {t("login.newHere")}{" "}
          <Link to="/signup" className="font-medium text-primary hover:underline">
            {t("login.createAccount")}
          </Link>
        </>
      }
    >
      {tillMode && !useEmail ? (
        <div className="space-y-4">
          <PinSignIn onSignedIn={(user) => navigate(user.role === "CASHIER" ? "/pos" : "/dashboard")} />
          <Button type="button" variant="link" className="w-full" onClick={() => setUseEmail(true)}>
            {t("pin.useEmail")}
          </Button>
        </div>
      ) : (
      <form onSubmit={handleSubmit} className="login-form">
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
            <Link to="/forgot-password" className="text-link">
              {t("login.forgot")}
            </Link>
          </div>
          <div className="input-wrap"><Input
            className="password-input"
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button className="password-toggle" type="button" aria-label={t(showPassword ? "login.hidePassword" : "login.showPassword")} aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button></div>
        </div>
        {error && <p role="alert" className="error-message">{error}</p>}
        <Button type="submit" className="signin" disabled={loading}>
          {loading ? t("login.submitting") : t("login.submit")}<ArrowRight aria-hidden="true" />
        </Button>
        {tillMode && (
          <Button type="button" variant="link" className="w-full" onClick={() => setUseEmail(false)}>
            {t("pin.usePin")}
          </Button>
        )}
      </form>
      )}
    </LoginLayout>
  );
}
