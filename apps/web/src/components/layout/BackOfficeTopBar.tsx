import { Moon, Sun, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { StoreSwitcher } from "./StoreSwitcher";
import { useTheme } from "@/theme/ThemeProvider";
import { useAuthStore } from "@/features/auth/store";
import { logout } from "@/features/auth/api";

export function BackOfficeTopBar() {
  const { theme, toggleTheme } = useTheme();
  const clearSession = useAuthStore((s) => s.clearSession);
  const navigate = useNavigate();

  async function handleLogout() {
    await logout().catch(() => {});
    clearSession();
    navigate("/login");
  }

  return (
    <header className="flex h-14 items-center justify-end gap-2 border-b px-4">
      <StoreSwitcher />
      <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>
      <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Log out">
        <LogOut className="h-4 w-4" />
      </Button>
    </header>
  );
}
