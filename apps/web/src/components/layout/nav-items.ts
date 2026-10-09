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
  label: string;
  icon: LucideIcon;
  ownerOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/products", label: "Products", icon: Package },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/transfers", label: "Transfers", icon: ArrowLeftRight },
  { to: "/purchases", label: "Purchases", icon: ShoppingBag },
  { to: "/returns", label: "Returns", icon: Undo2 },
  { to: "/invoices", label: "Invoices", icon: FileText },
  { to: "/drawer-events", label: "Cash drawer", icon: Vault },
  { to: "/expenses", label: "Expenses", icon: Receipt },
  { to: "/suppliers", label: "Suppliers", icon: Truck },
  { to: "/employees", label: "Employees", icon: Users },
  { to: "/settings", label: "Settings", icon: Settings, ownerOnly: true },
  { to: "/device", label: "This device", icon: MonitorCog },
];

/** Back-office nav for a role: cashiers get none, managers skip owner-only items. */
export function navItemsFor(role: string | undefined): NavItem[] {
  if (role === "CASHIER") return [];
  return NAV_ITEMS.filter((item) => !item.ownerOnly || role === "OWNER");
}
