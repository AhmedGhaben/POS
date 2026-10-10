import {
  LayoutDashboard,
  Package,
  Boxes,
  Truck,
  Users,
  ShoppingBag,
  Receipt,
  FileText,
  Undo2,
  ArrowLeftRight,
  Settings,
  MonitorCog,
  Vault,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  /** Key in common.json's "nav" section. */
  label: NavLabel;
  icon: LucideIcon;
  ownerOnly?: boolean;
}

export type NavLabel =
  | "dashboard"
  | "products"
  | "inventory"
  | "transfers"
  | "purchases"
  | "returns"
  | "invoices"
  | "cashDrawer"
  | "expenses"
  | "suppliers"
  | "employees"
  | "settings"
  | "thisDevice";

export const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "dashboard", icon: LayoutDashboard },
  { to: "/products", label: "products", icon: Package },
  { to: "/inventory", label: "inventory", icon: Boxes },
  { to: "/transfers", label: "transfers", icon: ArrowLeftRight },
  { to: "/purchases", label: "purchases", icon: ShoppingBag },
  { to: "/returns", label: "returns", icon: Undo2 },
  { to: "/invoices", label: "invoices", icon: FileText },
  { to: "/drawer-events", label: "cashDrawer", icon: Vault },
  { to: "/expenses", label: "expenses", icon: Receipt },
  { to: "/suppliers", label: "suppliers", icon: Truck },
  { to: "/employees", label: "employees", icon: Users },
  { to: "/settings", label: "settings", icon: Settings, ownerOnly: true },
  { to: "/device", label: "thisDevice", icon: MonitorCog },
];

/** Back-office nav for a role: cashiers get none, managers skip owner-only items. */
export function navItemsFor(role: string | undefined): NavItem[] {
  if (role === "CASHIER") return [];
  return NAV_ITEMS.filter((item) => !item.ownerOnly || role === "OWNER");
}
