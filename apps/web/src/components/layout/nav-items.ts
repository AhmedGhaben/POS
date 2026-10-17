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
  Clock,
  FileSpreadsheet,
  Contact,
  ListOrdered,
  BookOpenCheck,
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
  | "shifts"
  | "reports"
  | "accounting"
  | "customers"
  | "sales"
  | "expenses"
  | "suppliers"
  | "employees"
  | "settings"
  | "thisDevice";

export const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "dashboard", icon: LayoutDashboard },
  { to: "/sales", label: "sales", icon: ListOrdered },
  { to: "/products", label: "products", icon: Package },
  { to: "/inventory", label: "inventory", icon: Boxes },
  { to: "/transfers", label: "transfers", icon: ArrowLeftRight },
  { to: "/purchases", label: "purchases", icon: ShoppingBag },
  { to: "/returns", label: "returns", icon: Undo2 },
  { to: "/invoices", label: "invoices", icon: FileText },
  { to: "/drawer-events", label: "cashDrawer", icon: Vault },
  { to: "/shifts", label: "shifts", icon: Clock },
  { to: "/reports", label: "reports", icon: FileSpreadsheet },
  { to: "/accounting", label: "accounting", icon: BookOpenCheck },
  { to: "/expenses", label: "expenses", icon: Receipt },
  { to: "/customers", label: "customers", icon: Contact },
  { to: "/suppliers", label: "suppliers", icon: Truck },
  { to: "/employees", label: "employees", icon: Users },
  { to: "/settings", label: "settings", icon: Settings, ownerOnly: true },
  { to: "/device", label: "thisDevice", icon: MonitorCog },
];

/** What an outside accountant opens: the books, and what they're made of (read-only). */
const ACCOUNTANT_ITEMS: NavLabel[] = ["accounting", "sales", "invoices", "purchases", "inventory", "expenses", "customers", "suppliers", "reports"];

/** Where someone lands after signing in. */
export function homePathFor(role: string | undefined): string {
  if (role === "CASHIER") return "/pos";
  if (role === "ACCOUNTANT") return "/accounting";
  return "/dashboard";
}

/** Back-office nav for a role: cashiers get none, managers skip owner-only items, accountants the books and what they read. */
export function navItemsFor(role: string | undefined): NavItem[] {
  if (role === "CASHIER") return [];
  if (role === "ACCOUNTANT") return NAV_ITEMS.filter((item) => ACCOUNTANT_ITEMS.includes(item.label));
  return NAV_ITEMS.filter((item) => !item.ownerOnly || role === "OWNER");
}
