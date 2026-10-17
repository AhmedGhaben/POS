import * as React from "react";
import { Check, KeyRound, Lock, Moon, Sun, LogOut, Menu, User as UserIcon } from "lucide-react";
import { useLockStore, useTillMode } from "@/features/till/lock-store";
import { SetPinDialog } from "@/features/till/components/SetPinDialog";
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
import { AgtIndicator } from "@/features/agt/components/AgtIndicator";
import { DisplaySizeMenu } from "@/features/display/DisplaySizeMenu";
import { SidebarNav } from "./Sidebar";
import { BackToPos } from "./BackToPos";
import { useTheme } from "@/theme/ThemeProvider";
import { useAuthStore } from "@/features/auth/store";
import { logOutOrCloseShift } from "@/features/shifts/close-request";
import { LANGUAGES } from "@/i18n";
import { useLanguage } from "@/i18n/use-language";

export function BackOfficeTopBar() {
  const { t } = useTranslation();
  const [language, setLanguage] = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const [pinOpen, setPinOpen] = React.useState(false);
  const tillMode = useTillMode();
  const lock = useLockStore((s) => s.lock);

  // With a shift open, Log out closes it first (on the POS page).
  function handleLogout() {
    void logOutOrCloseShift(navigate);
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
          <SheetContent side="left" className="flex w-72 flex-col p-3">
            <SidebarNav onNavigate={() => setMobileNavOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>
      <BackToPos />

      <div className="ml-auto flex items-center gap-2">
        <kbd className="hidden items-center gap-1 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-flex">
          <span>⌘</span>K
        </kbd>
        <AgtIndicator />
        <StoreSwitcher />
        <DisplaySizeMenu />
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
            <DropdownMenuItem onClick={() => setPinOpen(true)}>
              <KeyRound className="h-4 w-4" />
              {t("shell.setMyPin")}
            </DropdownMenuItem>
            {tillMode && (
              <DropdownMenuItem onClick={lock}>
                <Lock className="h-4 w-4" />
                {t("shell.lock")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              {t("shell.logOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <SetPinDialog open={pinOpen} onOpenChange={setPinOpen} />
      </div>
    </header>
  );
}
