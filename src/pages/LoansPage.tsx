import { useState, useEffect } from "react";
import {
  Plus, Pencil, Trash2, CheckCircle2, Circle, Download, Upload,
  DollarSign, Settings2, Lock, Calendar,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose,
} from "../components/ui/dialog";
import { formatAmount } from "../lib/utils";
import {
  hasLoanPassword, setupLoanPassword, verifyLoanPassword,
  getLoans, addLoan, updateLoan, deleteLoan, toggleLoanStatus,
  importLoans, exportLoans,
  getLoanSetting, setLoanSetting,
} from "../lib/cloud";

interface Loan {
  id: string;
  platform: string;
  due_date: string;
  amount: number;
  status: string;
  paid_date: string | null;
  note: string;
  overdue?: boolean;
}

function LoanLockPage({ onUnlock }: { onUnlock: () => void }) {
  const [isFirstRun, setIsFirstRun] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    hasLoanPassword()
      .then((has) => { setIsFirstRun(!has); setLoading(false); })
      .catch(() => { setLoading(false); });
  }, []);

  const handleSetup = async () => {
    setError("");
    if (password.length < 4) { setError("密码至少4位"); return; }
    if (password !== confirmPassword) { setError("两次密码输入不一致"); return; }
    try {
      await setupLoanPassword(password);
      onUnlock();
    } catch (e: any) { setError(e.message); }
  };

  const handleVerify = async () => {
    setError("");
    if (!password) { setError("请输入密码"); return; }
    const ok = await verifyLoanPassword(password);
    if (ok) onUnlock();
    else setError("密码错误");
  };

  if (loading) return null;

  return (
    <div className="flex items-center justify-center h-[80vh]">
      <div className="w-full max-w-sm space-y-6 p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">贷款管理</h2>
          <p className="text-sm text-muted-foreground">
            {isFirstRun ? "首次使用，请设置贷款模块密码" : "请输入贷款模块密码"}
          </p>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>密码</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (isFirstRun ? handleSetup : handleVerify)()}
              placeholder="请输入密码"
            />
          </div>
          {isFirstRun && (
            <div className="space-y-2">
              <Label>确认密码</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSetup()}
                placeholder="再次输入密码"
              />
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            className="w-full"
            onClick={isFirstRun ? handleSetup : handleVerify}
          >
            {isFirstRun ? "设置密码并进入" : "进入"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function LoansPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [formPlatform, setFormPlatform] = useState("");
  const [formDueDate, setFormDueDate] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formNote, setFormNote] = useState("");

  if (!unlocked) {
    return <LoanLockPage onUnlock={() => setUnlocked(true)} />;
  }

  const loadLoans = async () => {
    setLoading(true);
    try {
      const data = await getLoans(statusFilter || undefined);
      setLoans(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const loadWebhook = async () => {
    try {
      const url = await getLoanSetting("webhook_url");
      setWebhookUrl(url);
    } catch {}
  };

  useEffect(() => { loadLoans(); }, [statusFilter]);

  const resetForm = () => {
    setFormPlatform("");
    setFormDueDate(new Date().toISOString().slice(0, 10));
    setFormAmount("");
    setFormNote("");
    setEditingLoan(null);
  };

  const openAdd = () => { resetForm(); setDialogOpen(true); };

  const openEdit = (loan: Loan) => {
    setEditingLoan(loan);
    setFormPlatform(loan.platform);
    setFormDueDate(loan.due_date);
    setFormAmount(String(loan.amount));
    setFormNote(loan.note || "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formPlatform || !formDueDate || !formAmount) return;
    const data = {
      platform: formPlatform,
      due_date: formDueDate,
      amount: parseFloat(formAmount),
      note: formNote,
    };
    try {
      if (editingLoan) {
        await updateLoan(editingLoan.id, data);
      } else {
        await addLoan(data);
      }
      setDialogOpen(false);
      loadLoans();
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确认删除这条记录？")) return;
    try {
      await deleteLoan(id);
      loadLoans();
    } catch (e) { console.error(e); }
  };

  const handleToggle = async (id: string) => {
    try {
      await toggleLoanStatus(id);
      loadLoans();
    } catch (e) { console.error(e); }
  };

  const handleImport = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const count = await importLoans(file);
        alert(`成功导入 ${count} 条记录`);
        loadLoans();
      } catch (e: any) {
        alert(e.message);
      }
    };
    input.click();
  };

  const handleExport = async () => {
    try {
      await exportLoans();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleSaveWebhook = async () => {
    try {
      await setLoanSetting("webhook_url", webhookUrl);
      setSettingsOpen(false);
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <DollarSign className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">贷款管理</h1>
            <p className="text-sm text-muted-foreground">
              {loans.filter(l => l.status === "待还").length} 笔待还 | 共 {loans.length} 笔
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleImport}>
            <Upload className="h-4 w-4 mr-1.5" />
            导入
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1.5" />
            导出
          </Button>
          <Button variant="outline" size="sm" onClick={() => { loadWebhook(); setSettingsOpen(true); }}>
            <Settings2 className="h-4 w-4 mr-1.5" />
            设置
          </Button>
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1.5" />
            新增
          </Button>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setStatusFilter("")}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            !statusFilter ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
          }`}
        >
          全部
        </button>
        <button
          onClick={() => setStatusFilter("待还")}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            statusFilter === "待还" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
          }`}
        >
          待还
        </button>
        <button
          onClick={() => setStatusFilter("已还")}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            statusFilter === "已还" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
          }`}
        >
          已还
        </button>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">平台</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">还款日</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">当期应还金额</th>
              <th className="text-center px-4 py-3 text-sm font-medium text-muted-foreground">状态</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-sm text-muted-foreground">
                  加载中...
                </td>
              </tr>
            ) : loans.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-sm text-muted-foreground">
                  暂无贷款记录，点击"新增"添加
                </td>
              </tr>
            ) : (
              loans.map((loan) => {
                const isOverdue = loan.status === "待还" && loan.due_date < new Date().toISOString().slice(0, 10);
                return (
                  <tr key={loan.id} className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${isOverdue ? "bg-red-50/50" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${isOverdue ? "text-destructive" : ""}`}>
                          {loan.platform}
                        </span>
                        {isOverdue && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-medium">
                            逾期
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-sm">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        {loan.due_date}
                      </div>
                    </td>
                    <td className={`px-4 py-3 text-right text-sm font-medium tabular-nums ${isOverdue ? "text-destructive" : ""}`}>
                      {formatAmount(loan.amount)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggle(loan.id)}
                        className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full transition-colors ${
                          loan.status === "已还"
                            ? "bg-green-100 text-green-700 hover:bg-green-200"
                            : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                        }`}
                      >
                        {loan.status === "已还" ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <Circle className="h-3 w-3" />
                        )}
                        {loan.status}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(loan)} title="编辑">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(loan.id)} title="删除">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) setDialogOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingLoan ? "编辑贷款记录" : "新增贷款记录"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>平台</Label>
              <Input
                value={formPlatform}
                onChange={(e) => setFormPlatform(e.target.value)}
                placeholder="如：花呗、借呗、信用卡"
              />
            </div>
            <div className="space-y-2">
              <Label>还款日</Label>
              <Input
                type="date"
                value={formDueDate}
                onChange={(e) => setFormDueDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>当期应还金额</Label>
              <Input
                type="number"
                step="0.01"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label>备注（可选）</Label>
              <Input
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                placeholder="备注信息"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <DialogClose asChild>
                <Button variant="outline">取消</Button>
              </DialogClose>
              <Button onClick={handleSave}>
                {editingLoan ? "保存" : "新增"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={(open) => { if (!open) setSettingsOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>贷款模块设置</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>飞书 Webhook URL</Label>
              <Input
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
              />
              <p className="text-xs text-muted-foreground">
                在飞书群中添加自定义机器人，复制 Webhook 地址粘贴到这里。每天 9:00 会自动提醒当天和次日到期的还款。
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <DialogClose asChild>
                <Button variant="outline">取消</Button>
              </DialogClose>
              <Button onClick={handleSaveWebhook}>保存</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
