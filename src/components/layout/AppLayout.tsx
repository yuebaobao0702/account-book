import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar, SidebarToggle } from "./Sidebar";

import { getMonthlyStats } from "../../lib/cloud";

export function AppLayout() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [income, setIncome] = useState(0);
  const [expense, setExpense] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const loadStats = async () => {
    try {
      const stats = await getMonthlyStats(year, month);
      setIncome((stats as any).income);
      setExpense((stats as any).expense);
    } catch (e) {
      console.error("Failed to load stats:", e);
    }
  };

  useEffect(() => { loadStats(); }, [year, month]);

  const handlePrevMonth = () => {
    if (month === 1) { setYear(year - 1); setMonth(12); }
    else { setMonth(month - 1); }
  };

  const handleNextMonth = () => {
    const now2 = new Date();
    if (year === now2.getFullYear() && month === now2.getMonth() + 1) return;
    if (month === 12) { setYear(year + 1); setMonth(1); }
    else { setMonth(month + 1); }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="h-14 md:h-16 border-b bg-background flex items-center gap-2 px-3 md:px-6 shrink-0">
          <SidebarToggle onClick={() => setSidebarOpen(true)} />
          <div className="flex items-center gap-2">
            <button onClick={handlePrevMonth} className="p-1 hover:bg-gray-100 rounded text-sm">
              ◀
            </button>
            <span className="text-sm md:text-base font-semibold whitespace-nowrap">
              {year}年{month}月
              {year === now.getFullYear() && month === now.getMonth() + 1 && (
                <span className="ml-1 text-xs text-muted-foreground">(本月)</span>
              )}
            </span>
            <button onClick={handleNextMonth} className="p-1 hover:bg-gray-100 rounded text-sm"
              disabled={year === now.getFullYear() && month === now.getMonth() + 1}>
              ▶
            </button>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2 md:gap-4 text-xs md:text-sm">
            <span className="text-emerald-600 font-medium hidden xs:inline">
              {(income as any) > 0 ? "¥" + Number(income).toLocaleString() : ""}
            </span>
            <span className="text-red-500 font-medium hidden xs:inline">
              {(expense as any) > 0 ? "¥" + Number(expense).toLocaleString() : ""}
            </span>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-3 md:p-6 bg-gray-50/50">
          <Outlet context={{ year, month, refreshStats: loadStats }} />
        </main>
      </div>
    </div>
  );
}
