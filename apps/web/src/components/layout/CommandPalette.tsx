import * as React from "react";
import { useNavigate } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useAuthStore } from "@/features/auth/store";
import { navItemsFor } from "./nav-items";

export function CommandPalette() {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function go(to: string) {
    navigate(to);
    setOpen(false);
  }

  const navItems = navItemsFor(role);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder={t("shell.searchPages")} />
      <CommandList>
        <CommandEmpty>{t("shell.noResults")}</CommandEmpty>
        <CommandGroup heading={t("shell.navigate")}>
          {navItems.map((item) => (
            <CommandItem key={item.to} value={t(`nav.${item.label}`)} onSelect={() => go(item.to)}>
              <item.icon className="h-4 w-4" />
              {t(`nav.${item.label}`)}
            </CommandItem>
          ))}
          <CommandItem value={t("nav.pointOfSale")} onSelect={() => go("/pos")}>
            <ShoppingCart className="h-4 w-4" />
            {t("nav.pointOfSale")}
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
