import { getDb } from "./db";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

async function getAllTransactions() {
  // Try cloud API first, fall back to local SQLite for import/export
  try {
    const res = await fetch("http://124.221.16.90:3004/api/export/csv", {
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      // Parse CSV and return as objects
      const csvText = await res.text();
      return parseCSVToObjects(csvText);
    }
  } catch (_e) {
    // Fallback to local
  }
  // Fallback: local SQLite
  const d = await getDb();
  return await d.select(
    "SELECT t.date, t.type, t.amount, c.name as category, " +
    "p.name as parent_category, a.name as account, t.note " +
    "FROM transactions t " +
    "LEFT JOIN categories c ON t.category_id = c.id " +
    "LEFT JOIN categories p ON c.parent_id = p.id " +
    "LEFT JOIN accounts a ON t.account_id = a.id " +
    "ORDER BY t.date DESC, t.created_at DESC"
  );
}

function getAuthHeaders(): Record<string, string> {
  // Try to get the password from the cloud module
  try {
    // We dynamically access the module
    return { "x-app-password": "" };
  } catch {
    return {};
  }
}

function parseCSVToObjects(csvText: string): any[] {
  const lines = csvText.split("\n").filter((l: string) => l.trim());
  if (lines.length < 1) return [];
  const headers = parseCSVLine(lines[0]);
  const result: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    if (vals.length < headers.length) continue;
    const obj: any = {};
    headers.forEach((h: string, j: number) => {
      obj[h] = vals[j];
    });
    result.push({
      date: obj["日期"] || "",
      type: obj["类型"] === "收入" ? "income" : "expense",
      amount: parseFloat(obj["金额"]) || 0,
      category: obj["明细分类"] || "",
      parent_category: obj["大类"] || "",
      account: obj["账户"] || "",
      note: obj["备注"] || "",
    });
  }
  return result;
}

export async function exportCSV() {
  const rows = await getAllTransactions() as any[];
  let csv = "\uFEFF日期,类型,金额,大类,明细分类,账户,备注\n";
  for (const r of rows) {
    const type = r.type === "income" ? "收入" : "支出";
    const date = r.date || "";
    const cat = r.parent_category ? r.parent_category + "/" + r.category : (r.category || "");
    const note = (r.note || "").replace(/"/g, '""');
    csv += date + "," + type + "," + (r.amount || 0) + ',"' + cat + '",' + (r.account || "") + ',"' + note + '"\n';
  }
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({ filters: [{ name: "CSV 文件", extensions: ["csv"] }], defaultPath: "账本_" + new Date().toISOString().slice(0, 10) + ".csv" });
    if (!path) return;
    await writeTextFile(path, csv);
  } else {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "账本_" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export async function exportExcel() {
  const rows = await getAllTransactions() as any[];
  const headerRow = ["日期", "类型", "金额", "大类", "明细分类", "账户", "备注"];
  const bodyRows = rows.map(function(r: any) {
    return [
      r.date || "",
      r.type === "income" ? "收入" : "支出",
      r.amount || 0,
      r.parent_category || "",
      r.category || "",
      r.account || "",
      r.note || "",
    ];
  });
  const sheetData = [headerRow];
  for (const row of bodyRows) {
    sheetData.push(row);
  }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  ws["!cols"] = [
    { wch: 12 }, { wch: 6 }, { wch: 10 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "收支记录");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({ filters: [{ name: "Excel 文件", extensions: ["xlsx"] }], defaultPath: "账本_" + new Date().toISOString().slice(0, 10) + ".xlsx" });
    if (!path) return;
    await writeFile(path, buf);
  } else {
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "账本_" + new Date().toISOString().slice(0, 10) + ".xlsx";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export async function exportPDF() {
  const rows = await getAllTransactions() as any[];

  const incomeTotal = rows.filter(function(r: any) { return r.type === "income"; })
    .reduce(function(s: number, r: any) { return s + r.amount; }, 0);
  const expenseTotal = rows.filter(function(r: any) { return r.type === "expense"; })
    .reduce(function(s: number, r: any) { return s + r.amount; }, 0);
  const balance = incomeTotal - expenseTotal;

  let tableBody = "";
  for (const r of rows) {
    const cat = r.parent_category ? r.parent_category + " > " + r.category : (r.category || "");
    const amt = r.type === "income" ? r.amount.toFixed(2) : "";
    const exp = r.type === "expense" ? r.amount.toFixed(2) : "";
    const tp = r.type === "income" ? "\u6536\u5165" : "\u652f\u51fa";
    tableBody += "<tr>" +
      "<td style=\"padding:3px 6px;border:1px solid #ccc;font-size:10px;\">" + r.date + "</td>" +
      "<td style=\"padding:3px 6px;border:1px solid #ccc;font-size:10px;\">" + tp + "</td>" +
      "<td style=\"padding:3px 6px;border:1px solid #ccc;font-size:10px;text-align:right;\">" + amt + "</td>" +
      "<td style=\"padding:3px 6px;border:1px solid #ccc;font-size:10px;text-align:right;\">" + exp + "</td>" +
      "<td style=\"padding:3px 6px;border:1px solid #ccc;font-size:10px;\">" + cat + "</td>" +
      "<td style=\"padding:3px 6px;border:1px solid #ccc;font-size:10px;\">" + (r.account || "") + "</td>" +
      "<td style=\"padding:3px 6px;border:1px solid #ccc;font-size:10px;\">" + (r.note || "") + "</td>" +
      "</tr>";
  }

  const html = "<div style=\"width:750px;padding:15px;font-family:PingFang SC,Microsoft YaHei,sans-serif;\">" +
    "<h1 style=\"text-align:center;font-size:18px;margin:0 0 4px 0;\">\u8d26\u672c - \u6536\u652f\u8bb0\u5f55</h1>" +
    "<p style=\"text-align:center;font-size:11px;color:#666;margin:0 0 12px 0;\">\u5bfc\u51fa\u65f6\u95f4: " + new Date().toLocaleString("zh-CN") + "</p>" +
    "<table style=\"width:100%;border-collapse:collapse;\">" +
    "<thead><tr style=\"background:#3b82f6;color:white;\">" +
    "<th style=\"padding:4px 8px;border:1px solid #3b82f6;text-align:left;font-size:11px;\">\u65e5\u671f</th>" +
    "<th style=\"padding:4px 8px;border:1px solid #3b82f6;text-align:left;font-size:11px;\">\u7c7b\u578b</th>" +
    "<th style=\"padding:4px 8px;border:1px solid #3b82f6;text-align:right;font-size:11px;\">\u6536\u5165</th>" +
    "<th style=\"padding:4px 8px;border:1px solid #3b82f6;text-align:right;font-size:11px;\">\u652f\u51fa</th>" +
    "<th style=\"padding:4px 8px;border:1px solid #3b82f6;text-align:left;font-size:11px;\">\u5206\u7c7b</th>" +
    "<th style=\"padding:4px 8px;border:1px solid #3b82f6;text-align:left;font-size:11px;\">\u8d26\u6237</th>" +
    "<th style=\"padding:4px 8px;border:1px solid #3b82f6;text-align:left;font-size:11px;\">\u5907\u6ce8</th>" +
    "</tr></thead><tbody>" +
    tableBody +
    "<tr style=\"background:#f3f4f6;font-weight:bold;\">" +
    "<td style=\"padding:3px 6px;border:1px solid #ccc;font-size:10px;\"></td>" +
    "<td style=\"padding:3px 6px;border:1px solid #ccc;font-size:10px;\">\u5408\u8ba1</td>" +
    "<td style=\"padding:3px 6px;border:1px solid #ccc;font-size:10px;text-align:right;\">" + incomeTotal.toFixed(2) + "</td>" +
    "<td style=\"padding:3px 6px;border:1px solid #ccc;font-size:10px;text-align:right;\">" + expenseTotal.toFixed(2) + "</td>" +
    "<td style=\"padding:3px 6px;border:1px solid #ccc;font-size:10px;\"></td>" +
    "<td style=\"padding:3px 6px;border:1px solid #ccc;font-size:10px;\"></td>" +
    "<td style=\"padding:3px 6px;border:1px solid #ccc;font-size:10px;\">\u7ed3\u4f59: " + balance.toFixed(2) + "</td>" +
    "</tr></tbody></table></div>";

  const container = document.createElement("div");
  container.innerHTML = html;
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "800px";
  document.body.appendChild(container);

  const canvas = await html2canvas(container, {
    scale: 2,
    useCORS: true,
    logging: false,
    width: 800,
  });

  document.body.removeChild(container);

  const imgData = canvas.toDataURL("image/jpeg", 0.95);
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pdfWidth = doc.internal.pageSize.getWidth();
  const imgAspect = canvas.width / canvas.height;
  let imgWidth = pdfWidth - 10;
  let imgHeight = imgWidth / imgAspect;

  if (imgHeight > 200) {
    imgHeight = 200;
    imgWidth = imgHeight * imgAspect;
  }

  doc.addImage(imgData, "JPEG", 5, 5, imgWidth, imgHeight);

  const buf = doc.output("arraybuffer");
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({ filters: [{ name: "PDF 文件", extensions: ["pdf"] }], defaultPath: "账本_" + new Date().toISOString().slice(0, 10) + ".pdf" });
    if (!path) return;
    await writeFile(path, new Uint8Array(buf));
  } else {
    const blob = new Blob([buf], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "账本_" + new Date().toISOString().slice(0, 10) + ".pdf";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export async function importCSV() {
  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  if (!isTauri) throw new Error("导入功能仅支持桌面端");
  const { open }: any = await import("@tauri-apps/plugin-dialog");
  const { readTextFile }: any = await import("@tauri-apps/plugin-fs");
  const path = await open({
    filters: [{ name: "CSV 文件", extensions: ["csv"] }],
    multiple: false,
  });
  if (!path) return 0;
  const text = await readTextFile(path as string);
  const lines = text.split("\n").filter(function(l: string) { return l.trim(); });
  if (lines.length < 2) return 0;
  let count = 0;
  const d = await getDb();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const fields = parseCSVLine(line);
    if (fields.length < 3) continue;
    const date = fields[0];
    const type = fields[1] === "\u6536\u5165" ? "income" : "expense";
    const amount = parseFloat(fields[2]);
    if (isNaN(amount) || !date) continue;
    const catField = fields[3] || "";
    let categoryId = "";
    if (catField.indexOf("/") >= 0) {
      const parts = catField.split("/");
      const cats: any[] = await d.select(
        "SELECT c.id FROM categories c LEFT JOIN categories p ON c.parent_id = p.id WHERE p.name = ? AND c.name = ? AND c.type = ?",
        [parts[0].trim(), parts[1].trim(), type]
      );
      if (cats.length > 0) categoryId = (cats[0] as any).id;
    }
    if (!categoryId) {
      const cats: any[] = await d.select(
        "SELECT id FROM categories WHERE name = ? AND type = ? LIMIT 1", [catField, type]
      );
      if (cats.length > 0) categoryId = (cats[0] as any).id;
      else {
        const fallback: any[] = await d.select("SELECT id FROM categories WHERE type = ? LIMIT 1", [type]);
        if (fallback.length === 0) continue;
        categoryId = (fallback[0] as any).id;
      }
    }
    const accountName = fields[5] || "\u73b0\u91d1";
    const accounts: any[] = await d.select("SELECT id FROM accounts WHERE name = ? LIMIT 1", [accountName]);
    let accountId = "default";
    if (accounts.length > 0) accountId = (accounts[0] as any).id;
    const note = fields[6] || "";
    await d.execute(
      "INSERT INTO transactions (id, type, amount, category_id, account_id, date, note) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [crypto.randomUUID(), type, amount, categoryId, accountId, date, note]
    );
    const sign = type === "income" ? 1 : -1;
    await d.execute("UPDATE accounts SET balance = balance + ? WHERE id = ?", [sign * amount, accountId]);
    count++;
  }
  return count;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) { result.push(current); current = ""; }
    else current += ch;
  }
  result.push(current);
  return result;
}

export async function importExcel() {
  const isTauri2 = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  if (!isTauri2) throw new Error("导入功能仅支持桌面端");
  const { open }: any = await import("@tauri-apps/plugin-dialog");
  const { readFile }: any = await import("@tauri-apps/plugin-fs");
  const path = await open({
    filters: [{ name: "Excel \u6587\u4ef6", extensions: ["xlsx", "xls"] }],
    multiple: false,
  });
  if (!path) return 0;
  const buf = await readFile(path as string);
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json<any>(ws);
  let count = 0;
  const d = await getDb();
  for (const row of data) {
    const date = String(row["\u65e5\u671f"] || "");
    const type = String(row["\u7c7b\u578b"] || "") === "\u6536\u5165" ? "income" : "expense";
    const amount = parseFloat(row["\u91d1\u989d"]);
    if (isNaN(amount) || !date) continue;
    const catField = String(row["\u660e\u7ec6\u5206\u7c7b"] || "");
    let categoryId = "";
    if (catField) {
      const cats: any[] = await d.select(
        "SELECT id FROM categories WHERE name = ? AND type = ? LIMIT 1", [catField, type]
      );
      if (cats.length > 0) categoryId = (cats[0] as any).id;
      else {
        const fallback: any[] = await d.select("SELECT id FROM categories WHERE type = ? LIMIT 1", [type]);
        if (fallback.length === 0) continue;
        categoryId = (fallback[0] as any).id;
      }
    } else {
      const fallback: any[] = await d.select("SELECT id FROM categories WHERE type = ? LIMIT 1", [type]);
      if (fallback.length === 0) continue;
      categoryId = (fallback[0] as any).id;
    }
    const accountName = String(row["\u8d26\u6237"] || "\u73b0\u91d1");
    const accounts: any[] = await d.select("SELECT id FROM accounts WHERE name = ? LIMIT 1", [accountName]);
    let accountId = "default";
    if (accounts.length > 0) accountId = (accounts[0] as any).id;
    const note = String(row["\u5907\u6ce8"] || "");
    await d.execute(
      "INSERT INTO transactions (id, type, amount, category_id, account_id, date, note) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [crypto.randomUUID(), type, amount, categoryId, accountId, date, note]
    );
    const sign = type === "income" ? 1 : -1;
    await d.execute("UPDATE accounts SET balance = balance + ? WHERE id = ?", [sign * amount, accountId]);
    count++;
  }
  return count;
}
