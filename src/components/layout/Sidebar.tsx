import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  ArrowRightLeft,
  Tags,
  PiggyBank,
  Wallet,
  Settings,
} from "lucide-react";
import { cn } from "../../lib/utils";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "总览" },
  { to: "/transactions", icon: ArrowRightLeft, label: "记账" },
  { to: "/categories", icon: Tags, label: "分类" },
  { to: "/budgets", icon: PiggyBank, label: "预算" },
  { to: "/accounts", icon: Wallet, label: "账户" },
  { to: "/settings", icon: Settings, label: "设置" },
];

export function Sidebar() {
  return (
    <aside className="w-56 h-screen border-r bg-sidebar flex flex-col py-6">
      <div className="px-6 mb-8">
        <h1 className="text-xl font-bold text-foreground">
          账本
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          个人财务管理
        </p>
      </div>
      <nav className="flex-1 px-3 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-active/10 text-sidebar-active"
                  : "text-sidebar-foreground hover:bg-sidebar-hover"
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
