import { useState, useEffect, useCallback, useRef } from "react";
import {
  TrendingUp, TrendingDown, RefreshCw, Plus, Trash2, DollarSign, ArrowUpDown,
  PieChart, BarChart3, Wallet,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import {
  addStockHolding, deleteStockHolding,
  getStockTrades, addStockTrade, deleteStockTrade,
  getStockDividends, addStockDividend, deleteStockDividend,
  fetchStockPrices, getStockPortfolio, getStockCompleted, lookupStock, getStockCash, setStockCash, getStockMonthly, getDailyAssets, recordDailyAssets,
} from "../lib/cloud";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { formatAmount, uuid } from "../lib/utils";

interface Holding {
  id: string;
  stock_code: string;
  stock_name: string;
  shares: number;
  cost_price: number;
  market: string;
  total_invested: number;
  price?: number;
  change?: number;
  changePercent?: number;
  marketValue?: number;
  pnl?: number;
  pnlPercent?: number;
}

interface StockPrice {
  code: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  market: string;
}

interface Trade {
  id: string;
  stock_code: string;
  stock_name: string;
  trade_type: "buy" | "sell";
  shares: number;
  price: number;
  amount: number;
  commission: number;
  date: string;
  note: string;
}

interface Dividend {
  id: string;
  stock_code: string;
  stock_name: string;
  dividend_per_share: number;
  total_amount: number;
  date: string;
  note: string;
}

function SortableHeader({ label, sortKey: sk, currentKey, onSort }: {
  label: string; sortKey: string; currentKey: string; onSort: (k: string) => void;
}) {
  const active = currentKey === sk;
  return (
    <th className="text-right px-4 py-3 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground" onClick={() => onSort(sk)}>
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className={"h-3 w-3 " + (active ? "text-foreground" : "opacity-30")} />
      </span>
    </th>
  );
}

function formatPnl(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return sign + "\u00a5" + value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatChangePercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return sign + value.toFixed(2) + "%";
}


function sortData(data: any[], key: string, dir: string): any[] {
  return [...data].sort((a, b) => {
    const va = a[key] ?? 0;
    const vb = b[key] ?? 0;
    const cmp = typeof va === "string" ? va.localeCompare(vb) : va - vb;
    return dir === "asc" ? cmp : -cmp;
  });
}

function detectMarket(code: string): string {
  const c = (code || "").trim();
  if (c.startsWith("6")) return "SH";
  return "SZ";
}

export function StockPage() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [completedData, setCompletedData] = useState<any>(null);
  const [cashBalance, setCashBalance] = useState<number>(0);
  const [cashDialogOpen, setCashDialogOpen] = useState(false);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [dailyAssets, setDailyAssets] = useState<any[]>([]);
  const [cashInput, setCashInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedStock, setSelectedStock] = useState<string>("");
  const [addOpen, setAddOpen] = useState(false);
  const [addTradeOpen, setAddTradeOpen] = useState(false);
  const [addDividendOpen, setAddDividendOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("holdings");
  const [completedGroup, setCompletedGroup] = useState<string>("stock");
  const [sortKey, setSortKey] = useState<string>("last_trade");
  const [sortDir, setSortDir] = useState<string>("desc");
  const lookupTimer = useRef<any>(null);

  // New holding form
  const [newHolding, setNewHolding] = useState({
    stock_code: "", stock_name: "", shares: "", cost_price: "", market: "SZ",
  });

  // New trade form
  const [newTrade, setNewTrade] = useState({
    stock_code: "", stock_name: "", trade_type: "buy",
    shares: "", price: "", commission: "0", date: "", note: "", market: "SZ",
  });

  // New dividend form
  const [newDividend, setNewDividend] = useState({
    stock_code: "", stock_name: "", dividend_per_share: "",
    total_amount: "", date: "", note: "", market: "SZ",
  });

  const loadData = useCallback(async () => {
    try {
      const [pf, ts, ds, cp, ca, md, da] = await Promise.all([
        getStockPortfolio(),
        getStockTrades(),
        getStockDividends(),
        getStockCompleted(completedGroup === "time" ? "cycle" : "stock"),
        getStockCash(),
        getStockMonthly(),
        getDailyAssets(),
      ]);
      setHoldings(pf.holdings || []);
      setTrades(ts);
      setDividends(ds);
      setCompletedData(cp);
      setCashBalance(ca?.cash || 0);
      setMonthlyData(md || []);
      setDailyAssets(da || []);
    } catch (e) {
      console.error("Failed to load stock data:", e);
    }
    setLoading(false);
  }, [completedGroup]);

  useEffect(() => { loadData(); }, [loadData]);

  const refreshPrices = async () => {
    if (holdings.length === 0) return;
    setRefreshing(true);
    try {
      const codes = holdings.map((h) => ({ code: h.stock_code, market: h.market }));
      const prices: StockPrice[] = await fetchStockPrices(codes);
      const priceMap = new Map(prices.map((p) => [p.code, p]));

      const updated = holdings.map((h) => {
        const p = priceMap.get(h.stock_code);
        if (!p) return h;
        const marketValue = p.price * h.shares;
        const cost = h.cost_price * h.shares;
        return {
          ...h,
          price: p.price,
          change: p.change,
          changePercent: p.changePercent,
          marketValue,
          pnl: marketValue - cost,
          pnlPercent: cost > 0 ? ((marketValue - cost) / cost) * 100 : 0,
        };
      });
      setHoldings(updated);
    } catch (e) {
      console.error("Failed to refresh prices:", e);
    }
    setRefreshing(false);
  };

  const handleSort = (key: string) => {
    setSortDir((prev) => (sortKey === key ? (prev === "asc" ? "desc" : "asc") : "desc"));
    setSortKey(key);
  };

  const handleAddHolding = async () => {
    if (!newHolding.stock_code || !newHolding.stock_name || !newHolding.shares || !newHolding.cost_price) return;
    try {
      await addStockHolding({
        id: uuid(),
        stock_code: newHolding.stock_code,
        stock_name: newHolding.stock_name,
        shares: parseFloat(newHolding.shares),
        cost_price: parseFloat(newHolding.cost_price),
        market: newHolding.market,
      });
      setAddOpen(false);
      setNewHolding({ stock_code: "", stock_name: "", shares: "", cost_price: "", market: "SZ" });
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteHolding = async (id: string) => {
    try {
      await deleteStockHolding(id);
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const autoLookupStock = (code: string, marketSetter: (m: string) => void, nameSetter: (n: string) => void) => {
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    if (!code || code.length < 3) return;
    lookupTimer.current = setTimeout(async () => {
      try {
        const result = await lookupStock(code);
        if (result && result.name) {
          nameSetter(result.name);
          marketSetter(result.market || detectMarket(code));
        }
      } catch {}
    }, 500);
  };

  const handleAddTrade = async () => {
    if (!newTrade.stock_code || !newTrade.stock_name || !newTrade.shares || !newTrade.price || !newTrade.date) return;
    try {
      await addStockTrade({
        id: uuid(),
        stock_code: newTrade.stock_code,
        stock_name: newTrade.stock_name,
        trade_type: newTrade.trade_type,
        shares: parseFloat(newTrade.shares),
        price: parseFloat(newTrade.price),
        commission: parseFloat(newTrade.commission) || 0,
        date: newTrade.date,
        note: newTrade.note,
        market: newTrade.market,
      });
      setAddTradeOpen(false);
      setNewTrade({
        stock_code: "", stock_name: "", trade_type: "buy",
        shares: "", price: "", commission: "0", date: "", note: "", market: "SZ",
      });
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddDividend = async () => {
    if (!newDividend.stock_code || !newDividend.stock_name || !newDividend.dividend_per_share || !newDividend.total_amount || !newDividend.date) return;
    try {
      await addStockDividend({
        id: uuid(),
        stock_code: newDividend.stock_code,
        stock_name: newDividend.stock_name,
        dividend_per_share: parseFloat(newDividend.dividend_per_share),
        total_amount: parseFloat(newDividend.total_amount),
        date: newDividend.date,
        note: newDividend.note,
      });
      setAddDividendOpen(false);
      setNewDividend({
        stock_code: "", stock_name: "", dividend_per_share: "",
        total_amount: "", date: "", note: "", market: "SZ",
      });
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  // Calculate summary
  const totalCost = holdings.reduce((s, h) => s + (h.price != null ? h.cost_price * h.shares : 0), 0);
  const totalMarketValue = holdings.reduce((s, h) => s + (h.marketValue || h.shares * h.cost_price || 0), 0);
  const totalPnl = totalMarketValue - totalCost;
  const totalRealizedPnl = completedData?.summary?.totalRealizedPnl || 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-white rounded-xl p-4 md:p-5 border shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Wallet className="h-4 w-4 md:h-5 md:w-5 text-blue-600" />
            </div>
            <span className="text-xs md:text-sm text-muted-foreground">总资产</span>
          </div>
          <p className="text-lg md:text-2xl font-bold">{formatAmount(totalMarketValue + cashBalance)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 md:p-5 border shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-50 rounded-lg">
              <BarChart3 className="h-4 w-4 md:h-5 md:w-5 text-green-600" />
            </div>
            <span className="text-xs md:text-sm text-muted-foreground">持仓市值</span>
          </div>
          <p className="text-lg md:text-2xl font-bold text-green-600">
            {totalMarketValue > 0 ? formatAmount(totalMarketValue) : "-"}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 md:p-5 border shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-purple-50 rounded-lg">
              <DollarSign className="h-4 w-4 md:h-5 md:w-5 text-purple-600" />
            </div>
            <span className="text-xs md:text-sm text-muted-foreground">可用余额</span>
            <button className="ml-auto text-xs text-muted-foreground hover:text-foreground" onClick={() => { setCashInput(String(cashBalance)); setCashDialogOpen(true); }}>编辑</button>
          </div>
          <p className="text-lg md:text-2xl font-bold text-purple-600">{formatAmount(cashBalance)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 md:p-5 border shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className={"p-2 rounded-lg " + (totalPnl >= 0 ? "bg-red-50" : "bg-emerald-50")}>
              {totalPnl >= 0
                ? <TrendingUp className="h-4 w-4 md:h-5 md:w-5 text-red-500" />
                : <TrendingDown className="h-4 w-4 md:h-5 md:w-5 text-emerald-600" />
              }
            </div>
            <span className="text-xs md:text-sm text-muted-foreground">浮动盈亏</span>
          </div>
          <p className={"text-lg md:text-2xl font-bold " + (totalPnl >= 0 ? "text-red-500" : "text-emerald-600")}>
            {totalMarketValue > 0 ? formatPnl(totalPnl) : "-"}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 md:p-5 border shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-amber-50 rounded-lg">
              <DollarSign className="h-4 w-4 md:h-5 md:w-5 text-amber-600" />
            </div>
            <span className="text-xs md:text-sm text-muted-foreground">已实现收益</span>
          </div>
          <p className={"text-lg md:text-2xl font-bold " + (totalRealizedPnl >= 0 ? "text-red-500" : "text-emerald-600")}>
            {completedData ? formatPnl(totalRealizedPnl) : "-"}
          </p>
        </div>
      </div>

      {/* Actions Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={refreshPrices} disabled={refreshing || holdings.length === 0} size="sm">
          <RefreshCw className={"h-4 w-4 mr-1.5" + (refreshing ? " animate-spin" : "")} />
          {refreshing ? "刷新中..." : "刷新行情"}
        </Button>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-1.5" />新增持仓
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新增持仓</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>股票代码</Label>
                  <Input placeholder="如 300475" value={newHolding.stock_code}
                    onChange={(e) => { const v = e.target.value; setNewHolding(h => ({ ...h, stock_code: v, market: detectMarket(v) })); autoLookupStock(v, (m) => setNewHolding(h => ({ ...h, market: m })), (n) => setNewHolding(h => ({ ...h, stock_name: n }))); }} />
                </div>
                <div className="space-y-1.5">
                  <Label>市场</Label>
                  <Select value={newHolding.market} onValueChange={(v) => setNewHolding({ ...newHolding, market: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SZ">深圳</SelectItem>
                      <SelectItem value="SH">上海</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>股票名称</Label>
                <Input placeholder="如 香农芯创" value={newHolding.stock_name}
                  onChange={(e) => setNewHolding({ ...newHolding, stock_name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>持股数量</Label>
                  <Input type="number" placeholder="如 1000" value={newHolding.shares}
                    onChange={(e) => setNewHolding({ ...newHolding, shares: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>成本均价</Label>
                  <Input type="number" step="0.001" placeholder="如 15.50" value={newHolding.cost_price}
                    onChange={(e) => setNewHolding({ ...newHolding, cost_price: e.target.value })} />
                </div>
              </div>
              <Button className="w-full" onClick={handleAddHolding}>添加</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={addTradeOpen} onOpenChange={setAddTradeOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-1.5" />新增交易
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新增交易</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>股票代码</Label>
                  <Input placeholder="如 300475" value={newTrade.stock_code}
                    onChange={(e) => { const v = e.target.value; setNewTrade(t => ({ ...t, stock_code: v, market: detectMarket(v) })); autoLookupStock(v, (m) => setNewTrade(t => ({ ...t, market: m })), (n) => setNewTrade(t => ({ ...t, stock_name: n }))); }} />
                </div>
                <div className="space-y-1.5">
                  <Label>市场</Label>
                  <Select value={newTrade.market} onValueChange={(v) => setNewTrade({ ...newTrade, market: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SZ">深圳</SelectItem>
                      <SelectItem value="SH">上海</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>股票名称</Label>
                <Input placeholder="如 香农芯创" value={newTrade.stock_name}
                  onChange={(e) => setNewTrade({ ...newTrade, stock_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>交易类型</Label>
                <Select value={newTrade.trade_type} onValueChange={(v) => setNewTrade({ ...newTrade, trade_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buy">买入</SelectItem>
                    <SelectItem value="sell">卖出</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>数量（股）</Label>
                  <Input type="number" value={newTrade.shares}
                    onChange={(e) => setNewTrade({ ...newTrade, shares: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>成交价</Label>
                  <Input type="number" step="0.001" value={newTrade.price}
                    onChange={(e) => setNewTrade({ ...newTrade, price: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>手续费</Label>
                  <Input type="number" step="0.01" value={newTrade.commission}
                    onChange={(e) => setNewTrade({ ...newTrade, commission: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>交易日期</Label>
                  <Input type="date" value={newTrade.date}
                    onChange={(e) => setNewTrade({ ...newTrade, date: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>备注</Label>
                <Input value={newTrade.note}
                  onChange={(e) => setNewTrade({ ...newTrade, note: e.target.value })} />
              </div>
              <Button className="w-full" onClick={handleAddTrade}>添加</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={addDividendOpen} onOpenChange={setAddDividendOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-1.5" />新增分红
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新增分红记录</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>股票代码</Label>
                  <Input placeholder="如 300475" value={newDividend.stock_code}
                    onChange={(e) => { const v = e.target.value; setNewDividend(d => ({ ...d, stock_code: v, market: detectMarket(v) })); autoLookupStock(v, (m) => setNewDividend(d => ({ ...d, market: m })), (n) => setNewDividend(d => ({ ...d, stock_name: n }))); }} />
                </div>
                <div className="space-y-1.5">
                  <Label>市场</Label>
                  <Select value={newDividend.market} onValueChange={(v) => setNewDividend({ ...newDividend, market: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SZ">深圳</SelectItem>
                      <SelectItem value="SH">上海</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>股票名称</Label>
                <Input placeholder="如 香农芯创" value={newDividend.stock_name}
                  onChange={(e) => setNewDividend({ ...newDividend, stock_name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>每股分红</Label>
                  <Input type="number" step="0.001" value={newDividend.dividend_per_share}
                    onChange={(e) => setNewDividend({ ...newDividend, dividend_per_share: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>分红总额</Label>
                  <Input type="number" step="0.01" value={newDividend.total_amount}
                    onChange={(e) => setNewDividend({ ...newDividend, total_amount: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>分红日期</Label>
                  <Input type="date" value={newDividend.date}
                    onChange={(e) => setNewDividend({ ...newDividend, date: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>备注</Label>
                  <Input value={newDividend.note}
                    onChange={(e) => setNewDividend({ ...newDividend, note: e.target.value })} />
                </div>
              </div>
              <Button className="w-full" onClick={handleAddDividend}>添加</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab}
        onValueChange={(v) => { setActiveTab(v); if (v !== "detail") setSelectedStock(""); }}>
        <TabsList>
          <TabsTrigger value="holdings">
            <PieChart className="h-4 w-4 mr-1.5" />持仓
          </TabsTrigger>
          <TabsTrigger value="allTrades">交易记录</TabsTrigger>
          <TabsTrigger value="allDividends">分红记录</TabsTrigger>
          <TabsTrigger value="completed">已完成</TabsTrigger>
          <TabsTrigger value="monthly">月度收益</TabsTrigger>
          <TabsTrigger value="trend">资产趋势</TabsTrigger>
          {selectedStock && <TabsTrigger value="detail">{(holdings.find(h => h.stock_code === selectedStock)?.stock_name || selectedStock)}详情</TabsTrigger>}
        </TabsList>

        {/* Holdings Tab */}
        <TabsContent value="holdings">
          {holdings.length === 0 ? (
            <div className="bg-white rounded-xl border shadow-sm p-8 text-center text-muted-foreground">
              <p className="mb-2">暂无持仓记录</p>
              <p className="text-sm">点击上方"新增持仓"或"新增交易"开始管理你的股票投资</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50/80">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">股票</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">持股数</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">成本价</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">现价</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">涨跌幅</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">市值</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">盈亏</th>
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground w-20">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.map((h) => {
                      const mv = h.marketValue || 0;
                      const pnl = h.pnl || 0;
                      const pnlPct = h.pnlPercent || 0;
                      return (
                        <tr key={h.id} className="border-b last:border-0 hover:bg-gray-50/50 cursor-pointer"
                          onClick={() => { setSelectedStock(h.stock_code); setActiveTab("detail"); }}>
                          <td className="px-4 py-3">
                            <div className="font-medium">{h.stock_name}</div>
                            <div className="text-xs text-muted-foreground">{h.stock_code}.{h.market}</div>
                          </td>
                          <td className="px-4 py-3 text-right font-medium">{h.shares.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right">{h.cost_price.toFixed(3)}</td>
                          <td className="px-4 py-3 text-right font-medium">
                            {h.price != null ? h.price.toFixed(2) : "-"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {h.changePercent != null ? (
                              <span className={h.changePercent >= 0 ? "text-red-500" : "text-green-500"}>
                                {formatChangePercent(h.changePercent)}
                              </span>
                            ) : "-"}
                          </td>
                          <td className="px-4 py-3 text-right font-medium">
                            {mv > 0 ? formatAmount(mv) : "-"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {h.price != null ? (
                              <span className={pnl >= 0 ? "text-red-500" : "text-green-500"}>
                                <div>{formatPnl(pnl)}</div>
                                <div className="text-xs">{formatChangePercent(pnlPct)}</div>
                              </span>
                            ) : "-"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-500"
                              onClick={(e) => { e.stopPropagation(); handleDeleteHolding(h.id); }}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* All Trades Tab */}
        <TabsContent value="allTrades">
          {trades.length === 0 ? (
            <div className="bg-white rounded-xl border shadow-sm p-8 text-center text-muted-foreground">
              <p>暂无交易记录</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50/80">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">日期</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">股票</th>
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground">类型</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">数量</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">价格</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">金额</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">手续费</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">备注</th>
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground w-16">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((t) => (
                      <tr key={t.id} className="border-b last:border-0 hover:bg-gray-50/50">
                        <td className="px-4 py-3 text-muted-foreground">{t.date}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{t.stock_name}</div>
                          <div className="text-xs text-muted-foreground">{t.stock_code}</div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={"inline-block px-2 py-0.5 rounded text-xs font-medium " + (t.trade_type === "buy" ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600")}>
                            {t.trade_type === "buy" ? "买入" : "卖出"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">{t.shares.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right">{t.price.toFixed(3)}</td>
                        <td className="px-4 py-3 text-right font-medium">{formatAmount(t.amount)}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{formatAmount(t.commission)}</td>
                        <td className="px-4 py-3 text-muted-foreground max-w-[120px] truncate">{t.note || "-"}</td>
                        <td className="px-4 py-3 text-center">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-500"
                            onClick={() => { deleteStockTrade(t.id).then(loadData); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* All Dividends Tab */}
        <TabsContent value="allDividends">
          {dividends.length === 0 ? (
            <div className="bg-white rounded-xl border shadow-sm p-8 text-center text-muted-foreground">
              <p>暂无分红记录</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50/80">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">日期</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">股票</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">每股分红</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">分红总额</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">备注</th>
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground w-16">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dividends.map((d) => (
                      <tr key={d.id} className="border-b last:border-0 hover:bg-gray-50/50">
                        <td className="px-4 py-3 text-muted-foreground">{d.date}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{d.stock_name}</div>
                          <div className="text-xs text-muted-foreground">{d.stock_code}</div>
                        </td>
                        <td className="px-4 py-3 text-right">{d.dividend_per_share.toFixed(3)}</td>
                        <td className="px-4 py-3 text-right font-medium text-amber-600">{formatAmount(d.total_amount)}</td>
                        <td className="px-4 py-3 text-muted-foreground max-w-[120px] truncate">{d.note || "-"}</td>
                        <td className="px-4 py-3 text-center">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-500"
                            onClick={() => { deleteStockDividend(d.id).then(loadData); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Completed Trades Tab */}
        <TabsContent value="completed">
          {!completedData || completedData.positions.length === 0 ? (
            <div className="bg-white rounded-xl border shadow-sm p-8 text-center text-muted-foreground">
              <p>暂无已完成交易</p>
              <p className="text-sm mt-1">清仓（卖完所有持股）后会显示在这</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Mode Toggle */}
              <div className="flex items-center gap-2 bg-white rounded-lg border p-1 w-fit">
                <button
                  className={"px-3 py-1.5 text-sm rounded-md transition-colors " + (completedGroup === "stock" ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground")}
                  onClick={() => setCompletedGroup("stock")}
                >按股票汇总</button>
                <button
                  className={"px-3 py-1.5 text-sm rounded-md transition-colors " + (completedGroup === "time" ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground")}
                  onClick={() => setCompletedGroup("time")}
                >按时间展示</button>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white rounded-xl p-4 border shadow-sm">
                  <p className="text-xs text-muted-foreground mb-1">已完成交易</p>
                  <p className="text-lg font-bold">{completedData.summary.count} 笔</p>
                </div>
                <div className="bg-white rounded-xl p-4 border shadow-sm">
                  <p className="text-xs text-muted-foreground mb-1">总投入</p>
                  <p className="text-lg font-bold">{formatAmount(completedData.summary.totalBuy)}</p>
                </div>
                <div className="bg-white rounded-xl p-4 border shadow-sm">
                  <p className="text-xs text-muted-foreground mb-1">总回收</p>
                  <p className="text-lg font-bold">{formatAmount(completedData.summary.totalSell)}</p>
                </div>
                <div className="bg-white rounded-xl p-4 border shadow-sm">
                  <p className="text-xs text-muted-foreground mb-1">总收益</p>
                  <p className={"text-lg font-bold " + (totalRealizedPnl >= 0 ? "text-red-500" : "text-emerald-600")}>
                    {formatPnl(totalRealizedPnl)}
                  </p>
                </div>
              </div>

              {/* By Stock View */}
              {completedGroup === "stock" && (
                <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50/80">
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">股票</th>
                          <th className="text-right px-4 py-3 font-medium text-muted-foreground">买入</th>
                          <th className="text-right px-4 py-3 font-medium text-muted-foreground">卖出</th>
                          <th className="text-right px-4 py-3 font-medium text-muted-foreground">手续费</th>
                          <SortableHeader label="收益" sortKey="realized_pnl" currentKey={sortKey} onSort={handleSort} />
                          <SortableHeader label="收益率" sortKey="realized_pnl_percent" currentKey={sortKey} onSort={handleSort} />
                          <th className="text-right px-4 py-3 font-medium text-muted-foreground">交易次数</th>
                          <SortableHeader label="持仓天数" sortKey="holding_days" currentKey={sortKey} onSort={handleSort} />
                          <th className="text-right px-4 py-3 font-medium text-muted-foreground">时间范围</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortData(completedData.positions, sortKey, sortDir).map((p: any) => (
                          <tr key={p.stock_code} className="border-b last:border-0 hover:bg-gray-50/50">
                            <td className="px-4 py-3">
                              <div className="font-medium">{p.stock_name}</div>
                              <div className="text-xs text-muted-foreground">{p.stock_code}</div>
                            </td>
                            <td className="px-4 py-3 text-right">{formatAmount(p.total_buy)}</td>
                            <td className="px-4 py-3 text-right">{formatAmount(p.total_sell)}</td>
                            <td className="px-4 py-3 text-right text-muted-foreground">{formatAmount(p.total_commission)}</td>
                            <td className="px-4 py-3 text-right">
                              <span className={p.realized_pnl >= 0 ? "text-red-500 font-medium" : "text-green-500 font-medium"}>
                                {formatPnl(p.realized_pnl)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={p.realized_pnl_percent >= 0 ? "text-red-500" : "text-green-500"}>
                                {(p.realized_pnl_percent >= 0 ? "+" : "") + p.realized_pnl_percent.toFixed(2) + "%"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">{p.trade_count}</td>
                            <td className="px-4 py-3 text-right">{p.holding_days} 天</td>
                            <td className="px-4 py-3 text-right text-muted-foreground text-xs">
                              {p.first_trade} ~ {p.last_trade}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Time View: per-cycle */}
              {completedGroup === "time" && (
                <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50/80">
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">股票</th>
                          <th className="text-right px-4 py-3 font-medium text-muted-foreground">买入</th>
                          <th className="text-right px-4 py-3 font-medium text-muted-foreground">卖出</th>
                          <th className="text-right px-4 py-3 font-medium text-muted-foreground">手续费</th>
                          <SortableHeader label="收益" sortKey="realized_pnl" currentKey={sortKey} onSort={handleSort} />
                          <SortableHeader label="收益率" sortKey="realized_pnl_percent" currentKey={sortKey} onSort={handleSort} />
                          <th className="text-right px-4 py-3 font-medium text-muted-foreground">交易次数</th>
                          <SortableHeader label="持仓天数" sortKey="holding_days" currentKey={sortKey} onSort={handleSort} />
                          <th className="text-right px-4 py-3 font-medium text-muted-foreground">时间范围</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortData(completedData.positions, sortKey, sortDir).map((p: any, i: number) => (
                          <tr key={p.stock_code + "_" + i} className="border-b last:border-0 hover:bg-gray-50/50">
                            <td className="px-4 py-3">
                              <div className="font-medium">{p.stock_name}</div>
                              <div className="text-xs text-muted-foreground">{p.stock_code}</div>
                            </td>
                            <td className="px-4 py-3 text-right">{formatAmount(p.total_buy)}</td>
                            <td className="px-4 py-3 text-right">{formatAmount(p.total_sell)}</td>
                            <td className="px-4 py-3 text-right text-muted-foreground">{formatAmount(p.total_commission)}</td>
                            <td className="px-4 py-3 text-right">
                              <span className={p.realized_pnl >= 0 ? "text-red-500 font-medium" : "text-green-500 font-medium"}>
                                {formatPnl(p.realized_pnl)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={p.realized_pnl_percent >= 0 ? "text-red-500" : "text-green-500"}>
                                {(p.realized_pnl_percent >= 0 ? "+" : "") + p.realized_pnl_percent.toFixed(2) + "%"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">{p.trade_count}</td>
                            <td className="px-4 py-3 text-right">{p.holding_days} 天</td>
                            <td className="px-4 py-3 text-right text-muted-foreground text-xs">
                              {p.first_trade} ~ {p.last_trade}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* Stock Detail Tab */}        {/* Stock Detail Tab */}
        <TabsContent value="detail">
          {selectedStock && (() => {
            const holding = holdings.find(h => h.stock_code === selectedStock);
            const stockTrades = trades.filter(t => t.stock_code === selectedStock);
            const stockDividends = dividends.filter(d => d.stock_code === selectedStock);
            return (
              <div className="space-y-4">
                <div className="bg-white rounded-xl border shadow-sm p-5">
                  <h3 className="font-semibold mb-3">{holding?.stock_name || selectedStock} - 交易明细</h3>
                  {stockTrades.length === 0 ? (
                    <p className="text-sm text-muted-foreground">暂无交易记录</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-gray-50/80">
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">日期</th>
                            <th className="text-center px-3 py-2 font-medium text-muted-foreground">类型</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">数量</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">价格</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">金额</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stockTrades.map((t) => (
                            <tr key={t.id} className="border-b last:border-0">
                              <td className="px-3 py-2 text-muted-foreground">{t.date}</td>
                              <td className="px-3 py-2 text-center">
                                <span className={"inline-block px-2 py-0.5 rounded text-xs font-medium " + (t.trade_type === "buy" ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600")}>{t.trade_type === "buy" ? "买入" : "卖出"}</span>
                              </td>
                              <td className="px-3 py-2 text-right">{t.shares.toLocaleString()}</td>
                              <td className="px-3 py-2 text-right">{t.price.toFixed(3)}</td>
                              <td className="px-3 py-2 text-right font-medium">{formatAmount(t.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-xl border shadow-sm p-5">
                  <h3 className="font-semibold mb-3">{holding?.stock_name || selectedStock} - 分红记录</h3>
                  {stockDividends.length === 0 ? (
                    <p className="text-sm text-muted-foreground">暂无分红记录</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-gray-50/80">
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">日期</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">每股分红</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">总额</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stockDividends.map((d) => (
                            <tr key={d.id} className="border-b last:border-0">
                              <td className="px-3 py-2 text-muted-foreground">{d.date}</td>
                              <td className="px-3 py-2 text-right">{d.dividend_per_share.toFixed(3)}</td>
                              <td className="px-3 py-2 text-right font-medium text-amber-600">{formatAmount(d.total_amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </TabsContent>
        <TabsContent value="trend">
          <div className="bg-white rounded-xl border shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">每日总资产</h3>
              <Button size="sm" variant="outline" onClick={async () => {
                try { await recordDailyAssets({ totalAssets: totalMarketValue + cashBalance, marketValue: totalMarketValue, cashBalance }); setDailyAssets([...dailyAssets, { date: new Date().toISOString().substring(0, 10), total_assets: totalMarketValue + cashBalance, market_value: totalMarketValue, cash_balance: cashBalance }]); } catch {}
              }}>记录快照</Button>
            </div>
            {dailyAssets.length < 2 ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                暂无足够数据，先刷新行情或点击"记录快照"
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dailyAssets}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => "¥" + (v / 10000).toFixed(1) + "w"} domain={["auto", "auto"]} />
                  <Tooltip formatter={(value: any) => ["¥" + Number(value).toLocaleString("zh-CN", { minimumFractionDigits: 2 })]} />
                  <Line type="monotone" dataKey="total_assets" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="总资产" />
                  <Line type="monotone" dataKey="market_value" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} name="持仓市值" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </TabsContent>

        <TabsContent value="monthly">
          <div className="bg-white rounded-xl border shadow-sm p-5">
            <h3 className="font-semibold mb-4">月度收益</h3>
            {monthlyData.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                暂无已完成交易的月度数据
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => "¥" + v.toLocaleString()} />
                  <Tooltip
                    formatter={(value: any) => ["¥" + Number(value).toLocaleString("zh-CN", { minimumFractionDigits: 2 }), "收益"]}
                    labelFormatter={(label) => label + "月"}
                  />
                  <Bar dataKey="pnl" name="收益" radius={[4, 4, 0, 0]}
                    shape={(props: any) => {
                      const { x, y, width, height, payload } = props;
                      return <rect x={x} y={y} width={width} height={height >= 0 ? height : 0} fill={payload.pnl >= 0 ? "#ef4444" : "#22c55e"} rx={4} />;
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            {monthlyData.map((m: any) => (
              <div key={m.month} className="bg-white rounded-xl border shadow-sm p-4">
                <p className="text-xs text-muted-foreground mb-1">{m.month}</p>
                <p className={"text-sm font-bold " + (m.pnl >= 0 ? "text-red-500" : "text-emerald-600")}>
                  {m.count}笔 {formatPnl(m.pnl)}
                </p>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
      {/* Cash Balance Dialog */}
      <Dialog open={cashDialogOpen} onOpenChange={setCashDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>设置可用余额</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>账户可用资金</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={cashInput} onChange={(e) => setCashInput(e.target.value)} autoFocus />
            </div>
            <Button className="w-full" onClick={async () => {
              const v = parseFloat(cashInput);
              if (!isNaN(v)) {
                await setStockCash(v);
                setCashBalance(v);
                setCashDialogOpen(false);
              }
            }}>保存</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
