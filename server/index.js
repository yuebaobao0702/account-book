import express from "express";
import cors from "cors";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

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

app.listen(PORT, "0.0.0.0", () => {
  console.log("account book api running on port " + PORT);
});
