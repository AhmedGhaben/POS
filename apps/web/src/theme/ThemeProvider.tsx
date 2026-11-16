import * as React from "react";
import { getInitialPreference, resolveTheme } from "./theme-preference";

type Theme = "light" | "dark";
export type ThemePreference = Theme | "system";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreference] = React.useState<ThemePreference>(getInitialPreference);
  const [systemDark, setSystemDark] = React.useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  const theme = resolveTheme(preference, systemDark);

  React.useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("pos-theme", preference);
  }, [theme, preference]);

  const toggleTheme = React.useCallback(() => {
    setPreference(theme === "dark" ? "light" : "dark");
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, preference, setPreference, toggleTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
