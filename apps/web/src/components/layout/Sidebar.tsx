import { NavLink } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/features/auth/store";
import { useTheme } from "@/theme/ThemeProvider";
import { navItemsFor } from "./nav-items";

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const role = useAuthStore((s) => s.user?.role);
  return (
    <>
      <div className="mb-4 shrink-0 px-2 py-1 [@media(max-height:820px)]:mb-2">
        <img src={theme === "dark" ? "/brand/storbit-logo-light.png" : "/brand/storbit-logo-original.png"} alt="STORBIT" width="2172" height="724" className="block h-auto w-32 max-w-full object-contain object-left" />
      </div>
      <nav className="-mx-1 min-h-0 flex-1 space-y-1 overflow-y-auto px-1 pb-2">
        {navItemsFor(role).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-[0.9375rem] font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(max-height:820px)]:py-1.5",
                isActive && "bg-accent text-accent-foreground",
              )
            }
          >
            <item.icon className="h-5 w-5 shrink-0" aria-hidden />
            <span className="truncate">{t(`nav.${item.label}`)}</span>
          </NavLink>
        ))}
      </nav>
      {role !== "ACCOUNTANT" && (
      <NavLink
        to="/pos"
        onClick={onNavigate}
        className="mt-2 flex shrink-0 items-center gap-3 rounded-md border px-3 py-2.5 text-[0.9375rem] font-medium hover:bg-accent [@media(max-height:820px)]:py-2"
      >
        <ShoppingCart className="h-5 w-5 shrink-0" aria-hidden />
        {t("nav.pointOfSale")}
      </NavLink>
      )}
    </>
  );
}

/**
 * Stays put while the page scrolls, so Point of Sale is always in the bottom-left corner.
 * Narrower on small touchscreens (1024-1279 px) and never wider than a quarter of the
 * screen, even at a large display size (tester #33).
 */
export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-56 max-w-[25vw] shrink-0 flex-col border-r bg-card p-3 lg:flex xl:w-64">
      <SidebarNav />
    </aside>
  );
}
