import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import {
  Plus, Pencil, Trash2, ArrowUpRight, ArrowDownRight, Search,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import {
  getTransactions, addTransaction, updateTransaction, deleteTransaction,
  getCategories, getAccounts,
} from "../lib/cloud";
import { uuid, formatAmount, formatDate } from "../lib/utils";
import type { Transaction } from "../lib/db";

interface OutletContext {
  year: number; month: number; refreshStats: () => void;
}

export function TransactionsPage() {
  const { year, month, refreshStats } = useOutletContext<OutletContext>();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [txType, setTxType] = useState("expense");
  const [txAmount, setTxAmount] = useState("");
  const [txParentCat, setTxParentCat] = useState("");
  const [txChildCat, setTxChildCat] = useState("");
  const [txAccount, setTxAccount] = useState("");
  const [txDate, setTxDate] = useState("");
  const [txNote, setTxNote] = useState("");

  useEffect(() => { loadData(); }, [year, month]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [txs, cats, accs] = await Promise.all([
        getTransactions(year, month), getCategories(), getAccounts(),
      ]);
      setTransactions(txs as any);
      setCategories(cats as any[]);
      setAccounts(accs as any[]);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const resetForm = () => {
    setTxType("expense");
    setTxAmount("");
    setTxParentCat("");
    setTxChildCat("");
    setTxAccount("default");
    const today = `${year}-${String(month).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;
    setTxDate(today);
    setTxNote("");
    setEditingTx(null);
  };

  const openAdd = () => { resetForm(); setDialogOpen(true); };

  const openEdit = (tx: Transaction) => {
    setEditingTx(tx);
    setTxType(tx.type);
    setTxAmount(String(tx.amount));
    setTxParentCat(tx.category_parent_id || "");
    setTxChildCat(tx.category_parent_id ? tx.category_id : "");
    setTxAccount(tx.account_id);
    setTxDate(tx.date);
    setTxNote(tx.note);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!txAmount || !txChildCat || !txDate) return;
    const finalCatId = txChildCat || txParentCat;
    if (!finalCatId) return;

    const data = {
      type: txType,
      amount: parseFloat(txAmount),
      category_id: finalCatId,
      account_id: txAccount || "default",
      date: txDate,
      note: txNote,
    };
    try {
      if (editingTx) {
        await updateTransaction(editingTx.id, data);
      } else {
        await addTransaction({ id: uuid(), ...data });
      }
      setDialogOpen(false);
      refreshStats();
      loadData();
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确认删除这条记录？")) return;
    try {
      await deleteTransaction(id);
      refreshStats();
      loadData();
    } catch (e) { console.error(e); }
  };

  const filteredParents = categories.filter(
    (c: any) => !c.parent_id && c.type === txType
  );
  const childCats = txParentCat
    ? categories.filter((c: any) => c.parent_id === txParentCat)
    : [];

  const handleParentChange = (val: string) => {
    setTxParentCat(val);
    setTxChildCat("");
  };

  // Client-side search (matches note, category, parent, amount, account)
  const filteredTxs = transactions.filter((tx: Transaction) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const matchNote = (tx.note || "").toLowerCase().includes(q);
    const matchCategory = (tx.category_name || "").toLowerCase().includes(q);
    const matchParent = (tx.parent_name || "").toLowerCase().includes(q);
    const matchAmount = String(tx.amount).includes(q);
    const matchAccount = (tx.account_name || "").toLowerCase().includes(q);
    return matchNote || matchCategory || matchParent || matchAmount || matchAccount;
  });

  // Group by date
  const grouped: Record<string, Transaction[]> = {};
  for (const tx of filteredTxs) {
    if (!grouped[tx.date]) grouped[tx.date] = [];
    grouped[tx.date].push(tx);
  }

  const today = `${year}-${String(month).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">收支记录</h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索备注、分类、账户、金额..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9 w-64 text-sm"
            />
          </div>
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4 mr-2" />新增记录
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="mb-2">{searchQuery ? "没有匹配的记录" : "本月暂无记录"}</p>
          {!searchQuery && (
            <Button variant="outline" onClick={openAdd}>
              <Plus className="h-4 w-4 mr-2" />记一笔
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([date, txs]) => (
            <div key={date}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-muted-foreground">
                  {formatDate(date)}
                </span>
                {date === today && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">今天</span>
                )}
              </div>
              <div className="bg-white rounded-xl border shadow-sm divide-y">
                {txs.map((tx) => {
                  const showAccount = tx.account_name && tx.account_name !== "现金";
                  return (
                    <div key={tx.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors group">
                      <div className="flex items-center gap-3">
                        <div className={"p-2 rounded-lg " + (tx.type === "income" ? "bg-emerald-50" : "bg-red-50")}>
                          {tx.type === "income" ? (
                            <ArrowUpRight className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <ArrowDownRight className="h-4 w-4 text-red-500" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {tx.parent_name ? <span className="text-muted-foreground">{tx.parent_name} </span> : null}
                            {tx.category_name || "未分类"}
                          </p>
                          {tx.note ? <p className="text-xs text-muted-foreground">{tx.note}</p> : null}
                          {showAccount ? <p className="text-xs text-muted-foreground/60 mt-0.5">{tx.account_name}</p> : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={"text-sm font-semibold " + (tx.type === "income" ? "income-text" : "expense-text")}>
                          {tx.type === "income" ? "+" : "-"}{formatAmount(tx.amount)}
                        </span>
                        <div className="hidden group-hover:flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(tx)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => handleDelete(tx.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTx ? "编辑记录" : "新增记录"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex gap-2">
              <Button variant={txType === "expense" ? "default" : "outline"} className="flex-1"
                onClick={() => { setTxType("expense"); setTxParentCat(""); setTxChildCat(""); }}>
                支出
              </Button>
              <Button variant={txType === "income" ? "default" : "outline"} className="flex-1"
                onClick={() => { setTxType("income"); setTxParentCat(""); setTxChildCat(""); }}>
                收入
              </Button>
            </div>

            <div className="space-y-2">
              <Label>金额</Label>
              <Input type="number" step="0.01" min="0" placeholder="0.00"
                value={txAmount} onChange={(e) => setTxAmount(e.target.value)} autoFocus />
            </div>

            <div className="space-y-2">
              <Label>大类</Label>
              <Select value={txParentCat} onValueChange={handleParentChange}>
                <SelectTrigger><SelectValue placeholder="选择大类" /></SelectTrigger>
                <SelectContent>
                  {filteredParents.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                        {c.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>明细分类</Label>
              <Select value={txChildCat} onValueChange={setTxChildCat} disabled={!txParentCat}>
                <SelectTrigger><SelectValue placeholder={txParentCat ? "选择明细分类" : "请先选择大类"} /></SelectTrigger>
                <SelectContent>
                  {childCats.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                        {c.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>日期</Label>
              <Input type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>账户</Label>
              <Select value={txAccount} onValueChange={setTxAccount}>
                <SelectTrigger><SelectValue placeholder="选择账户" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>备注（可选）</Label>
              <Input placeholder="备注" value={txNote} onChange={(e) => setTxNote(e.target.value)} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button onClick={handleSave} disabled={!txAmount || (!txChildCat && !txParentCat)}>
                {editingTx ? "保存修改" : "添加"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
