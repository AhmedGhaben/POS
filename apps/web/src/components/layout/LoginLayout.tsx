import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/theme/ThemeProvider";
import { AuthAppearanceControls } from "./AuthAppearanceControls";
import { useAuthEntrance } from "./use-auth-entrance";
import "@/styles/storbit-login.css";

export function LoginLayout({ children, footer }: { children: ReactNode; footer: ReactNode }) {
 const { t } = useTranslation("auth");
 const { theme } = useTheme();
 const entranceRef = useAuthEntrance();
 return <main ref={entranceRef} className="storbit-login">
  <aside className="brand-panel">
   <div className="brand-top"><img className="logo-img" src={theme === "dark" ? "/brand/storbit-logo-light.png" : "/brand/storbit-logo-original.png"} alt="STORBIT" width="2172" height="724" /></div>
   <div className="brand-copy"><div className="eyebrow">{t("login.eyebrow")}</div><h1>{t("login.headline")}</h1><p>{t("login.brandDescription")}</p><div className="brand-accent" aria-hidden="true" /></div>
   <section className="dashboard" aria-label={t("login.preview.dashboardLabel")}>
      <div className="dash-head">
        <div><div className="dash-title">{t("login.preview.overview")}</div><div className="dash-subtitle">{t("login.preview.store")}</div></div>
        <span className="sample-badge">SAMPLE DATA</span>
      </div>
      <div className="metric-grid">
        <div className="metric"><div className="metric-label">{t("login.preview.sales")}</div><div className="metric-value sample-counter"><span className="sample-counter-size" aria-hidden="true">Kz 2.48M</span><span data-sample-sales aria-hidden="true">Kz 2.48M</span><span className="sr-only">Kz 2.48M</span></div><div className="metric-note">↗ 12.8%</div></div>
        <div className="metric"><div className="metric-label">{t("login.preview.transactions")}</div><div className="metric-value sample-counter"><span className="sample-counter-size" aria-hidden="true">126</span><span data-sample-transactions aria-hidden="true">126</span><span className="sr-only">126</span></div><div className="metric-note">{t("login.preview.today")}</div></div>
        <div className="metric"><div className="metric-label">{t("login.preview.stock")}</div><div className="metric-value">04</div><div className="metric-note warn">{t("login.preview.review")}</div></div>
      </div>
      <div className="chart-head"><span>{t("login.preview.performance")}</span><span>{t("login.preview.period")}</span></div>
      <svg className="chart" viewBox="0 0 520 112" role="img" aria-label={t("login.preview.chart")}>
        <defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#B84DFF" stopOpacity=".24"/><stop offset="1" stopColor="#B84DFF" stopOpacity="0"/></linearGradient></defs>
        <path d="M0 90H520 M0 56H520 M0 22H520" stroke="#536078" strokeWidth="1" strokeDasharray="4 5" opacity=".55" fill="none"/>
        <path className="chart-detail" d="M0 94 L74 68 L148 82 L222 38 L296 54 L370 12 L444 29 L520 0 L520 112 L0 112Z" fill="url(#chartFill)"/>
        <path className="chart-line" pathLength="1000" d="M0 94 L74 68 L148 82 L222 38 L296 54 L370 12 L444 29 L520 0" stroke="#C34DFF" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        <circle className="chart-detail" cx="520" cy="0" r="4.5" fill="#FF3366"/>
      </svg>
      <div className="dash-foot"><span><strong>{t("login.preview.latest")}</strong> · Kz 85,000</span><span><strong>{t("login.preview.alerts")}</strong> · 4</span></div>
    </section>
  </aside>
  <AuthAppearanceControls />
  <section className="auth-panel" aria-labelledby="login-heading"><div className="auth-content">
   <div className="workspace-label">{t("login.workspace")}</div><h2 id="login-heading">{t("login.title")}</h2><p className="auth-intro">{t("login.description")}</p>
   {children}<div className="signup">{footer}</div>
  </div><div className="auth-footer">{t("login.tagline")}</div></section>
 </main>;
}
