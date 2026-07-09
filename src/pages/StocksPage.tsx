import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Plus, Trash2, RefreshCw, TrendingUp, TrendingDown,
  Wallet, BarChart3, ListOrdered, PiggyBank, Camera,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose,
} from "../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from "recharts";
import { formatAmount } from "../lib/utils";
import {
  getStocksHoldings, addStockHolding, deleteStockHolding,
  getStocksTrades, addStockTrade, deleteStockTrade,
  getStocksDividends, addStockDividend, deleteStockDividend,
  getStocksPrices, getStocksLookup, getStocksPortfolio,
  getStocksCompleted, getStocksCash, setStocksCash,
  getStocksDailyAssets, setStocksDailyAssets,
} from "../lib/cloud";

function formatPct(v: number) {
  return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
}

function detectMarket(code: string) {
  return (code || "").trim().startsWith("6") ? "SH" : "SZ";
}

function addDays(dateStr: string, days: number) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
}

function daysBetween(a: string, b: string) {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((new Date(y1, m1 - 1, d1).getTime() - new Date(y2, m2 - 1, d2).getTime()) / (86400000));
}

export function StocksPage() {
  const [holdings, setHoldings] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [dividends, setDividends] = useState<any[]>([]);
  const [portfolio, setPortfolio] = useState<any>(null);
  const [completed, setCompleted] = useState<any>(null);
  const [cash, setCash] = useState(0);
  const [dailyAssets, setDailyAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState("holdings");
  const [completedGroup, setCompletedGroup] = useState("stock");
  const [holdingOpen, setHoldingOpen] = useState(false);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [dividendOpen, setDividendOpen] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [rForm, setRForm] = useState({ date: "", totalAssets: "" });
  const [hForm, setHForm] = useState({ stock_code: "", stock_name: "", shares: "", cost_price: "", market: "SZ" });
  const [tForm, setTForm] = useState({ stock_code: "", stock_name: "", trade_type: "buy", shares: "", price: "", commission: "0", date: "", note: "", market: "SZ" });
  const [dForm, setDForm] = useState({ stock_code: "", stock_name: "", dividend_per_share: "", total_amount: "", date: "", note: "", market: "SZ" });
  const [cashVal, setCashVal] = useState("");
  const searchTimer = useRef<any>(null);

  const loadData = useCallback(async () => {
    try {
      const [h, t, d, p, comp, c, da] = await Promise.all([
        getStocksHoldings(), getStocksTrades(), getStocksDividends(),
        getStocksPortfolio(), getStocksCompleted(completedGroup),
        getStocksCash(), getStocksDailyAssets(),
      ]);
      setHoldings(h); setTrades(t); setDividends(d); setPortfolio(p);
      setCompleted(comp); setCash(c); setDailyAssets(da);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [completedGroup]);

  useEffect(() => { loadData(); }, [loadData]);

  const refreshPrices = async () => {
    if (holdings.length === 0) return;
    setRefreshing(true);
    try {
      const codes = holdings.map(h => ({ code: h.stock_code, market: h.market }));
      const prices = await getStocksPrices(codes);
      const priceMap = new Map(prices.map((p: any) => [p.code, p]));
      setHoldings(holdings.map(h => {
        const p = priceMap.get(h.stock_code);
        if (!p) return h;
        const mv = p.price * h.shares;
        const cost = h.cost_price * h.shares;
        return { ...h, price: p.price, change: p.change, changePercent: p.changePercent, marketValue: mv, pnl: mv - cost, pnlPercent: cost > 0 ? (mv - cost) / cost * 100 : 0 };
      }));
    } catch (e) { console.error(e); }
    setRefreshing(false);
  };

  const recordToday = () => {
    setRForm({ date: new Date().toISOString().slice(0,10), totalAssets: "" });
    setRecordOpen(true);
  };

  const saveRecord = async () => {
    // const today = new Date().toISOString().slice(0, 10);
    try {
      await setStocksDailyAssets({
        date: rForm.date,
        totalAssets: parseFloat(rForm.totalAssets) || 0,
      });
      setRecordOpen(false);
      loadData();
    } catch (e) { console.error(e); }
  };

  const handleLookup = (code: string, onName: (n: string) => void, onMarket: (m: string) => void) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!code || code.length < 3) return;
    searchTimer.current = setTimeout(async () => {
      try {
        const r = await getStocksLookup(code);
        if (r && r.name) { onName(r.name); onMarket(r.market || detectMarket(code)); }
      } catch {}
    }, 500);
  };

  const saveHolding = async () => {
    if (!hForm.stock_code || !hForm.stock_name || !hForm.shares || !hForm.cost_price) return;
    await addStockHolding({ id: crypto.randomUUID(), ...hForm, shares: parseFloat(hForm.shares), cost_price: parseFloat(hForm.cost_price) });
    setHoldingOpen(false); setHForm({ stock_code: "", stock_name: "", shares: "", cost_price: "", market: "SZ" }); loadData();
  };

  const removeHolding = async (id: string) => {
    if (!confirm("删除此持仓?")) return; await deleteStockHolding(id); loadData();
  };

  const saveTrade = async () => {
    if (!tForm.stock_code || !tForm.stock_name || !tForm.shares || !tForm.price || !tForm.date) return;
    await addStockTrade({ id: crypto.randomUUID(), ...tForm, shares: parseFloat(tForm.shares), price: parseFloat(tForm.price), commission: parseFloat(tForm.commission) || 0 });
    setTradeOpen(false); setTForm({ stock_code: "", stock_name: "", trade_type: "buy", shares: "", price: "", commission: "0", date: "", note: "", market: "SZ" }); loadData();
  };

  const removeTrade = async (id: string) => {
    if (!confirm("删除此交易?")) return; await deleteStockTrade(id); loadData();
  };

  const saveDividend = async () => {
    if (!dForm.stock_code || !dForm.stock_name || !dForm.dividend_per_share || !dForm.total_amount || !dForm.date) return;
    await addStockDividend({ id: crypto.randomUUID(), ...dForm, dividend_per_share: parseFloat(dForm.dividend_per_share), total_amount: parseFloat(dForm.total_amount) });
    setDividendOpen(false); setDForm({ stock_code: "", stock_name: "", dividend_per_share: "", total_amount: "", date: "", note: "", market: "SZ" }); loadData();
  };

  const removeDividend = async (id: string) => {
    if (!confirm("删除此分红?")) return; await deleteStockDividend(id); loadData();
  };

  const saveCash = async () => {
    await setStocksCash(parseFloat(cashVal) || 0); setCashOpen(false); loadData();
  };

  const chartData = useMemo(() => {
    if (dailyAssets.length === 0) return [];
    const sorted = [...dailyAssets].sort((a: any, b: any) => a.date.localeCompare(b.date));
    const start = sorted[0].date;
    const end = sorted[sorted.length - 1].date;
    const result: any[] = [];
    let cur = start;
    while (cur <= end) {
      const days = daysBetween(cur, "2026-07-01");
      const benchmark = Math.round(10000 * Math.pow(1 + 0.0019, Math.max(0, days)) * 100) / 100;
      const record = sorted.find(r => r.date === cur);
      result.push({ date: cur, total_assets: record?.total_assets || null, benchmark });
      cur = addDays(cur, 1);
    }
    return result;
  }, [dailyAssets]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  const totalInvested = portfolio?.totalInvested || 0;
  const totalMarketValue = holdings.reduce((s: number, h: any) => s + (h.marketValue || h.shares * h.cost_price || 0), 0);
  const totalPnl = totalMarketValue - totalInvested;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">持仓管理</h1>
            <p className="text-sm text-muted-foreground">{holdings.length} 支持仓 - 可用资金 {formatAmount(cash)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={recordToday}><Camera className="h-4 w-4 mr-1.5" />记录今日资产</Button>
          <Button variant="outline" size="sm" onClick={refreshPrices} disabled={refreshing}>
            <RefreshCw className={"h-4 w-4 mr-1.5" + (refreshing ? " animate-spin" : "")} />刷新行情
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setCashVal(String(cash)); setCashOpen(true); }}><Wallet className="h-4 w-4 mr-1.5" />资金</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-white rounded-xl p-4 md:p-5 border shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-50 rounded-lg"><BarChart3 className="h-4 w-4 md:h-5 md:w-5 text-blue-600" /></div>
            <span className="text-xs md:text-sm text-muted-foreground">总投入</span>
          </div>
          <p className="text-lg md:text-xl font-bold tabular-nums">{formatAmount(totalInvested)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 md:p-5 border shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-50 rounded-lg"><TrendingUp className="h-4 w-4 md:h-5 md:w-5 text-green-600" /></div>
            <span className="text-xs md:text-sm text-muted-foreground">市值</span>
          </div>
          <p className="text-lg md:text-xl font-bold tabular-nums">{formatAmount(totalMarketValue)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 md:p-5 border shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className={"p-2 rounded-lg " + (totalPnl >= 0 ? "bg-red-50" : "bg-green-50")}>
              {totalPnl >= 0 ? <TrendingUp className="h-4 w-4 md:h-5 md:w-5 text-red-600" /> : <TrendingDown className="h-4 w-4 md:h-5 md:w-5 text-green-600" />}
            </div>
            <span className="text-xs md:text-sm text-muted-foreground">持仓浮盈</span>
          </div>
          <p className={"text-lg md:text-xl font-bold tabular-nums " + (totalPnl >= 0 ? "text-red-600" : "text-green-600")}>
            {totalPnl >= 0 ? "+" : ""}{formatAmount(totalPnl)}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 md:p-5 border shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-purple-50 rounded-lg"><PiggyBank className="h-4 w-4 md:h-5 md:w-5 text-purple-600" /></div>
            <span className="text-xs md:text-sm text-muted-foreground">已实现盈亏</span>
          </div>
          <p className={"text-lg md:text-xl font-bold tabular-nums " + ((portfolio?.totalRealizedPnl || 0) >= 0 ? "text-red-600" : "text-green-600")}>
            {formatAmount(portfolio?.totalRealizedPnl || 0)}
          </p>
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="bg-white rounded-xl p-4 md:p-5 border shadow-sm">
          <h3 className="text-sm font-medium mb-4">总资产走势</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} domain={["auto", "auto"]} />
                <Tooltip />
                <Area type="monotone" dataKey="total_assets" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} name="总资产" connectNulls />
                <Area type="monotone" dataKey="benchmark" stroke="#f97316" fill="none" strokeDasharray="5 5" name="基准 (0.19%/日)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <Tabs value={view} onValueChange={setView}>
        <TabsList>
          <TabsTrigger value="holdings"><BarChart3 className="h-4 w-4 mr-1.5" />持仓</TabsTrigger>
          <TabsTrigger value="trades"><ListOrdered className="h-4 w-4 mr-1.5" />交易记录</TabsTrigger>
          <TabsTrigger value="dividends"><PiggyBank className="h-4 w-4 mr-1.5" />分红记录</TabsTrigger>
        </TabsList>

        <TabsContent value="holdings" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setHoldingOpen(true)}><Plus className="h-4 w-4 mr-1.5" />新增持仓</Button>
          </div>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">代码</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">名称</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">持股</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">成本价</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">现价</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">市值</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">盈亏</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody>
                {holdings.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-12 text-sm text-muted-foreground">暂无持仓</td></tr>
                ) : holdings.map((h: any) => {
                  const pnl = h.pnl || 0;
                  const pnlPct = h.pnlPercent || 0;
                  return (
                    <tr key={h.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 text-sm">{h.stock_code}</td>
                      <td className="px-4 py-3 text-sm font-medium">{h.stock_name}</td>
                      <td className="px-4 py-3 text-sm text-right tabular-nums">{h.shares}</td>
                      <td className="px-4 py-3 text-sm text-right tabular-nums">{h.cost_price?.toFixed(3)}</td>
                      <td className="px-4 py-3 text-sm text-right tabular-nums">{h.price?.toFixed(2) || "-"}</td>
                      <td className="px-4 py-3 text-sm text-right tabular-nums">{h.marketValue ? formatAmount(h.marketValue) : "-"}</td>
                      <td className={"px-4 py-3 text-sm text-right tabular-nums " + (pnl >= 0 ? "text-red-600" : "text-green-600")}>
                        {pnl ? (pnl >= 0 ? "+" : "") + formatAmount(pnl) : "-"}
                        {pnlPct ? <span className="text-xs ml-1">({formatPct(pnlPct)})</span> : ""}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeHolding(h.id)} title="删除">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="pt-4">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-medium">已清仓</h3>
              <Select value={completedGroup} onValueChange={setCompletedGroup}>
                <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="stock">按股票</SelectItem>
                  <SelectItem value="cycle">按周期</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">代码</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">名称</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">买入</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">卖出</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">盈亏</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">收益率</th>
                  </tr>
                </thead>
                <tbody>
                  {(!completed?.positions || completed.positions.length === 0) ? (
                    <tr><td colSpan={6} className="text-center py-8 text-sm text-muted-foreground">暂无已清仓记录</td></tr>
                  ) : completed.positions.map((p: any, i: number) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 text-sm">{p.stock_code}</td>
                      <td className="px-4 py-3 text-sm font-medium">{p.stock_name}</td>
                      <td className="px-4 py-3 text-sm text-right tabular-nums">{formatAmount(p.total_buy)}</td>
                      <td className="px-4 py-3 text-sm text-right tabular-nums">{formatAmount(p.total_sell)}</td>
                      <td className={"px-4 py-3 text-sm text-right tabular-nums " + (p.realized_pnl >= 0 ? "text-red-600" : "text-green-600")}>{formatAmount(p.realized_pnl)}</td>
                      <td className={"px-4 py-3 text-sm text-right tabular-nums " + (p.realized_pnl >= 0 ? "text-red-600" : "text-green-600")}>{p.realized_pnl_percent ? formatPct(p.realized_pnl_percent) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="trades" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setTradeOpen(true)}><Plus className="h-4 w-4 mr-1.5" />新增交易</Button>
          </div>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">日期</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">代码</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">名称</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-muted-foreground">类型</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">股数</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">价格</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">金额</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody>
                {trades.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-12 text-sm text-muted-foreground">暂无交易记录</td></tr>
                ) : trades.map((t: any) => (
                  <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 text-sm">{t.date}</td>
                    <td className="px-4 py-3 text-sm">{t.stock_code}</td>
                    <td className="px-4 py-3 text-sm font-medium">{t.stock_name}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={"text-xs px-2 py-1 rounded-full " + (t.trade_type === "buy" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700")}>
                        {t.trade_type === "buy" ? "买入" : "卖出"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right tabular-nums">{t.shares}</td>
                    <td className="px-4 py-3 text-sm text-right tabular-nums">{t.price?.toFixed(3)}</td>
                    <td className="px-4 py-3 text-sm text-right tabular-nums">{formatAmount(t.amount)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeTrade(t.id)} title="删除"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="dividends" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setDividendOpen(true)}><Plus className="h-4 w-4 mr-1.5" />新增分红</Button>
          </div>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">日期</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">代码</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">名称</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">每股分红</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">总金额</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody>
                {dividends.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-sm text-muted-foreground">暂无分红记录</td></tr>
                ) : dividends.map((d: any) => (
                  <tr key={d.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 text-sm">{d.date}</td>
                    <td className="px-4 py-3 text-sm">{d.stock_code}</td>
                    <td className="px-4 py-3 text-sm font-medium">{d.stock_name}</td>
                    <td className="px-4 py-3 text-sm text-right tabular-nums">{formatAmount(d.dividend_per_share)}</td>
                    <td className="px-4 py-3 text-sm text-right tabular-nums font-medium">{formatAmount(d.total_amount)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeDividend(d.id)} title="删除"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={holdingOpen} onOpenChange={setHoldingOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>新增持仓</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Input value={hForm.stock_code} onChange={e => { const v = e.target.value; setHForm(f => ({ ...f, stock_code: v, market: detectMarket(v) })); handleLookup(v, n => setHForm(f => ({ ...f, stock_name: n })), m => setHForm(f => ({ ...f, market: m }))); }} placeholder="股票代码" /></div>
            <div><Input value={hForm.stock_name} onChange={e => setHForm(f => ({ ...f, stock_name: e.target.value }))} placeholder="股票名称" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Input type="number" value={hForm.shares} onChange={e => setHForm(f => ({ ...f, shares: e.target.value }))} placeholder="持股数量" /></div>
              <div><Input type="number" step="0.001" value={hForm.cost_price} onChange={e => setHForm(f => ({ ...f, cost_price: e.target.value }))} placeholder="成本价" /></div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <DialogClose asChild><Button variant="outline">取消</Button></DialogClose>
              <Button onClick={saveHolding}>新增</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={tradeOpen} onOpenChange={setTradeOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>新增交易</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input value={tForm.stock_code} onChange={e => { const v = e.target.value; setTForm(f => ({ ...f, stock_code: v, market: detectMarket(v) })); handleLookup(v, n => setTForm(f => ({ ...f, stock_name: n })), m => setTForm(f => ({ ...f, market: m }))); }} placeholder="股票代码" />
            <Input value={tForm.stock_name} onChange={e => setTForm(f => ({ ...f, stock_name: e.target.value }))} placeholder="股票名称" />
            <div className="grid grid-cols-2 gap-3">
              <Select value={tForm.trade_type} onValueChange={v => setTForm(f => ({ ...f, trade_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="buy">买入</SelectItem>
                  <SelectItem value="sell">卖出</SelectItem>
                </SelectContent>
              </Select>
              <Input type="date" value={tForm.date} onChange={e => setTForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Input type="number" value={tForm.shares} onChange={e => setTForm(f => ({ ...f, shares: e.target.value }))} placeholder="股数" />
              <Input type="number" step="0.001" value={tForm.price} onChange={e => setTForm(f => ({ ...f, price: e.target.value }))} placeholder="价格" />
              <Input type="number" step="0.01" value={tForm.commission} onChange={e => setTForm(f => ({ ...f, commission: e.target.value }))} placeholder="手续费" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <DialogClose asChild><Button variant="outline">取消</Button></DialogClose>
              <Button onClick={saveTrade}>新增</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dividendOpen} onOpenChange={setDividendOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>新增分红</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input value={dForm.stock_code} onChange={e => { const v = e.target.value; setDForm(f => ({ ...f, stock_code: v, market: detectMarket(v) })); handleLookup(v, n => setDForm(f => ({ ...f, stock_name: n })), m => setDForm(f => ({ ...f, market: m }))); }} placeholder="股票代码" />
            <Input value={dForm.stock_name} onChange={e => setDForm(f => ({ ...f, stock_name: e.target.value }))} placeholder="股票名称" />
            <div className="grid grid-cols-2 gap-3">
              <Input type="number" step="0.01" value={dForm.dividend_per_share} onChange={e => setDForm(f => ({ ...f, dividend_per_share: e.target.value }))} placeholder="每股分红" />
              <Input type="number" step="0.01" value={dForm.total_amount} onChange={e => setDForm(f => ({ ...f, total_amount: e.target.value }))} placeholder="总金额" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input type="date" value={dForm.date} onChange={e => setDForm(f => ({ ...f, date: e.target.value }))} />
              <Input value={dForm.note} onChange={e => setDForm(f => ({ ...f, note: e.target.value }))} placeholder="备注" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <DialogClose asChild><Button variant="outline">取消</Button></DialogClose>
              <Button onClick={saveDividend}>新增</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={cashOpen} onOpenChange={setCashOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>设置可用资金</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input type="number" step="0.01" value={cashVal} onChange={e => setCashVal(e.target.value)} placeholder="可用资金" />
            <div className="flex justify-end gap-2 pt-2">
              <DialogClose asChild><Button variant="outline">取消</Button></DialogClose>
              <Button onClick={saveCash}>保存</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>记录今日资产</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Input type="date" value={rForm.date} onChange={e => setRForm(f => ({ ...f, date: e.target.value }))} /></div>
            <div><Input type="number" step="0.01" value={rForm.totalAssets} onChange={e => setRForm(f => ({ ...f, totalAssets: e.target.value }))} placeholder="总资产" /></div>
            <div className="flex justify-end gap-2 pt-2">
              <DialogClose asChild><Button variant="outline">取消</Button></DialogClose>
              <Button onClick={saveRecord}>保存</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
