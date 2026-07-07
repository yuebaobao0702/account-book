import { useState } from "react";
import { Info, Lock, Download, Upload, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { verifyPassword, setPassword } from "../lib/cloud";
import { exportCSV, exportExcel, exportPDF, importCSV, importExcel } from "../lib/export";

export function SettingsPage() {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [importing, setImporting] = useState(false);

  const handleChangePassword = async () => {
    setMessage(null);
    if (!currentPw) { setMessage({ type: "error", text: "请输入当前密码" }); return; }
    if (newPw.length < 4) { setMessage({ type: "error", text: "新密码至少4位" }); return; }
    if (newPw !== confirmPw) { setMessage({ type: "error", text: "两次密码输入不一致" }); return; }
    try {
      const ok = await verifyPassword(currentPw);
      if (!ok) { setMessage({ type: "error", text: "当前密码错误" }); return; }
      await setPassword(newPw);
      setMessage({ type: "success", text: "密码修改成功" });
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    } catch { setMessage({ type: "error", text: "修改失败，请重试" }); }
  };

  const handleExport = async (format: string) => {
    setMessage(null);
    try {
      if (format === "csv") await exportCSV();
      else if (format === "excel") await exportExcel();
      else if (format === "pdf") await exportPDF();
      setMessage({ type: "success", text: `${format.toUpperCase()} 导出成功` });
    } catch (e: any) {
      setMessage({ type: "error", text: `导出失败: ${e?.toString() || "未知错误"}` });
    }
  };

  const handleImport = async (format: string) => {
    setMessage(null);
    setImporting(true);
    try {
      let count = 0;
      if (format === "csv") count = await importCSV();
      else if (format === "excel") count = await importExcel();
      setMessage({ type: "success", text: `导入完成，共 ${count} 条记录` });
    } catch (e: any) {
      setMessage({ type: "error", text: `导入失败: ${e?.toString() || "未知错误"}` });
    }
    setImporting(false);
  };

  return (
    <div className="max-w-lg">
      <h2 className="text-lg font-semibold mb-6">设置</h2>

      {/* Data Import/Export */}
      <div className="bg-white rounded-xl border shadow-sm p-5 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-green-50 rounded-lg">
            <Download className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <h3 className="font-medium">数据导入导出</h3>
            <p className="text-xs text-muted-foreground">备份或迁移你的记账数据</p>
          </div>
        </div>

        <div className="mb-4">
          <p className="text-sm font-medium text-muted-foreground mb-2">导出数据</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => handleExport("csv")}>
              <FileText className="h-4 w-4 mr-2" />CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport("excel")}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport("pdf")}>
              <FileText className="h-4 w-4 mr-2" />PDF
            </Button>
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-muted-foreground mb-2">导入数据</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => handleImport("csv")} disabled={importing}>
              <Upload className="h-4 w-4 mr-2" />导入 CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleImport("excel")} disabled={importing}>
              <Upload className="h-4 w-4 mr-2" />导入 Excel
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            导入格式：日期,类型(收入/支出),金额,分类,账户,备注
          </p>
        </div>
        {message && <p className={"text-sm mt-3 " + (message.type === "success" ? "text-emerald-600" : "text-red-500")}>{message.text}</p>}
      </div>

      {/* Change Password */}
      <div className="bg-white rounded-xl border shadow-sm p-5 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-amber-50 rounded-lg">
            <Lock className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h3 className="font-medium">修改密码</h3>
            <p className="text-xs text-muted-foreground">修改应用的解锁密码</p>
          </div>
        </div>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>当前密码</Label>
            <Input type="password" placeholder="输入当前密码" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>新密码</Label>
            <Input type="password" placeholder="输入新密码（至少4位）" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>确认新密码</Label>
            <Input type="password" placeholder="再次输入新密码" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
          </div>
          <Button onClick={handleChangePassword}>修改密码</Button>
          {message && <p className={"text-sm " + (message.type === "success" ? "text-emerald-600" : "text-red-500")}>{message.text}</p>}
        </div>
      </div>

      {/* About */}
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-blue-50 rounded-lg">
            <Info className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-medium">关于</h3>
          </div>
        </div>
        <div className="text-sm text-muted-foreground space-y-1">
          <p>账本 v1.0.0</p>
          <p>个人财务管理桌面应用</p>
          <p>数据本地存储，安全可靠</p>
        </div>
      </div>
    </div>
  );
}
