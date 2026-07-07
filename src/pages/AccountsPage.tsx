import { useState, useEffect } from "react";
import { Wallet, Banknote, CreditCard, TrendingUp, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { getAccounts, addAccount, updateAccount, deleteAccount } from "../lib/cloud";
import { uuid, formatAmount } from "../lib/utils";

const accountTypes = [
  { value: "cash", label: "现金", icon: Banknote },
  { value: "bank", label: "银行", icon: Wallet },
  { value: "credit", label: "信用卡", icon: CreditCard },
  { value: "investment", label: "投资", icon: TrendingUp },
];

export function AccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  // Form
  const [accName, setAccName] = useState("");
  const [accType, setAccType] = useState("cash");
  const [accBalance, setAccBalance] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const accs = await getAccounts();
      setAccounts(accs as any[]);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const resetForm = () => {
    setAccName("");
    setAccType("cash");
    setAccBalance("");
    setEditing(null);
    setErrorMsg("");
  };

  const openAdd = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (acc: any) => {
    setEditing(acc);
    setAccName(acc.name);
    setAccType(acc.type);
    setAccBalance(String(acc.balance));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!accName) return;
    try {
      if (editing) {
        await updateAccount(editing.id, { name: accName, type: accType });
      } else {
        await addAccount({
          id: uuid(),
          name: accName,
          type: accType,
          balance: parseFloat(accBalance) || 0,
        });
      }
      setDialogOpen(false);
      loadData();
    } catch (e: any) { setErrorMsg(e?.toString() || "添加失败"); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确认删除账户「${name}」？此操作不可撤销。`)) return;
    try {
      await deleteAccount(id);
      loadData();
    } catch (e: any) {
      alert(e?.toString() || "删除失败");
    }
  };

  const totalBalance = accounts.reduce((s: number, a: any) => s + a.balance, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">账户管理</h2>
          <p className="text-sm text-muted-foreground">
            总资产：{formatAmount(totalBalance)}
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4 mr-2" />新增账户
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {accounts.map((acc: any) => {
            const typeDef = accountTypes.find((t) => t.value === acc.type) || accountTypes[0];
            const Icon = typeDef.icon;
            return (
              <div key={acc.id} className="bg-white rounded-xl border shadow-sm p-5 hover:shadow-md transition-shadow group">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-50 rounded-lg text-blue-600">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium">{acc.name}</p>
                      <p className="text-xs text-muted-foreground">{typeDef.label}</p>
                    </div>
                  </div>
                  <div className="hidden group-hover:flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(acc)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8 text-red-500"
                      onClick={() => handleDelete(acc.id, acc.name)}
                      disabled={accounts.length <= 1}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <p className="text-2xl font-bold">{formatAmount(acc.balance)}</p>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑账户" : "新增账户"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>账户名称</Label>
              <Input
                placeholder="如：工资卡、支付宝"
                value={accName}
                onChange={(e) => setAccName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label>类型</Label>
              <Select value={accType} onValueChange={setAccType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accountTypes.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!editing && (
              <div className="space-y-2">
                <Label>初始余额 (¥)</Label>
                <Input
                  type="number" step="0.01" placeholder="0.00"
                  value={accBalance}
                  onChange={(e) => setAccBalance(e.target.value)}
                />
              </div>
            )}

            {errorMsg && (
              <p className="text-sm text-red-500 text-center">{errorMsg}</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button onClick={handleSave} disabled={!accName}>
                {editing ? "保存" : "添加"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
