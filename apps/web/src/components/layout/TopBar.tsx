import { Moon, Sun, LogOut } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { StoreSwitcher } from "./StoreSwitcher";
import { useTheme } from "@/theme/ThemeProvider";
import { useAuthStore } from "@/features/auth/store";
import { logout } from "@/features/auth/api";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/pos", label: "POS" },
  { to: "/products", label: "Products" },
  { to: "/inventory", label: "Inventory" },
  { to: "/dashboard", label: "Dashboard" },
];

export function TopBar() {
  const { theme, toggleTheme } = useTheme();
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);
  const navigate = useNavigate();

  async function handleLogout() {
    await logout().catch(() => {});
    clearSession();
    navigate("/login");
  }

  const visibleNav = NAV_ITEMS.filter((item) => {
    if (user?.role === "CASHIER") {
      return item.to === "/pos";
    }
    return true;
  });

  return (
    <header className="flex h-14 items-center justify-between border-b px-4">
      <nav className="flex items-center gap-1">
        {visibleNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "rounded-md px-3 py-1.5 text-sm font-medium hover:bg-accent",
                isActive && "bg-accent text-accent-foreground",
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
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
  );
}
