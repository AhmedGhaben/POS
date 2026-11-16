import { useTranslation } from "react-i18next";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/theme/ThemeProvider";
import { useLanguage } from "@/i18n/use-language";

/** Compact controls are intentionally limited to the two authentication layouts. */
export function AuthAppearanceControls() {
  const { t } = useTranslation("auth");
  const { t: common } = useTranslation("common");
  const { theme, toggleTheme } = useTheme();
  const [language, setLanguage] = useLanguage();
  const targetLabel = `${t("appearance.label")}: ${t(theme === "dark" ? "appearance.light" : "appearance.dark")}`;
  return (
    <div className="login-language">
      <button className="auth-theme-toggle" type="button" aria-label={targetLabel} title={targetLabel} onClick={toggleTheme}>
        {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
      </button>
      <div className="language" role="group" aria-label={common("language.label")}>
        <button type="button" aria-pressed={language === "en"} onClick={() => setLanguage("en")}>EN</button>
        <button type="button" aria-pressed={language.startsWith("pt")} onClick={() => setLanguage("pt-AO")}>PT</button>
      </div>
    </div>
  );
}
