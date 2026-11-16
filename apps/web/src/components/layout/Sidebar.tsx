import { NavLink } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/features/auth/store";
import { navItemsFor } from "./nav-items";
import { StorbitLogo } from "@/components/brand/StorbitLogo";
import { useConnectionLogoStatus } from "@/components/brand/use-logo-status";

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  const role = useAuthStore((s) => s.user?.role);
  const logoStatus = useConnectionLogoStatus();
  return (
    <>
      <div className="mb-5 flex items-end gap-2 px-2 pt-1">
        <StorbitLogo className="h-7" status={logoStatus} />
        <span className="pb-0.5 text-xs font-semibold text-muted-foreground">{t("shell.backOffice")}</span>
      </div>
      <nav className="-mx-1 min-h-0 flex-1 space-y-1 overflow-y-auto px-1 pb-2">
        {navItemsFor(role).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-[0.9375rem] font-medium text-foreground hover:bg-accent",
                isActive && "bg-sb-nav-active font-semibold text-sb-nav-active-text hover:bg-sb-nav-active",
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className={cn("h-5 w-5 shrink-0", isActive ? "text-sb-success" : "text-muted-foreground")}
                  aria-hidden
                />
                {t(`nav.${item.label}`)}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      {role !== "ACCOUNTANT" && (
      <NavLink
        to="/pos"
        onClick={onNavigate}
        className="mt-2 flex shrink-0 items-center gap-3 rounded-md border px-3 py-2.5 text-[0.9375rem] font-medium hover:bg-accent"
      >
        <ShoppingCart className="h-5 w-5 shrink-0" aria-hidden />
        {t("nav.pointOfSale")}
      </NavLink>
      )}
    </>
  );
}

/** Stays put while the page scrolls, so Point of Sale is always in the bottom-left corner. */
export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-card p-3 lg:flex">
      <SidebarNav />
    </aside>
  );
}
