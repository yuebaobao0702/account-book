import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, ArrowRightLeft, Tags, PiggyBank, Wallet, Settings, TrendingUp,
  Menu, X,
} from "lucide-react";
import { cn } from "../../lib/utils";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "总览" },
  { to: "/transactions", icon: ArrowRightLeft, label: "记账" },
  { to: "/categories", icon: Tags, label: "分类" },
  { to: "/budgets", icon: PiggyBank, label: "预算" },
  { to: "/accounts", icon: Wallet, label: "账户" },
  { to: "/stocks", icon: TrendingUp, label: "股票" },
  { to: "/settings", icon: Settings, label: "设置" },
];

export function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const sidebar = (
    <aside className="w-56 h-full border-r bg-sidebar flex flex-col py-6">
      <div className="flex items-center justify-between px-6 mb-8">
        <div>
          <h1 className="text-xl font-bold text-foreground">账本</h1>
          <p className="text-xs text-muted-foreground mt-1">个人财务管理</p>
        </div>
        <button onClick={onClose} className="md:hidden p-1 hover:bg-gray-200 rounded">
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="flex-1 px-3 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            onClick={onClose}
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

  return (
    <>
      {/* Desktop: always visible */}
      <div className="hidden md:block h-full">{sidebar}</div>

      {/* Mobile: overlay drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="fixed inset-0 bg-black/40" onClick={onClose} />
          <div className="fixed left-0 top-0 h-full shadow-xl">{sidebar}</div>
        </div>
      )}
    </>
  );
}

export function SidebarToggle({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="md:hidden p-2 -ml-2 hover:bg-gray-100 rounded-md"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}
