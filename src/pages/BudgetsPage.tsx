import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { PiggyBank, AlertTriangle } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  getBudgets,
  setBudget,
  deleteBudget,
  getCategories,
} from "../lib/cloud";
import { formatAmount } from "../lib/utils";

interface OutletContext {
  year: number;
  month: number;
}

export function BudgetsPage() {
  const { year, month } = useOutletContext<OutletContext>();
  const [budgets, setBudgets] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  // Form
  const [budgetCategory, setBudgetCategory] = useState("");
  const [budgetAmount, setBudgetAmount] = useState("");

  const monthStr = `${year}-${String(month).padStart(2, "0")}`;

  useEffect(() => {
    loadData();
  }, [year, month]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [b, c] = await Promise.all([
        getBudgets(monthStr),
        getCategories("expense"),
      ]);
      setBudgets(b as any[]);
      setCategories(c as any[]);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const resetForm = () => {
    setBudgetCategory("");
    setBudgetAmount("");
    setEditing(null);
  };

  const openAdd = () => {
    resetForm();
    const existingCats = budgets.map((b) => b.category_id);
    const available = categories.filter((c) => !existingCats.includes(c.id));
    if (available.length > 0) setBudgetCategory(available[0].id);
    setDialogOpen(true);
  };

  const openEdit = (b: any) => {
    setEditing(b);
    setBudgetCategory(b.category_id);
    setBudgetAmount(String(b.amount));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!budgetCategory || !budgetAmount) return;
    try {
      await setBudget({
        id: editing?.id || crypto.randomUUID(),
        category_id: budgetCategory,
        amount: parseFloat(budgetAmount),
        month: monthStr,
      });
      setDialogOpen(false);
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确认删除这个预算？")) return;
    try {
      await deleteBudget(id);
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const totalBudget = budgets.reduce((s, b) => s + b.amount, 0);
  const totalSpent = budgets.reduce((s, b) => s + (b.spent || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">预算管理</h2>
          <p className="text-sm text-muted-foreground">{monthStr}</p>
        </div>
        <Button onClick={openAdd} disabled={categories.length === budgets.length}>
          <PiggyBank className="h-4 w-4 mr-2" />
          添加预算
        </Button>
      </div>

      {/* Overall progress */}
      {budgets.length > 0 && (
        <div className="bg-white rounded-xl border shadow-sm p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">总预算进度</span>
            <span className="text-sm font-medium">
              {formatAmount(totalSpent)} / {formatAmount(totalBudget)}
              {totalBudget > 0 && (
                <span className="ml-1 text-muted-foreground">
                  ({Math.round((totalSpent / totalBudget) * 100)}%)
                </span>
              )}
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                totalSpent > totalBudget
                  ? "bg-red-500"
                  : totalSpent > totalBudget * 0.8
                  ? "bg-amber-500"
                  : "bg-primary"
              }`}
              style={{
                width: `${Math.min(
                  (totalSpent / (totalBudget || 1)) * 100,
                  100
                )}%`,
              }}
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : budgets.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="mb-2">暂无预算设置</p>
          <Button variant="outline" onClick={openAdd}>
            <PiggyBank className="h-4 w-4 mr-2" />
            添加预算
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {budgets.map((b) => {
            const pct =
              b.amount > 0
                ? Math.min(Math.round(((b.spent || 0) / b.amount) * 100), 100)
                : 0;
            const isOver = (b.spent || 0) > b.amount;
            const isWarning = !isOver && pct > 80;

            return (
              <div
                key={b.id}
                className="bg-white rounded-xl border shadow-sm p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: b.category_color || "#6b7280" }}
                    />
                    <span className="font-medium text-sm">
                      {b.category_name || "未知"}
                    </span>
                    {isOver && (
                      <span className="flex items-center gap-1 text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
                        <AlertTriangle className="h-3 w-3" />
                        已超支
                      </span>
                    )}
                    {isWarning && !isOver && (
                      <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                        接近限额
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">
                      <span
                        className={
                          isOver ? "text-red-500 font-semibold" : "font-medium"
                        }
                      >
                        {formatAmount(b.spent || 0)}
                      </span>
                      <span className="text-muted-foreground">
                        {" "}
                        / {formatAmount(b.amount)}
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => openEdit(b)}
                    >
                      编辑
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-red-500"
                      onClick={() => handleDelete(b.id)}
                    >
                      删除
                    </Button>
                  </div>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      isOver
                        ? "bg-red-500"
                        : isWarning
                        ? "bg-amber-500"
                        : "bg-primary"
                    }`}
                    style={{ width: `${isOver ? 100 : pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editing ? "编辑预算" : "添加预算"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>分类</Label>
              <Select
                value={budgetCategory}
                onValueChange={setBudgetCategory}
                disabled={!!editing}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择分类" />
                </SelectTrigger>
                <SelectContent>
                  {categories
                    .filter(
                      (c) =>
                        editing ||
                        !budgets.some((b) => b.category_id === c.id)
                    )
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>预算金额 (¥)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={budgetAmount}
                onChange={(e) => setBudgetAmount(e.target.value)}
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                取消
              </Button>
              <Button
                onClick={handleSave}
                disabled={!budgetCategory || !budgetAmount}
              >
                {editing ? "保存" : "添加"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
