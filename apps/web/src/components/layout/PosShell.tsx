import { Moon, Sun, LogOut, LayoutDashboard, MonitorCog, Download, Lock } from "lucide-react";
import { useLockStore, useTillMode } from "@/features/till/lock-store";
import { useTranslation } from "react-i18next";
import { useDeviceStore } from "@/features/desktop/bridge";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { StoreSwitcher } from "./StoreSwitcher";
import { useTheme } from "@/theme/ThemeProvider";
import { useAuthStore } from "@/features/auth/store";
import { logOutOrCloseShift } from "@/features/shifts/close-request";
import { OfflineIndicator } from "@/features/pos/components/OfflineIndicator";

/**
 * Minimal terminal-mode shell for the POS sale screen — no sidebar, no
 * back-office nav. Cashiers only ever see this. Owner/Manager get a
 * "Back to dashboard" link to return to the back office.
 */
/** A quiet hint that a new version will install on the next restart. */
function UpdateReady() {
  const { t } = useTranslation();
  const version = useDeviceStore((s) => (s.update?.state === "ready" ? s.update.version : null));
  if (!version) return null;
  return (
    <NavLink
      to="/device"
      className="hidden items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground sm:inline-flex"
      title={t("shell.updateReadyHint")}
    >
      <Download className="h-3 w-3" /> {t("shell.updateReady", { version })}
    </NavLink>
  );
}

export function PosShell() {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const role = useAuthStore((s) => s.user?.role);
  const navigate = useNavigate();
  const tillMode = useTillMode();
  const lock = useLockStore((s) => s.lock);

  // With a shift open, Log out closes it first (blind count, report).
  function handleLogout() {
    void logOutOrCloseShift(navigate);
  }

  const canReturnToBackOffice = role !== "CASHIER";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center justify-between border-b px-4">
        {canReturnToBackOffice ? (
          <NavLink
            to="/dashboard"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <LayoutDashboard className="h-4 w-4" />
            {t("shell.backToDashboard")}
          </NavLink>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <UpdateReady />
          <OfflineIndicator />
          <kbd className="hidden items-center gap-1 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-flex">
            <span>⌘</span>K
          </kbd>
          <StoreSwitcher />
          <Button variant="ghost" size="icon" asChild aria-label={t("nav.thisDevice")}>
            <NavLink to="/device" title={t("nav.thisDevice")}>
              <MonitorCog className="h-4 w-4" />
            </NavLink>
          </Button>
          <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={t("shell.toggleTheme")}>
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          {tillMode && (
            <Button variant="ghost" size="icon" onClick={lock} aria-label={t("shell.lock")} title={t("shell.lock")}>
              <Lock className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={handleLogout} aria-label={t("shell.logOut")}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
