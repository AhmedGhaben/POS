import { Moon, Sun, LogOut, LayoutDashboard } from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { StoreSwitcher } from "./StoreSwitcher";
import { useTheme } from "@/theme/ThemeProvider";
import { useAuthStore } from "@/features/auth/store";
import { logout } from "@/features/auth/api";

/**
 * Minimal terminal-mode shell for the POS sale screen — no sidebar, no
 * back-office nav. Cashiers only ever see this. Owner/Manager get a
 * "Back to dashboard" link to return to the back office.
 */
export function PosShell() {
  const { theme, toggleTheme } = useTheme();
  const role = useAuthStore((s) => s.user?.role);
  const clearSession = useAuthStore((s) => s.clearSession);
  const navigate = useNavigate();

  async function handleLogout() {
    await logout().catch(() => {});
    clearSession();
    navigate("/login");
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
            Back to dashboard
          </NavLink>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <StoreSwitcher />
          <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Log out">
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
