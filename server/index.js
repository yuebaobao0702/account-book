import express from "express";
import cors from "cors";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import iconv from "iconv-lite";
const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "account_book.db");
const PORT = 3004;

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function initTables() {
  db.exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  db.exec("CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'cash', balance REAL NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'CNY')");
  db.exec("CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('income','expense')), parent_id TEXT DEFAULT NULL, icon TEXT NOT NULL DEFAULT 'circle', color TEXT NOT NULL DEFAULT '#6b7280', sort_order INTEGER NOT NULL DEFAULT 0)");
  db.exec("CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY, type TEXT NOT NULL CHECK(type IN ('income','expense')), amount REAL NOT NULL, category_id TEXT NOT NULL, account_id TEXT NOT NULL, date TEXT NOT NULL, note TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')), updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')))");
  db.exec("CREATE TABLE IF NOT EXISTS budgets (id TEXT PRIMARY KEY, category_id TEXT NOT NULL, amount REAL NOT NULL, month TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')))");
  db.exec("CREATE TABLE IF NOT EXISTS stock_holdings (id TEXT PRIMARY KEY, stock_code TEXT NOT NULL, stock_name TEXT NOT NULL, shares REAL NOT NULL DEFAULT 0, cost_price REAL NOT NULL DEFAULT 0, market TEXT NOT NULL DEFAULT 'SZ', account_id TEXT NOT NULL DEFAULT 'default', created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')), updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')))");
  db.exec("CREATE TABLE IF NOT EXISTS stock_trades (id TEXT PRIMARY KEY, stock_code TEXT NOT NULL, stock_name TEXT NOT NULL, trade_type TEXT NOT NULL CHECK(trade_type IN ('buy','sell')), shares REAL NOT NULL, price REAL NOT NULL, amount REAL NOT NULL, commission REAL NOT NULL DEFAULT 0, date TEXT NOT NULL, note TEXT DEFAULT '', account_id TEXT NOT NULL DEFAULT 'default', created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')))");
  db.exec("CREATE TABLE IF NOT EXISTS stock_dividends (id TEXT PRIMARY KEY, stock_code TEXT NOT NULL, stock_name TEXT NOT NULL, dividend_per_share REAL NOT NULL, total_amount REAL NOT NULL, date TEXT NOT NULL, note TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')))");
}

function seedData() {
  const ac = db.prepare("SELECT COUNT(*) as count FROM accounts").get();
  if (ac.count === 0) {
    db.prepare("INSERT INTO accounts (id,name,type,balance) VALUES (?,?,?,?)").run("default","现金","cash",0);
  }
  const cc = db.prepare("SELECT COUNT(*) as count FROM categories").get();
  if (cc.count === 0) {
    const ep = [
      {n:"餐饮",i:"utensils",c:"#ef4444"},{n:"交通",i:"car",c:"#f97316"},{n:"购物",i:"shopping-bag",c:"#eab308"},
      {n:"住房",i:"home",c:"#22c55e"},{n:"通讯",i:"smartphone",c:"#3b82f6"},{n:"娱乐",i:"gamepad-2",c:"#8b5cf6"},
      {n:"医疗",i:"heart-pulse",c:"#ec4899"},{n:"教育",i:"book-open",c:"#14b8a6"},{n:"人情",i:"gift",c:"#f43f5e"},{n:"其他",i:"more-horizontal",c:"#6b7280"}
    ];
    const ss = {"餐饮":["早餐","午餐","晚餐","外卖","零食饮品"],"交通":["公交地铁","打车","加油","停车","保养"],"购物":["日用品","服饰鞋包","数码","家居","个护"],"住房":["房租","物业","水电","燃气","维修"],"通讯":["话费","网费"],"娱乐":["电影","游戏","运动","旅游","宠物"],"医疗":["门诊","药品","体检"],"教育":["课程","书籍","考证"],"人情":["红包","聚餐","礼物"],"其他":[]};
    const ins = db.prepare("INSERT INTO categories (id,name,type,parent_id,icon,color,sort_order) VALUES (?,?,?,?,?,?,?)");
    ep.forEach((p,i) => { const pid = uuidv4(); ins.run(pid,p.n,"expense",null,p.i,p.c,i); (ss[p.n]||[]).forEach((s,j) => { ins.run(uuidv4(),s,"expense",pid,p.i,p.c,100+j); }); });
    [{n:"工资",i:"briefcase",c:"#22c55e"},{n:"奖金",i:"award",c:"#eab308"},{n:"兼职",i:"pen-tool",c:"#3b82f6"},{n:"投资",i:"trending-up",c:"#8b5cf6"},{n:"红包",i:"gift",c:"#ef4444"},{n:"其他",i:"more-horizontal",c:"#6b7280"}].forEach((c,i) => { ins.run(uuidv4(),c.n,"income",null,c.i,c.c,i); });
  }
}

initTables();
seedData();

const app = express();
app.use(cors());
app.use(express.json());

// Public auth endpoints (no auth required)
app.post("/api/auth/setup", (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 4) return res.status(400).json({ error: "密码至少4位" });
  const hash = bcrypt.hashSync(password, 10);
  db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)").run("password_hash", hash);
  res.json({ ok: true });
});

app.get("/api/auth/check", (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get("password_hash");
  res.json({ hasPassword: !!row });
});

app.post("/api/auth/verify", (req, res) => {
  const { password } = req.body;
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get("password_hash");
  if (!row) return res.json({ ok: true });
  try {
    const ok = bcrypt.compareSync(password, row.value);
    res.json({ ok });
  } catch {
    res.status(500).json({ error: "验证失败" });
  }
});

// Serve web frontend (no auth required)
app.use(express.static(join(__dirname, "dist")));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(join(__dirname, "dist", "index.html"));
});

// ===== Stock Price Fetching =====
function detectMarket(code) {
  const c = (code || "").trim();
  if (c.startsWith("6")) return "SH";
  return "SZ";
}
function parseStockCode(code, market) {
  const m = (market || detectMarket(code)).toUpperCase();
  const prefix = m === "SH" ? "sh" : "sz";
  return prefix + code;
}

function parseStockResponse(text) {
  const lines = text.split("\n").filter(l => l.trim());
  const result = [];
  for (const line of lines) {
    const m = line.match(/^v_\w+="([^"]+)"/);
    if (!m) continue;
    const parts = m[1].split("~");
    if (parts.length < 5) continue;
    result.push({
      code: parts[2],
      name: parts[1],
      price: parseFloat(parts[3]) || 0,
      change: parseFloat(parts[31]) || 0,
      changePercent: parseFloat(parts[32]) || 0,
      high: parseFloat(parts[33]) || 0,
      low: parseFloat(parts[34]) || 0,
      volume: parseFloat(parts[36]) || 0,
      amount: parseFloat(parts[37]) || 0,
      open: parseFloat(parts[5]) || 0,
      yesterdayClose: parseFloat(parts[4]) || 0,
      market: line.startsWith("v_sh") ? "SH" : "SZ",
    });
  }
  return result;
}

// Fetch real-time price for a single stock
app.get("/api/stocks/price", async (req, res) => {
  const { code, market } = req.query;
  if (!code) return res.status(400).json({ error: "缺少股票代码" });
  try {
    const q = parseStockCode(code, market);
    const buf = await (await fetch(`https://qt.gtimg.cn/q=${q}`)).arrayBuffer();
    const text = iconv.decode(Buffer.from(buf), "GBK");
    const parsed = parseStockResponse(text);
    res.json(parsed[0] || null);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Fetch prices for multiple stocks at once
app.post("/api/stocks/prices", async (req, res) => {
  const { codes } = req.body;
  if (!codes || !Array.isArray(codes) || codes.length === 0) return res.status(400).json({ error: "缺少股票代码列表" });
  try {
    const qs = codes.map(c => parseStockCode(c.code, c.market)).join(",");
    const buf = await (await fetch(`https://qt.gtimg.cn/q=${qs}`)).arrayBuffer();
    const text = iconv.decode(Buffer.from(buf), "GBK");
    const parsed = parseStockResponse(text);
    res.json(parsed);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});



app.get("/api/stocks/lookup", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: "缺少股票代码" });
  try {
    const market = detectMarket(code);
    const prefix = market === "SH" ? "sh" : "sz";
    const buf = await (await fetch("https://qt.gtimg.cn/q=" + prefix + code)).arrayBuffer();
    const text = iconv.decode(Buffer.from(buf), "GBK");
    const parsed = parseStockResponse(text);
    if (parsed.length > 0 && parsed[0].code) {
      res.json({ code: parsed[0].code, name: parsed[0].name, market, price: parsed[0].price });
    } else {
      res.json({ code, name: "", market, price: 0 });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});



// Auth middleware for protected endpoints
app.use((req, res, next) => {
  const password = req.headers["x-app-password"];
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get("password_hash");
  if (row) {
    if (!password) return res.status(401).json({ error: "需要密码验证" });
    try { if (!bcrypt.compareSync(password, row.value)) return res.status(403).json({ error: "密码错误" }); }
    catch { return res.status(500).json({ error: "验证失败" }); }
  }
  next();
});

// Stats
app.get("/api/stats/monthly", (req, res) => {
  const { year, month } = req.query;
  const ms = year + "-" + String(month).padStart(2, "0");
  const rows = db.prepare("SELECT type,SUM(amount) as total FROM transactions WHERE date LIKE ? GROUP BY type").all(ms + "%");
  let income = 0, expense = 0;
  for (const r of rows) { if (r.type === "income") income = r.total; else expense = r.total; }
  res.json({ income, expense, balance: income - expense });
});

app.get("/api/stats/categories", (req, res) => {
  const { year, month } = req.query;
  const ms = year + "-" + String(month).padStart(2, "0");
  res.json(db.prepare("SELECT c.id,c.name,c.icon,c.color,c.type,c.parent_id,SUM(t.amount) as total FROM transactions t LEFT JOIN categories c ON t.category_id=c.id WHERE t.date LIKE ? GROUP BY t.category_id ORDER BY total DESC").all(ms + "%"));
});

app.get("/api/stats/trend", (req, res) => {
  res.json(db.prepare("SELECT substr(date,1,7) as month,SUM(CASE WHEN type='income' THEN amount ELSE 0 END) as income,SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as expense FROM transactions GROUP BY substr(date,1,7) ORDER BY month DESC LIMIT 12").all());
});

// Transactions
app.get("/api/transactions", (req, res) => {
  const { year, month } = req.query;
  const ms = year + "-" + String(month).padStart(2, "0");
  res.json(db.prepare("SELECT t.*,c.name as category_name,c.icon as category_icon,c.color as category_color,c.parent_id as category_parent_id,p.name as parent_name,a.name as account_name FROM transactions t LEFT JOIN categories c ON t.category_id=c.id LEFT JOIN categories p ON c.parent_id=p.id LEFT JOIN accounts a ON t.account_id=a.id WHERE t.date LIKE ? ORDER BY t.date DESC,t.created_at DESC").all(ms + "%"));
});

app.post("/api/transactions", (req, res) => {
  const tx = req.body;
  if (!tx.id||!tx.type||!tx.amount||!tx.category_id||!tx.date) return res.status(400).json({error:"缺少必要字段"});
  db.prepare("INSERT INTO transactions (id,type,amount,category_id,account_id,date,note) VALUES (?,?,?,?,?,?,?)").run(tx.id,tx.type,tx.amount,tx.category_id,tx.account_id||"default",tx.date,tx.note||"");
  const sign = tx.type==="income"?1:-1;
  db.prepare("UPDATE accounts SET balance = balance + ? WHERE id = ?").run(sign*tx.amount,tx.account_id||"default");
  res.json({ok:true});
});

app.put("/api/transactions/:id", (req, res) => {
  const d = req.body;
  const o = db.prepare("SELECT * FROM transactions WHERE id=?").get(req.params.id);
  if (o) { const os = o.type==="income"?1:-1; db.prepare("UPDATE accounts SET balance = balance - ? WHERE id=?").run(os*o.amount,o.account_id); const ns = d.type==="income"?1:-1; db.prepare("UPDATE accounts SET balance = balance + ? WHERE id=?").run(ns*d.amount,o.account_id); }
  db.prepare("UPDATE transactions SET type=?,amount=?,category_id=?,date=?,note=?,updated_at=datetime('now','localtime') WHERE id=?").run(d.type,d.amount,d.category_id,d.date,d.note||"",req.params.id);
  res.json({ok:true});
});

app.delete("/api/transactions/:id", (req, res) => {
  const o = db.prepare("SELECT * FROM transactions WHERE id=?").get(req.params.id);
  if (o) { const s = o.type==="income"?1:-1; db.prepare("UPDATE accounts SET balance = balance - ? WHERE id=?").run(s*o.amount,o.account_id); }
  db.prepare("DELETE FROM transactions WHERE id=?").run(req.params.id);
  res.json({ok:true});
});

// Categories
app.get("/api/categories", (req, res) => {
  const { type } = req.query;
  res.json(type ? db.prepare("SELECT * FROM categories WHERE type=? ORDER BY sort_order").all(type) : db.prepare("SELECT * FROM categories ORDER BY sort_order").all());
});

app.post("/api/categories", (req,res) => { const c=req.body; db.prepare("INSERT INTO categories (id,name,type,parent_id,icon,color,sort_order) VALUES (?,?,?,?,?,?,?)").run(c.id,c.name,c.type,c.parent_id||null,c.icon,c.color,c.sort_order); res.json({ok:true}); });
app.put("/api/categories/:id", (req,res) => { const d=req.body; db.prepare("UPDATE categories SET name=?,icon=?,color=? WHERE id=?").run(d.name,d.icon,d.color,req.params.id); res.json({ok:true}); });
app.delete("/api/categories/:id", (req,res) => { const ch=db.prepare("SELECT COUNT(*) as count FROM categories WHERE parent_id=?").get(req.params.id); if(ch.count>0) return res.status(400).json({error:"该分类下有子分类"}); db.prepare("DELETE FROM categories WHERE id=?").run(req.params.id); res.json({ok:true}); });

// Accounts
app.get("/api/accounts", (req,res) => res.json(db.prepare("SELECT * FROM accounts ORDER BY name").all()));
app.post("/api/accounts", (req,res) => { const a=req.body; db.prepare("INSERT INTO accounts (id,name,type,balance) VALUES (?,?,?,?)").run(a.id,a.name,a.type,a.balance||0); res.json({ok:true}); });
app.put("/api/accounts/:id", (req,res) => { const d=req.body; db.prepare("UPDATE accounts SET name=?,type=? WHERE id=?").run(d.name,d.type,req.params.id); res.json({ok:true}); });
app.delete("/api/accounts/:id", (req,res) => { const t=db.prepare("SELECT COUNT(*) as count FROM transactions WHERE account_id=?").get(req.params.id); if(t.count>0) return res.status(400).json({error:"该账户下有交易记录"}); db.prepare("DELETE FROM accounts WHERE id=?").run(req.params.id); res.json({ok:true}); });

// Budgets
app.get("/api/budgets", (req,res) => {
  const m=req.query.month;
  res.json(db.prepare("SELECT b.*,c.name as category_name,c.icon as category_icon,c.color as category_color,c.parent_id as category_parent_id,COALESCE(t.total,0) as spent FROM budgets b LEFT JOIN categories c ON b.category_id=c.id LEFT JOIN (SELECT category_id,SUM(amount) as total FROM transactions WHERE type='expense' AND date LIKE ? GROUP BY category_id) t ON b.category_id=t.category_id WHERE b.month=? ORDER BY c.sort_order").all(m+"%",m));
});
app.post("/api/budgets", (req,res) => { const d=req.body; db.prepare("INSERT OR REPLACE INTO budgets (id,category_id,amount,month) VALUES (?,?,?,?)").run(d.id,d.category_id,d.amount,d.month); res.json({ok:true}); });
app.delete("/api/budgets/:id", (req,res) => { db.prepare("DELETE FROM budgets WHERE id=?").run(req.params.id); res.json({ok:true}); });

// Export CSV
app.get("/api/export/csv", (req,res) => {
  const rows = db.prepare("SELECT t.date,t.type,t.amount,c.name as category,p.name as parent_category,a.name as account,t.note FROM transactions t LEFT JOIN categories c ON t.category_id=c.id LEFT JOIN categories p ON c.parent_id=p.id LEFT JOIN accounts a ON t.account_id=a.id ORDER BY t.date DESC,t.created_at DESC").all();
  let csv = "\uFEFF日期,类型,金额,大类,明细分类,账户,备注\n";
  for (const r of rows) {
    const cat = r.parent_category ? r.parent_category+"/"+r.category : (r.category||"");
    const note = (r.note||"").replace(/"/g,'""');
    csv += (r.date||"")+","+(r.type==="income"?"收入":"支出")+","+(r.amount||0)+',"'+cat+'",'+(r.account||"")+',"'+note+'"\n';
  }
  res.setHeader("Content-Type","text/csv; charset=utf-8");
  res.send(csv);
});

// ===== Import endpoints =====
app.post("/api/import/csv", (req, res) => {
  let body = "";
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => {
    try {
      const lines = body.split("\n").filter(l => l.trim());
      if (lines.length < 2) return res.json({ count: 0 });
      let count = 0;
      for (let i = 1; i < lines.length; i++) {
        const fields = parseCSVLine(lines[i].trim());
        if (fields.length < 3) continue;
        const date = fields[0], type = fields[1] === "\u6536\u5165" ? "income" : "expense", amount = parseFloat(fields[2]);
        if (isNaN(amount) || !date) continue;
        let catField = fields[3] || "", categoryId = "";
        if (catField.includes("/")) {
          const parts = catField.split("/");
          const cats = db.prepare("SELECT c.id FROM categories c LEFT JOIN categories p ON c.parent_id=p.id WHERE p.name=? AND c.name=? AND c.type=?").all(parts[0].trim(), parts[1].trim(), type);
          if (cats.length > 0) categoryId = cats[0].id;
        }
        if (!categoryId) {
          const cats = db.prepare("SELECT id FROM categories WHERE name=? AND type=? LIMIT 1").all(catField, type);
          if (cats.length > 0) categoryId = cats[0].id;
          else {
            const fb = db.prepare("SELECT id FROM categories WHERE type=? LIMIT 1").all(type);
            if (fb.length === 0) continue;
            categoryId = fb[0].id;
          }
        }
        const accName = fields[5] || "\u73b0\u91d1";
        const accs = db.prepare("SELECT id FROM accounts WHERE name=? LIMIT 1").all(accName);
        let accId = "default";
        if (accs.length > 0) accId = accs[0].id;
        const note = fields[6] || "";
        db.prepare("INSERT INTO transactions (id,type,amount,category_id,account_id,date,note) VALUES (?,?,?,?,?,?,?)").run(uuidv4(),type,amount,categoryId,accId,date,note);
        const sign = type === "income" ? 1 : -1;
        db.prepare("UPDATE accounts SET balance = balance + ? WHERE id = ?").run(sign * amount, accId);
        count++;
      }
      res.json({ count });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
});

app.post("/api/import/excel", (req, res) => {
  // For simplicity, delegate to CSV import after parsing
  res.status(501).json({ error: "Excel导入通过web界面暂不支持" });
});


// Stock name lookup (public)
// ===== Stock API endpoints =====

// Get all holdings
app.get("/api/stocks/holdings", (req, res) => {
  const rows = db.prepare(`
    SELECT h.*,
      COALESCE((SELECT SUM(CASE WHEN trade_type='buy' THEN amount ELSE -amount END) FROM stock_trades WHERE stock_code=h.stock_code), 0) as total_invested
    FROM stock_holdings h ORDER BY h.shares * h.cost_price DESC
  `).all();
  res.json(rows);
});

// Add holding
app.post("/api/stocks/holdings", (req, res) => {
  const d = req.body;
  if (!d.id || !d.stock_code || !d.stock_name || d.shares == null || d.cost_price == null) {
    return res.status(400).json({ error: "缺少必要字段" });
  }
  db.prepare("INSERT INTO stock_holdings (id,stock_code,stock_name,shares,cost_price,market,account_id) VALUES (?,?,?,?,?,?,?)").run(
    d.id, d.stock_code, d.stock_name, d.shares, d.cost_price, d.market || detectMarket(d.stock_code), d.account_id || "default"
  );
  res.json({ ok: true });
});

// Update holding
app.put("/api/stocks/holdings/:id", (req, res) => {
  const d = req.body;
  db.prepare("UPDATE stock_holdings SET stock_code=?,stock_name=?,shares=?,cost_price=?,market=?,updated_at=datetime('now','localtime') WHERE id=?").run(
    d.stock_code, d.stock_name, d.shares, d.cost_price, d.market, req.params.id
  );
  res.json({ ok: true });
});

// Delete holding
app.delete("/api/stocks/holdings/:id", (req, res) => {
  db.prepare("DELETE FROM stock_holdings WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// Get trades for a stock
app.get("/api/stocks/trades", (req, res) => {
  const { stock_code } = req.query;
  let rows;
  if (stock_code) {
    rows = db.prepare("SELECT * FROM stock_trades WHERE stock_code=? ORDER BY date DESC").all(stock_code);
  } else {
    rows = db.prepare("SELECT * FROM stock_trades ORDER BY date DESC LIMIT 100").all();
  }
  res.json(rows);
});

// Add trade
app.post("/api/stocks/trades", (req, res) => {
  const d = req.body;
  if (!d.id || !d.stock_code || !d.stock_name || !d.trade_type || !d.shares || !d.price || !d.date) {
    return res.status(400).json({ error: "缺少必要字段" });
  }
  const amount = d.shares * d.price;
  db.prepare("INSERT INTO stock_trades (id,stock_code,stock_name,trade_type,shares,price,amount,commission,date,note,account_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(
    d.id, d.stock_code, d.stock_name, d.trade_type, d.shares, d.price, amount,
    d.commission || 0, d.date, d.note || "", d.account_id || "default"
  );
  // Update holding shares and cost
  const holding = db.prepare("SELECT * FROM stock_holdings WHERE stock_code=?").get(d.stock_code);
  if (holding) {
    if (d.trade_type === "buy") {
      const totalShares = holding.shares + d.shares;
      const totalCost = (holding.shares * holding.cost_price) + amount + (d.commission || 0);
      const avgCost = totalCost / totalShares;
      db.prepare("UPDATE stock_holdings SET shares=?,cost_price=?,updated_at=datetime('now','localtime') WHERE id=?").run(
        totalShares, avgCost, holding.id
      );
    } else {
      const newShares = holding.shares - d.shares;
      if (newShares <= 0) {
        db.prepare("DELETE FROM stock_holdings WHERE id=?").run(holding.id);
      } else {
        const remainingCost = Math.max(0, holding.shares * holding.cost_price - amount);
        const avgCost = remainingCost / newShares;
        db.prepare("UPDATE stock_holdings SET shares=?,cost_price=?,updated_at=datetime('now','localtime') WHERE id=?").run(
          newShares, avgCost, holding.id
        );
      }
    }
  } else if (d.trade_type === "buy") {
    const hid = uuidv4();
    db.prepare("INSERT INTO stock_holdings (id,stock_code,stock_name,shares,cost_price,market,account_id) VALUES (?,?,?,?,?,?,?)").run(
      hid, d.stock_code, d.stock_name, d.shares, (amount + (d.commission || 0)) / d.shares, d.market || detectMarket(d.stock_code), d.account_id || "default"
    );
  }
  res.json({ ok: true });
});

// Delete trade
app.delete("/api/stocks/trades/:id", (req, res) => {
  db.prepare("DELETE FROM stock_trades WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// Get dividends
app.get("/api/stocks/dividends", (req, res) => {
  const { stock_code } = req.query;
  let rows;
  if (stock_code) {
    rows = db.prepare("SELECT * FROM stock_dividends WHERE stock_code=? ORDER BY date DESC").all(stock_code);
  } else {
    rows = db.prepare("SELECT * FROM stock_dividends ORDER BY date DESC LIMIT 100").all();
  }
  res.json(rows);
});

// Add dividend
app.post("/api/stocks/dividends", (req, res) => {
  const d = req.body;
  if (!d.id || !d.stock_code || !d.stock_name || !d.dividend_per_share || !d.total_amount || !d.date) {
    return res.status(400).json({ error: "缺少必要字段" });
  }
  db.prepare("INSERT INTO stock_dividends (id,stock_code,stock_name,dividend_per_share,total_amount,date,note) VALUES (?,?,?,?,?,?,?)").run(
    d.id, d.stock_code, d.stock_name, d.dividend_per_share, d.total_amount, d.date, d.note || ""
  );
  res.json({ ok: true });
});

// Delete dividend
app.delete("/api/stocks/dividends/:id", (req, res) => {
  db.prepare("DELETE FROM stock_dividends WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// Completed positions (realized P&L)
app.get("/api/stocks/completed", (req, res) => {
  const group = req.query.group || "stock";
  let result = [];

  if (group === "cycle") {
    // Per-cycle view: split trades into individual buy-sell cycles
    const codes = db.prepare("SELECT stock_code,stock_name,SUM(CASE WHEN trade_type='buy' THEN shares ELSE -shares END) as net FROM stock_trades GROUP BY stock_code HAVING net <= 0").all();
    for (const { stock_code, stock_name } of codes) {
      const trades = db.prepare("SELECT * FROM stock_trades WHERE stock_code=? ORDER BY date ASC, created_at ASC").all(stock_code);
      let sharesHeld = 0, costBasis = 0;
      let cycleBuys = [], cycleSells = [], cycleCommissions = [];
      let cycleStart = "", cycleEnd = "";

      for (const t of trades) {
        if (t.trade_type === "buy") {
          sharesHeld += t.shares;
          costBasis += t.amount;
          cycleBuys.push(t);
          if (!cycleStart) cycleStart = t.date;
        } else {
          cycleSells.push(t);
          sharesHeld -= t.shares;
          cycleEnd = t.date;
        }
        cycleCommissions.push(t.commission || 0);

        if (sharesHeld <= 0 && cycleBuys.length > 0) {
          const totalBuy = cycleBuys.reduce((s, x) => s + x.amount, 0);
          const totalSell = cycleSells.reduce((s, x) => s + x.amount, 0);
          const totalComm = cycleCommissions.reduce((s, x) => s + x, 0);
          const realizedPnl = totalSell - totalBuy - totalComm;
          result.push({
            stock_code, stock_name,
            total_buy: totalBuy, total_sell: totalSell, total_commission: totalComm,
            trade_count: cycleBuys.length + cycleSells.length,
            first_trade: cycleStart || "", last_trade: cycleEnd || "",
            realized_pnl: realizedPnl,
            realized_pnl_percent: totalBuy > 0 ? (realizedPnl / totalBuy) * 100 : 0,
            holding_days: cycleStart && cycleEnd ? Math.max(1, Math.round((new Date(cycleEnd) - new Date(cycleStart)) / (1000 * 60 * 60 * 24))) : 0,
          });
          sharesHeld = 0; costBasis = 0; cycleBuys = []; cycleSells = []; cycleCommissions = [];
          cycleStart = ""; cycleEnd = "";
        }
      }
    }
    result.sort((a, b) => b.last_trade.localeCompare(a.last_trade));
  } else {
    // Stock-grouped view
    const rows = db.prepare(`
      SELECT stock_code,stock_name,
        SUM(CASE WHEN trade_type='buy' THEN shares ELSE 0 END) as total_buy_shares,
        SUM(CASE WHEN trade_type='sell' THEN shares ELSE 0 END) as total_sell_shares,
        SUM(CASE WHEN trade_type='buy' THEN amount ELSE 0 END) as total_buy,
        SUM(CASE WHEN trade_type='sell' THEN amount ELSE 0 END) as total_sell,
        SUM(commission) as total_commission,
        COUNT(*) as trade_count,
        MIN(date) as first_trade,
        MAX(date) as last_trade
      FROM stock_trades
      GROUP BY stock_code
      HAVING SUM(CASE WHEN trade_type='buy' THEN shares ELSE -shares END) <= 0
      ORDER BY last_trade DESC
    `).all();
    result = rows.map(r => ({
      ...r,
      realized_pnl: r.total_sell - r.total_buy - r.total_commission,
      realized_pnl_percent: r.total_buy > 0 ? ((r.total_sell - r.total_buy - r.total_commission) / r.total_buy) * 100 : 0,
      holding_days: Math.max(1, Math.round((new Date(r.last_trade) - new Date(r.first_trade)) / (1000 * 60 * 60 * 24))),
    }));
  }

  const summary = {
    totalRealizedPnl: result.reduce((s, r) => s + r.realized_pnl, 0),
    totalBuy: result.reduce((s, r) => s + r.total_buy, 0),
    totalSell: result.reduce((s, r) => s + r.total_sell, 0),
    totalCommission: result.reduce((s, r) => s + r.total_commission, 0),
    count: result.length,
  };
  res.json({ positions: result, summary, group });
});

// Get/set available cash balance for stock account
app.get("/api/stocks/cash", (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key='stock_cash_balance'").get();
  res.json({ cash: row ? parseFloat(row.value) : 0 });
});

app.put("/api/stocks/cash", (req, res) => {
  const { cash } = req.body;
  if (cash == null || isNaN(cash)) return res.status(400).json({ error: "请输入有效金额" });
  db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('stock_cash_balance',?)").run(String(cash));
  res.json({ ok: true });
});

// Portfolio summary// Get/set available cash balance for stock account
app.get("/api/stocks/cash", (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key='stock_cash_balance'").get();
  res.json({ cash: row ? parseFloat(row.value) : 0 });
});

app.put("/api/stocks/cash", (req, res) => {
  const { cash } = req.body;
  if (cash == null || isNaN(cash)) return res.status(400).json({ error: "请输入有效金额" });
  db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('stock_cash_balance',?)").run(String(cash));
  res.json({ ok: true });
});

// Portfolio summary
app.get("/api/stocks/portfolio", (req, res) => {
  const holdings = db.prepare(`
    SELECT h.*, COALESCE((SELECT SUM(CASE WHEN trade_type='buy' THEN amount ELSE -amount END) FROM stock_trades WHERE stock_code=h.stock_code), h.shares * h.cost_price) as total_invested
    FROM stock_holdings h ORDER BY h.shares * h.cost_price DESC
  `).all();
  const totalInvested = holdings.reduce((s, h) => s + (h.shares * h.cost_price), 0);
  const totalDividends = db.prepare("SELECT COALESCE(SUM(total_amount),0) as total FROM stock_dividends").get().total;
  const completed = db.prepare("SELECT stock_code,SUM(CASE WHEN trade_type='buy' THEN amount ELSE 0 END) as tb,SUM(CASE WHEN trade_type='sell' THEN amount ELSE 0 END) as ts,SUM(commission) as tc FROM stock_trades WHERE stock_code NOT IN (SELECT stock_code FROM stock_holdings) GROUP BY stock_code").all();
  const totalRealizedPnl = completed.reduce((s, c) => s + (c.ts - c.tb - c.tc), 0);
  const cashRow = db.prepare("SELECT value FROM settings WHERE key='stock_cash_balance'").get();
  const cashBalance = cashRow ? parseFloat(cashRow.value) : 0;
  res.json({
    holdings,
    totalInvested,
    totalDividends,
    totalRealizedPnl,
    holdingCount: holdings.length,
    completedCount: completed.length,
    cashBalance,
  });
});

// Serve built frontend
app.use(express.static(join(__dirname, "dist")));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(join(__dirname, "dist", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("account book api running on port " + PORT);
});
