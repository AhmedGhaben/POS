import * as React from "react";
import { Check, Moon, Sun, LogOut, Menu, User as UserIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { StoreSwitcher } from "./StoreSwitcher";
import { SidebarNav } from "./Sidebar";
import { useTheme } from "@/theme/ThemeProvider";
import { useAuthStore } from "@/features/auth/store";
import { logout } from "@/features/auth/api";
import { LANGUAGES } from "@/i18n";
import { useLanguage } from "@/i18n/use-language";

export function BackOfficeTopBar() {
  const { t } = useTranslation();
  const [language, setLanguage] = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const clearSession = useAuthStore((s) => s.clearSession);
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  async function handleLogout() {
    await logout().catch(() => {});
    clearSession();
    navigate("/login");
  }

  return (
    <header className="flex h-14 items-center justify-between gap-2 border-b px-4">
      <div className="flex items-center gap-2 lg:hidden">
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t("shell.openNavigation")}>
              <Menu className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex w-64 flex-col p-3">
            <SidebarNav onNavigate={() => setMobileNavOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <kbd className="hidden items-center gap-1 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-flex">
          <span>⌘</span>K
        </kbd>
        <StoreSwitcher />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t("shell.accountMenu")}>
              <UserIcon className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {user?.email && <DropdownMenuLabel className="font-normal text-muted-foreground">{user.email}</DropdownMenuLabel>}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={toggleTheme}>
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
              {t("shell.toggleTheme")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t("language.label")}</DropdownMenuLabel>
            {LANGUAGES.map((l) => (
              <DropdownMenuItem key={l.code} onClick={() => setLanguage(l.code)}>
                <Check className={l.code === language ? "h-4 w-4" : "h-4 w-4 opacity-0"} />
                {l.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              {t("shell.logOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
