import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "../components/ui/button";
import { uuid } from "../lib/utils";
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
  getCategories,
  addCategory,
  updateCategory,
  deleteCategory,
} from "../lib/cloud";

const COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f43f5e", "#6b7280",
];

export function CategoriesPage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  // Form
  const [catName, setCatName] = useState("");
  const [catType, setCatType] = useState("expense");
  const [catParent, setCatParent] = useState<string>("__none__");
  const [catColor, setCatColor] = useState("#6b7280");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const cats = await getCategories();
      setCategories(cats as any[]);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const resetForm = () => {
    setCatName("");
    setCatType("expense");
    setCatParent("__none__");
    setCatColor("#6b7280");
    setEditing(null);
  };

  const openAdd = (parentId?: string) => {
    resetForm();
    if (parentId) {
      setCatParent(parentId);
    }
    setDialogOpen(true);
  };

  const openEdit = (cat: any) => {
    setEditing(cat);
    setCatName(cat.name);
    setCatType(cat.type);
    setCatParent(cat.parent_id || "__none__");
    setCatColor(cat.color);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!catName) return;
    const isSub = catParent !== "__none__" && catParent !== "";
    try {
      if (editing) {
        await updateCategory(editing.id, {
          name: catName,
          icon: editing.icon,
          color: catColor,
        });
      } else {
        const parentCat = isSub
          ? categories.find((c: any) => c.id === catParent)
          : null;
        await addCategory({
          id: uuid(),
          name: catName,
          type: isSub ? (parentCat?.type || catType) : catType,
          parent_id: isSub ? catParent : null,
          icon: "circle",
          color: catColor,
          sort_order: categories.length,
        });
      }
      setDialogOpen(false);
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCategory(id);
      loadData();
    } catch (e: any) {
      alert(e?.toString() || "删除失败");
    }
  };

  // Available parents for the current type filter
  const availableParents = categories.filter(
    (c: any) => !c.parent_id && (typeFilter === "all" || c.type === typeFilter)
  );

  // Filtered display
  const filteredParents = categories.filter(
    (c: any) => !c.parent_id && (typeFilter === "all" || c.type === typeFilter)
  );
  const getChildren = (parentId: string) =>
    categories.filter(
      (c: any) =>
        c.parent_id === parentId &&
        (typeFilter === "all" || c.type === typeFilter)
    );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">分类管理</h2>
          <div className="flex bg-white rounded-lg border overflow-hidden">
            <button
              className={`px-3 py-1.5 text-sm ${
                typeFilter === "all" ? "bg-primary text-white" : ""
              }`}
              onClick={() => setTypeFilter("all")}
            >
              全部
            </button>
            <button
              className={`px-3 py-1.5 text-sm ${
                typeFilter === "expense" ? "bg-primary text-white" : ""
              }`}
              onClick={() => setTypeFilter("expense")}
            >
              支出
            </button>
            <button
              className={`px-3 py-1.5 text-sm ${
                typeFilter === "income" ? "bg-primary text-white" : ""
              }`}
              onClick={() => setTypeFilter("income")}
            >
              收入
            </button>
          </div>
        </div>
        <Button onClick={() => openAdd()}>
          <Plus className="h-4 w-4 mr-2" />
          新增分类
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <div className="space-y-2">
          {filteredParents.map((parent: any) => {
            const children = getChildren(parent.id);
            const isExpanded = expandedParents.has(parent.id);

            return (
              <div key={parent.id}>
                {/* Parent row */}
                <div className="bg-white rounded-xl border shadow-sm p-4 flex items-center justify-between group hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3 flex-1">
                    {children.length > 0 && (
                      <button
                        onClick={() => {
                          const next = new Set(expandedParents);
                          if (isExpanded) next.delete(parent.id);
                          else next.add(parent.id);
                          setExpandedParents(next);
                        }}
                        className="p-0.5 hover:bg-gray-100 rounded"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                    )}
                    {children.length === 0 && <div className="w-5" />}
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-medium shrink-0"
                      style={{ backgroundColor: parent.color }}
                    >
                      {parent.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{parent.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {parent.type === "expense" ? "支出" : "收入"}
                        {children.length > 0 && ` · ${children.length} 个子分类`}
                      </p>
                    </div>
                  </div>
                  <div className="hidden group-hover:flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => openAdd(parent.id)}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      子分类
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEdit(parent)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500"
                      onClick={() => handleDelete(parent.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Children */}
                {isExpanded && children.length > 0 && (
                  <div className="ml-8 mt-1 space-y-1">
                    {children.map((child: any) => (
                      <div
                        key={child.id}
                        className="bg-white rounded-lg border shadow-sm px-4 py-2.5 flex items-center justify-between group hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: child.color }} />
                          <p className="text-sm">{child.name}</p>
                        </div>
                        <div className="hidden group-hover:flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openEdit(child)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-500"
                            onClick={() => handleDelete(child.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {filteredParents.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              暂无分类
            </div>
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑分类" : "新增分类"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!editing && !catParent && (
              <div className="flex gap-2">
                <Button
                  variant={catType === "expense" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setCatType("expense")}
                >
                  支出分类
                </Button>
                <Button
                  variant={catType === "income" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setCatType("income")}
                >
                  收入分类
                </Button>
              </div>
            )}

            {!editing && (
              <div className="space-y-2">
                <Label>所属大类（选填，不选则创建一级分类）</Label>
                <Select value={catParent} onValueChange={(v) => {
                  setCatParent(v);
                  if (v !== "__none__") {
                    const p = categories.find((c: any) => c.id === v);
                    if (p) setCatColor(p.color);
                  }
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择大类" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">作为一级分类</SelectItem>
                    {availableParents.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.type === "expense" ? "📤 " : "📥 "}
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>名称</Label>
              <Input
                placeholder="分类名称"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label>颜色</Label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    className={`w-7 h-7 rounded-full border-2 ${
                      catColor === c ? "border-gray-800 scale-110" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                    onClick={() => setCatColor(c)}
                  />
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleSave} disabled={!catName}>
                {editing ? "保存" : "添加"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
