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

// Alias for settings page
// Store password in memory for subsequent API calls
export function setPassword(pw: string) {
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
