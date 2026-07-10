// Cloud API client - replaces local SQLite with server API calls

const SERVER_URL = "http://124.221.16.90:3004";

let appPassword = "";


export function getServerUrl() {
  return SERVER_URL;
}

async function api(path: string, options?: RequestInit) {
  const headers: Record<string, string> = {
    "x-app-password": appPassword,
  };
  if (options?.body) {
    headers["Content-Type"] = "application/json";
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(SERVER_URL + path, {
      ...options,
      signal: controller.signal,
      headers: { ...headers, ...(options?.headers as Record<string, string>) },
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || "请求失败");
    }
    return res.json();
  } catch (e: any) {
    clearTimeout(timeout);
    if (e.name === "AbortError") throw new Error("连接服务器超时，请检查网络");
    throw e;
  }
}

// Auth
export async function hasPassword(): Promise<boolean> {
  const data = await api("/api/auth/check");
  return data.hasPassword;
}

export async function setInitialPassword(password: string): Promise<void> {
  await api("/api/auth/setup", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

// Update password on server and in memory
export async function setPassword(pw: string): Promise<void> {
  await api("/api/auth/setup", {
    method: "POST",
    body: JSON.stringify({ password: pw }),
  });
  appPassword = pw;
}

export function getAppPassword(): string {
  return appPassword;
}

// Password verify (uses the same password header)
export async function verifyPassword(password: string): Promise<boolean> {
  try {
    const res = await fetch(SERVER_URL + "/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.ok === true;
  } catch {
    return false;
  }
}

// Stats
export async function getMonthlyStats(year: number, month: number) {
  return api(`/api/stats/monthly?year=${year}&month=${month}`);
}

export async function getCategorySummary(year: number, month: number) {
  return api(`/api/stats/categories?year=${year}&month=${month}`);
}

export async function getDailyStats(year: number, month: number) {
  return api(`/api/stats/daily?year=${year}&month=${month}`);
}

export async function getMonthlyTrend() {
  return api("/api/stats/trend");
}

// Transactions
export async function getTransactions(year: number, month: number) {
  return api(`/api/transactions?year=${year}&month=${month}`);
}

export async function addTransaction(tx: any) {
  return api("/api/transactions", {
    method: "POST",
    body: JSON.stringify(tx),
  });
}

export async function updateTransaction(id: string, data: any) {
  return api(`/api/transactions/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteTransaction(id: string) {
  return api(`/api/transactions/${id}`, { method: "DELETE" });
}

// Categories
export async function getCategories(type?: string) {
  const q = type ? `?type=${type}` : "";
  return api(`/api/categories${q}`);
}

export async function getParentCategories(type?: string) {
  const all: any[] = await getCategories(type);
  return all.filter((c: any) => !c.parent_id);
}

export async function getChildCategories(parentId: string) {
  const all: any[] = await getCategories();
  return all.filter((c: any) => c.parent_id === parentId);
}

export async function addCategory(cat: any) {
  return api("/api/categories", {
    method: "POST",
    body: JSON.stringify(cat),
  });
}

export async function updateCategory(id: string, data: any) {
  return api(`/api/categories/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteCategory(id: string) {
  return api(`/api/categories/${id}`, { method: "DELETE" });
}

// Accounts
export async function getAccounts() {
  return api("/api/accounts");
}

export async function addAccount(acc: any) {
  return api("/api/accounts", {
    method: "POST",
    body: JSON.stringify(acc),
  });
}

export async function updateAccount(id: string, data: any) {
  return api(`/api/accounts/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteAccount(id: string) {
  return api(`/api/accounts/${id}`, { method: "DELETE" });
}

// Budgets
export async function getBudgets(month: string) {
  return api(`/api/budgets?month=${month}`);
}

export async function setBudget(data: any) {
  return api("/api/budgets", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteBudget(id: string) {
  return api(`/api/budgets/${id}`, { method: "DELETE" });
}


// ===== Stock API =====

// Stock Holdings
export async function getStockHoldings() {
  return api("/api/stocks/holdings");
}

export async function addStockHolding(holding: any) {
  return api("/api/stocks/holdings", {
    method: "POST",
    body: JSON.stringify(holding),
  });
}

export async function updateStockHolding(id: string, data: any) {
  return api(`/api/stocks/holdings/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteStockHolding(id: string) {
  return api(`/api/stocks/holdings/${id}`, { method: "DELETE" });
}

// Stock Trades
export async function getStockTrades(stockCode?: string) {
  const q = stockCode ? `?stock_code=${stockCode}` : "";
  return api(`/api/stocks/trades${q}`);
}

export async function addStockTrade(trade: any) {
  return api("/api/stocks/trades", {
    method: "POST",
    body: JSON.stringify(trade),
  });
}

export async function deleteStockTrade(id: string) {
  return api(`/api/stocks/trades/${id}`, { method: "DELETE" });
}

// Stock Dividends
export async function getStockDividends(stockCode?: string) {
  const q = stockCode ? `?stock_code=${stockCode}` : "";
  return api(`/api/stocks/dividends${q}`);
}

export async function addStockDividend(dividend: any) {
  return api("/api/stocks/dividends", {
    method: "POST",
    body: JSON.stringify(dividend),
  });
}

export async function deleteStockDividend(id: string) {
  return api(`/api/stocks/dividends/${id}`, { method: "DELETE" });
}

// Stock Prices
export async function fetchStockPrice(code: string, market?: string) {
  return api(`/api/stocks/price?code=${code}&market=${market || "SZ"}`);
}

export async function fetchStockPrices(codes: Array<{code: string; market?: string}>) {
  return api("/api/stocks/prices", {
    method: "POST",
    body: JSON.stringify({ codes }),
  });
}

// Portfolio Summary
export async function lookupStock(code: string, market?: string) {
  return api(`/api/stocks/lookup?code=${code}&market=${market || ""}`);
}

export async function getDailyAssets() {
  return api("/api/stocks/daily-assets");
}

export async function recordDailyAssets(data: { date?: string; totalAssets: number; marketValue: number; cashBalance: number }) {
  return api("/api/stocks/daily-assets", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getStockMonthly() {
  return api("/api/stocks/monthly");
}

export async function getStockCash() {
  return api("/api/stocks/cash");
}

export async function setStockCash(cash: number) {
  return api("/api/stocks/cash", {
    method: "PUT",
    body: JSON.stringify({ cash }),
  });
}

export async function getStockCompleted(group = "stock") {
  return api(`/api/stocks/completed?group=${group}`);
}

export async function getStockPortfolio() {
  return api("/api/stocks/portfolio");
}


// ===== Loan API =====

let loanPassword = "";

export function setLoanPassword(pw: string) {
  loanPassword = pw;
}

async function loanApi(path: string, options?: RequestInit) {
  const headers: Record<string, string> = {
    "x-loan-password": loanPassword,
  };
  if (options?.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(getServerUrl() + path, {
      ...options,
      signal: controller.signal,
      headers: { ...headers, ...(options?.headers as Record<string, string>) },
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || "请求失败");
    }
    return res.json();
  } catch (e: any) {
    clearTimeout(timeout);
    if (e.name === "AbortError") throw new Error("连接服务器超时，请检查网络");
    throw e;
  }
}

export async function hasLoanPassword(): Promise<boolean> {
  const data = await loanApi("/api/loan/auth/check", { method: "POST" });
  return data.hasPassword;
}

export async function setupLoanPassword(password: string): Promise<void> {
  await loanApi("/api/loan/auth/setup", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  loanPassword = password;
}

export async function verifyLoanPassword(password: string): Promise<boolean> {
  try {
    const res = await fetch(getServerUrl() + "/api/loan/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.ok) loanPassword = password;
    return data.ok === true;
  } catch {
    return false;
  }
}

export async function getLoans(filters?: { status?: string; date_from?: string; date_to?: string; platform?: string }) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.date_from) params.set("date_from", filters.date_from);
  if (filters?.date_to) params.set("date_to", filters.date_to);
  if (filters?.platform) params.set("platform", filters.platform);
  const q = params.toString() ? "?" + params.toString() : "";
  return loanApi("/api/loans" + q);
}

export async function addLoan(data: { platform: string; due_date: string; amount: number; note?: string }) {
  return loanApi("/api/loans", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateLoan(id: string, data: Partial<{ platform: string; due_date: string; amount: number; note: string; status: string }>) {
  return loanApi("/api/loans/" + id, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteLoan(id: string) {
  return loanApi("/api/loans/" + id, { method: "DELETE" });
}

export async function toggleLoanStatus(id: string) {
  return loanApi("/api/loans/" + id + "/toggle", { method: "POST" });
}

export async function getLoanSetting(key: string): Promise<string> {
  const data = await loanApi("/api/loan/settings/" + encodeURIComponent(key));
  return data.value || "";
}

export async function setLoanSetting(key: string, value: string) {
  return loanApi("/api/loan/settings/" + encodeURIComponent(key), {
    method: "POST",
    body: JSON.stringify({ value }),
  });
}

export async function importLoans(file: File): Promise<number> {
  const formData = new FormData();
  formData.append("file", file);
  const data = await loanApi("/api/loans/import", {
    method: "POST",
    body: formData,
  });
  return data.count;
}

export async function exportLoans() {
  const headers: Record<string, string> = { "x-loan-password": loanPassword };
  const res = await fetch(getServerUrl() + "/api/loans/export", { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "导出失败");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "loans.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}
