import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { getMonthlyStats } from "../../lib/cloud";
import { useEffect } from "react";

export function AppLayout() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [income, setIncome] = useState(0);
  const [expense, setExpense] = useState(0);

  const loadStats = async () => {
    try {
      const stats = await getMonthlyStats(year, month);
      setIncome(stats.income);
      setExpense(stats.expense);
    } catch (e) {
      console.error("Failed to load stats:", e);
    }
  };

  useEffect(() => {
    loadStats();
  }, [year, month]);

  const handlePrevMonth = () => {
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else {
      setMonth(month - 1);
    }
  };

  const handleNextMonth = () => {
    const now = new Date();
    if (year === now.getFullYear() && month === now.getMonth() + 1) return;
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else {
      setMonth(month + 1);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar
          year={year}
          month={month}
          income={income}
          expense={expense}
          onPrevMonth={handlePrevMonth}
          onNextMonth={handleNextMonth}
        />
        <main className="flex-1 overflow-auto p-6 bg-gray-50/50">
          <Outlet context={{ year, month, refreshStats: loadStats }} />
        </main>
      </div>
    </div>
  );
}
