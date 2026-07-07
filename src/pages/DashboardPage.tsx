import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  getMonthlyStats,
  getCategorySummary,
  getMonthlyTrend,
} from "../lib/cloud";
import { formatAmount } from "../lib/utils";

interface OutletContext {
  year: number;
  month: number;
  refreshStats: () => void;
}

export function DashboardPage() {
  const { year, month } = useOutletContext<OutletContext>();
  const [stats, setStats] = useState({ income: 0, expense: 0, balance: 0 });
  const [catSummary, setCatSummary] = useState<any[]>([]);
  const [trend, setTrend] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [year, month]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [s, c, t] = await Promise.all([
        getMonthlyStats(year, month),
        getCategorySummary(year, month),
        getMonthlyTrend(),
      ]);
      setStats(s as { income: number; expense: number; balance: number });
      setCatSummary((c as any[]).filter((x: any) => x.type === "expense"));
      setTrend(t as any[]);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const COLORS = [
    "#ef4444", "#f97316", "#eab308", "#22c55e",
    "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6",
    "#f43f5e", "#6b7280",
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const hasExpenseData = catSummary.length > 0 && catSummary.some((c: any) => c.total > 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-5 border shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-emerald-50 rounded-lg">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
            </div>
            <span className="text-sm text-muted-foreground">本月收入</span>
          </div>
          <p className="text-2xl font-bold income-text">
            {formatAmount(stats.income)}
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 border shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-red-50 rounded-lg">
              <TrendingDown className="h-5 w-5 text-red-500" />
            </div>
            <span className="text-sm text-muted-foreground">本月支出</span>
          </div>
          <p className="text-2xl font-bold expense-text">
            {formatAmount(stats.expense)}
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 border shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Wallet className="h-5 w-5 text-blue-600" />
            </div>
            <span className="text-sm text-muted-foreground">本月结余</span>
          </div>
          <p
            className={`text-2xl font-bold ${
              stats.balance >= 0 ? "text-emerald-600" : "text-red-500"
            }`}
          >
            {formatAmount(stats.balance)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Expense Pie Chart */}
        <div className="bg-white rounded-xl p-5 border shadow-sm">
          <h3 className="font-semibold mb-4">支出分类</h3>
          {hasExpenseData ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="60%" height={240}>
                <PieChart>
                  <Pie
                    data={catSummary}
                    dataKey="total"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {catSummary.map((_: any, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any) => [formatAmount(value), "金额"]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {catSummary
                  .filter((c: any) => c.total > 0)
                  .slice(0, 6)
                  .map((c: any, i: number) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: COLORS[i % COLORS.length] }}
                        />
                        <span className="text-muted-foreground">{c.name}</span>
                      </div>
                      <span className="font-medium">
                        {formatAmount(c.total)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              本月暂无支出记录
            </div>
          )}
        </div>

        {/* Trend Chart */}
        <div className="bg-white rounded-xl p-5 border shadow-sm">
          <h3 className="font-semibold mb-4">月度趋势</h3>
          {trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value: any) => [formatAmount(value), ""]}
                />
                <Line
                  type="monotone"
                  dataKey="income"
                  stroke="#22c55e"
                  strokeWidth={2}
                  name="收入"
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="expense"
                  stroke="#ef4444"
                  strokeWidth={2}
                  name="支出"
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              暂无历史数据
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
