import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";

let db: Database | null = null;
let dbPending: Promise<Database> | null = null;

export async function getDb(): Promise<Database> {
  if (db) return db;
  if (dbPending) return dbPending;
  dbPending = (async () => {
    try {
      db = await Database.load("sqlite:account_book.db");
      await initTables();
      return db;
    } catch (e) {
      dbPending = null;
      throw e;
    }
  })();
  return dbPending;
}

async function initTables() {
  if (!db) return;

  await db.execute(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'cash',
    balance REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'CNY'
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('income','expense')),
    parent_id TEXT DEFAULT NULL,
    icon TEXT NOT NULL DEFAULT 'circle',
    color TEXT NOT NULL DEFAULT '#6b7280',
    sort_order INTEGER NOT NULL DEFAULT 0
  )`);

  // Add parent_id column if not exists (migration for existing databases)
  try {
    const tableInfo = await db.select<{ name: string }[]>(`PRAGMA table_info(categories)`);
    const hasParentId = tableInfo.some((col: any) => col.name === "parent_id");
    if (!hasParentId) {
      await db.execute(`ALTER TABLE categories ADD COLUMN parent_id TEXT DEFAULT NULL`);
    }
  } catch (_e) {
    // Table might not exist yet, ignore
  }

  await db.execute(`CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('income','expense')),
    amount REAL NOT NULL,
    category_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    date TEXT NOT NULL,
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id)
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY,
    category_id TEXT NOT NULL,
    amount REAL NOT NULL,
    month TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (category_id) REFERENCES categories(id)
  )`);

  // Seed default account
  const accountCount = await db.select<[{ count: number }]>(
    "SELECT COUNT(*) as count FROM accounts"
  );
  if (accountCount[0].count === 0) {
    await db.execute(
      "INSERT INTO accounts (id, name, type, balance) VALUES (?, ?, ?, ?)",
      ["default", "现金", "cash", 0]
    );
  }

  // Seed default categories (only if no categories exist)
  const catCount = await db.select<[{ count: number }]>(
    "SELECT COUNT(*) as count FROM categories"
  );
  if (catCount[0].count === 0) {
    const uuid = () => crypto.randomUUID();

    // Expense parent categories
    const expenseParents: Record<string, string> = {};
    const expenseCatDefs = [
      { name: "餐饮", icon: "utensils", color: "#ef4444" },
      { name: "交通", icon: "car", color: "#f97316" },
      { name: "购物", icon: "shopping-bag", color: "#eab308" },
      { name: "住房", icon: "home", color: "#22c55e" },
      { name: "通讯", icon: "smartphone", color: "#3b82f6" },
      { name: "娱乐", icon: "gamepad-2", color: "#8b5cf6" },
      { name: "医疗", icon: "heart-pulse", color: "#ec4899" },
      { name: "教育", icon: "book-open", color: "#14b8a6" },
      { name: "人情", icon: "gift", color: "#f43f5e" },
      { name: "其他", icon: "more-horizontal", color: "#6b7280" },
    ];
    for (let i = 0; i < expenseCatDefs.length; i++) {
      const c = expenseCatDefs[i];
      const id = uuid();
      expenseParents[c.name] = id;
      await db.execute(
        "INSERT INTO categories (id, name, type, parent_id, icon, color, sort_order) VALUES (?,?,?,?,?,?,?)",
        [id, c.name, "expense", null, c.icon, c.color, i]
      );
    }

    // Expense subcategories
    const expenseSubs: { parent: string; name: string }[] = [
      { parent: "餐饮", name: "早餐" },
      { parent: "餐饮", name: "午餐" },
      { parent: "餐饮", name: "晚餐" },
      { parent: "餐饮", name: "外卖" },
      { parent: "餐饮", name: "零食饮品" },
      { parent: "交通", name: "公交地铁" },
      { parent: "交通", name: "打车" },
      { parent: "交通", name: "加油" },
      { parent: "交通", name: "停车" },
      { parent: "交通", name: "保养" },
      { parent: "购物", name: "日用品" },
      { parent: "购物", name: "服饰鞋包" },
      { parent: "购物", name: "数码" },
      { parent: "购物", name: "家居" },
      { parent: "购物", name: "个护" },
      { parent: "住房", name: "房租" },
      { parent: "住房", name: "物业" },
      { parent: "住房", name: "水电" },
      { parent: "住房", name: "燃气" },
      { parent: "住房", name: "维修" },
      { parent: "通讯", name: "话费" },
      { parent: "通讯", name: "网费" },
      { parent: "娱乐", name: "电影" },
      { parent: "娱乐", name: "游戏" },
      { parent: "娱乐", name: "运动" },
      { parent: "娱乐", name: "旅游" },
      { parent: "娱乐", name: "宠物" },
      { parent: "医疗", name: "门诊" },
      { parent: "医疗", name: "药品" },
      { parent: "医疗", name: "体检" },
      { parent: "教育", name: "课程" },
      { parent: "教育", name: "书籍" },
      { parent: "教育", name: "考证" },
      { parent: "人情", name: "红包" },
      { parent: "人情", name: "聚餐" },
      { parent: "人情", name: "礼物" },
    ];
    let sortIdx = 0;
    for (const parent of expenseCatDefs) {
      const subs = expenseSubs.filter((s) => s.parent === parent.name);
      for (const sub of subs) {
        await db.execute(
          "INSERT INTO categories (id, name, type, parent_id, icon, color, sort_order) VALUES (?,?,?,?,?,?,?)",
          [uuid(), sub.name, "expense", expenseParents[parent.name], parent.icon, parent.color, sortIdx]
        );
        sortIdx++;
      }
    }

    // Income parents
    const incomeCatDefs = [
      { name: "工资", icon: "briefcase", color: "#22c55e" },
      { name: "奖金", icon: "award", color: "#eab308" },
      { name: "兼职", icon: "pen-tool", color: "#3b82f6" },
      { name: "投资", icon: "trending-up", color: "#8b5cf6" },
      { name: "红包", icon: "gift", color: "#ef4444" },
      { name: "其他", icon: "more-horizontal", color: "#6b7280" },
    ];
    for (let i = 0; i < incomeCatDefs.length; i++) {
      const c = incomeCatDefs[i];
      await db.execute(
        "INSERT INTO categories (id, name, type, parent_id, icon, color, sort_order) VALUES (?,?,?,?,?,?,?)",
        [uuid(), c.name, "income", null, c.icon, c.color, i]
      );
    }
  }
}

// Password
export async function hasPassword(): Promise<boolean> {
  try {
    const d = await getDb();
    const rows = await d.select<[{ value: string }]>(
      "SELECT value FROM settings WHERE key = 'password_hash'"
    );
    return rows.length > 0;
  } catch (e) {
    console.error("hasPassword error:", e);
    throw e;
  }
}

export async function setPassword(password: string): Promise<void> {
  const d = await getDb();
  const hash = await invoke<string>("hash_password", { password });
  await d.execute(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('password_hash', ?)",
    [hash]
  );
}

export async function verifyPassword(password: string): Promise<boolean> {
  const d = await getDb();
  const rows = await d.select<[{ value: string }]>(
    "SELECT value FROM settings WHERE key = 'password_hash'"
  );
  if (rows.length < 1) return true;
  return await invoke<boolean>("verify_password", {
    password,
    hash: rows[0].value,
  });
}

// Accounts
export async function getAccounts() {
  const d = await getDb();
  return await d.select("SELECT * FROM accounts ORDER BY name");
}

export async function addAccount(acc: { id: string; name: string; type: string; balance: number }) {
  const d = await getDb();
  await d.execute(
    "INSERT INTO accounts (id, name, type, balance) VALUES (?,?,?,?)",
    [acc.id, acc.name, acc.type, acc.balance]
  );
}

export async function updateAccount(id: string, data: { name: string; type: string }) {
  const d = await getDb();
  await d.execute("UPDATE accounts SET name=?, type=? WHERE id=?", [data.name, data.type, id]);
}

export async function deleteAccount(id: string) {
  const d = await getDb();
  // Check if account has transactions
  const txs = await d.select<[{ count: number }]>(
    "SELECT COUNT(*) as count FROM transactions WHERE account_id=?", [id]
  );
  if (txs[0].count > 0) {
    throw new Error("该账户下有交易记录，无法删除");
  }
  await d.execute("DELETE FROM accounts WHERE id=?", [id]);
}

// Categories
export async function getCategories(type?: string) {
  const d = await getDb();
  if (type) {
    return await d.select(
      "SELECT * FROM categories WHERE type = ? ORDER BY sort_order",
      [type]
    );
  }
  return await d.select("SELECT * FROM categories ORDER BY sort_order");
}

export async function getParentCategories(type?: string) {
  const d = await getDb();
  if (type) {
    return await d.select(
      "SELECT * FROM categories WHERE type = ? AND parent_id IS NULL ORDER BY sort_order",
      [type]
    );
  }
  return await d.select(
    "SELECT * FROM categories WHERE parent_id IS NULL ORDER BY sort_order"
  );
}

export async function getChildCategories(parentId: string) {
  const d = await getDb();
  return await d.select(
    "SELECT * FROM categories WHERE parent_id = ? ORDER BY sort_order",
    [parentId]
  );
}

export async function addCategory(cat: {
  id: string;
  name: string;
  type: string;
  parent_id: string | null;
  icon: string;
  color: string;
  sort_order: number;
}) {
  const d = await getDb();
  await d.execute(
    "INSERT INTO categories (id,name,type,parent_id,icon,color,sort_order) VALUES (?,?,?,?,?,?,?)",
    [cat.id, cat.name, cat.type, cat.parent_id, cat.icon, cat.color, cat.sort_order]
  );
}

export async function updateCategory(
  id: string,
  data: { name: string; icon: string; color: string }
) {
  const d = await getDb();
  await d.execute("UPDATE categories SET name=?, icon=?, color=? WHERE id=?", [
    data.name, data.icon, data.color, id,
  ]);
}

export async function deleteCategory(id: string) {
  const d = await getDb();
  // Check for children
  const children = await d.select<[{ count: number }]>(
    "SELECT COUNT(*) as count FROM categories WHERE parent_id=?", [id]
  );
  if (children[0].count > 0) {
    throw new Error("该分类下有子分类，请先删除子分类");
  }
  await d.execute("DELETE FROM categories WHERE id=?", [id]);
}

// Transactions
export interface Transaction {
  id: string;
  type: "income" | "expense";
  amount: number;
  category_id: string;
  account_id: string;
  date: string;
  note: string;
  created_at: string;
  updated_at: string;
  category_name?: string;
  category_icon?: string;
  category_color?: string;
  category_parent_id?: string;
  parent_name?: string;
  account_name?: string;
}

export async function getTransactions(
  year: number,
  month: number
): Promise<Transaction[]> {
  const d = await getDb();
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  return await d.select(
    `SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color,
            c.parent_id as category_parent_id, p.name as parent_name,
            a.name as account_name
     FROM transactions t
     LEFT JOIN categories c ON t.category_id = c.id
     LEFT JOIN categories p ON c.parent_id = p.id
     LEFT JOIN accounts a ON t.account_id = a.id
     WHERE t.date LIKE ?
     ORDER BY t.date DESC, t.created_at DESC`,
    [`${monthStr}%`]
  );
}

export async function addTransaction(tx: {
  id: string;
  type: string;
  amount: number;
  category_id: string;
  account_id: string;
  date: string;
  note: string;
}) {
  const d = await getDb();
  await d.execute(
    `INSERT INTO transactions (id,type,amount,category_id,account_id,date,note)
     VALUES (?,?,?,?,?,?,?)`,
    [tx.id, tx.type, tx.amount, tx.category_id, tx.account_id, tx.date, tx.note]
  );
  const sign = tx.type === "income" ? 1 : -1;
  await d.execute("UPDATE accounts SET balance = balance + ? WHERE id = ?", [
    sign * tx.amount, tx.account_id,
  ]);
}

export async function updateTransaction(
  id: string,
  data: {
    type: string;
    amount: number;
    category_id: string;
    date: string;
    note: string;
  }
) {
  const d = await getDb();
  const old = await d.select<Transaction[]>(
    "SELECT * FROM transactions WHERE id=?", [id]
  );
  if (old.length > 0) {
    const oldSign = old[0].type === "income" ? 1 : -1;
    await d.execute("UPDATE accounts SET balance = balance - ? WHERE id = ?", [
      oldSign * old[0].amount, old[0].account_id,
    ]);
    const newSign = data.type === "income" ? 1 : -1;
    await d.execute("UPDATE accounts SET balance = balance + ? WHERE id = ?", [
      newSign * data.amount, old[0].account_id,
    ]);
  }
  await d.execute(
    `UPDATE transactions SET type=?, amount=?, category_id=?, date=?, note=?, updated_at=datetime('now','localtime')
     WHERE id=?`,
    [data.type, data.amount, data.category_id, data.date, data.note, id]
  );
}

export async function deleteTransaction(id: string) {
  const d = await getDb();
  const rows = await d.select<Transaction[]>(
    "SELECT * FROM transactions WHERE id=?", [id]
  );
  if (rows.length > 0) {
    const sign = rows[0].type === "income" ? 1 : -1;
    await d.execute("UPDATE accounts SET balance = balance - ? WHERE id = ?", [
      sign * rows[0].amount, rows[0].account_id,
    ]);
  }
  await d.execute("DELETE FROM transactions WHERE id=?", [id]);
}

// Budgets
export async function getBudgets(month: string) {
  const d = await getDb();
  return await d.select(
    `SELECT b.*, c.name as category_name, c.icon as category_icon, c.color as category_color,
            c.parent_id as category_parent_id,
            COALESCE(t.total, 0) as spent
     FROM budgets b
     LEFT JOIN categories c ON b.category_id = c.id
     LEFT JOIN (
       SELECT category_id, SUM(amount) as total
       FROM transactions
       WHERE type='expense' AND date LIKE ?
       GROUP BY category_id
     ) t ON b.category_id = t.category_id
     WHERE b.month = ?
     ORDER BY c.sort_order`,
    [`${month}%`, month]
  );
}

export async function setBudget(data: {
  id: string;
  category_id: string;
  amount: number;
  month: string;
}) {
  const d = await getDb();
  await d.execute(
    `INSERT OR REPLACE INTO budgets (id, category_id, amount, month)
     VALUES (?, ?, ?, ?)`,
    [data.id, data.category_id, data.amount, data.month]
  );
}

export async function deleteBudget(id: string) {
  const d = await getDb();
  await d.execute("DELETE FROM budgets WHERE id=?", [id]);
}

// Dashboard stats
export async function getMonthlyStats(year: number, month: number) {
  const d = await getDb();
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const rows = await d.select<[{ type: string; total: number }]>(
    `SELECT type, SUM(amount) as total
     FROM transactions
     WHERE date LIKE ?
     GROUP BY type`,
    [`${monthStr}%`]
  );
  let income = 0, expense = 0;
  for (const r of rows) {
    if (r.type === "income") income = r.total;
    else expense = r.total;
  }
  return { income, expense, balance: income - expense };
}

export async function getCategorySummary(year: number, month: number) {
  const d = await getDb();
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  return await d.select(
    `SELECT c.id, c.name, c.icon, c.color, c.type, c.parent_id, SUM(t.amount) as total
     FROM transactions t
     LEFT JOIN categories c ON t.category_id = c.id
     WHERE t.date LIKE ?
     GROUP BY t.category_id
     ORDER BY total DESC`,
    [`${monthStr}%`]
  );
}

export async function getMonthlyTrend() {
  const d = await getDb();
  return await d.select(
    `SELECT substr(date,1,7) as month,
            SUM(CASE WHEN type='income' THEN amount ELSE 0 END) as income,
            SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as expense
     FROM transactions
     GROUP BY substr(date,1,7)
     ORDER BY month DESC
     LIMIT 12`
  );
}
