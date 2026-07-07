import { useState, useEffect } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  hasPassword,
  setInitialPassword,
  setPassword,
  verifyPassword,
} from "../lib/cloud";

interface LockPageProps {
  onUnlock: () => void;
}

export function LockPage({ onUnlock }: LockPageProps) {
  const [isFirstRun, setIsFirstRun] = useState(false);
  const [password, setPasswordVal] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    hasPassword()
      .then((has) => {
        setIsFirstRun(!has);
        setLoading(false);
      })
      .catch((e) => {
        console.error("LockPage init error:", e);
        setError("连接服务器失败: " + (e?.toString() || "未知错误"));
        setLoading(false);
      });
  }, []);

  const handleSetup = async () => {
    setError("");
    if (password.length < 4) {
      setError("密码至少4位");
      return;
    }
    if (password !== confirmPassword) {
      setError("两次密码输入不一致");
      return;
    }
    try {
      setUnlocking(true);
      await setInitialPassword(password);
      setPassword(password);
      onUnlock();
    } catch (e) {
      console.error("Setup error:", e);
      setError("设置密码失败，请重试: " + (e?.toString() || ""));
      setUnlocking(false);
    }
  };

  const handleUnlock = async () => {
    setError("");
    if (!password) {
      setError("请输入密码");
      return;
    }
    try {
      setUnlocking(true);
      const ok = await verifyPassword(password);
      if (ok) {
        setPassword(password);
        onUnlock();
      } else {
        setError("密码错误，请重试");
        setUnlocking(false);
      }
    } catch (e) {
      console.error("Unlock error:", e);
      setError("验证失败，请重试: " + (e?.toString() || ""));
      setUnlocking(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">正在初始化...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm mx-4">
        <div className="flex flex-col items-center mb-8">
          {isFirstRun ? (
            <ShieldCheck className="h-12 w-12 text-primary mb-3" />
          ) : (
            <Lock className="h-12 w-12 text-primary mb-3" />
          )}
          <h1 className="text-2xl font-bold text-foreground">账本</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isFirstRun ? "首次使用，请设置密码" : "请输入密码解锁"}
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              placeholder={isFirstRun ? "设置密码（至少4位）" : "输入密码"}
              value={password}
              onChange={(e) => setPasswordVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  isFirstRun ? handleSetup() : handleUnlock();
                }
              }}
              autoFocus
            />
          </div>

          {isFirstRun && (
            <div className="space-y-2">
              <Label htmlFor="confirm">确认密码</Label>
              <Input
                id="confirm"
                type="password"
                placeholder="再次输入密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSetup();
                }}
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-red-500 text-center break-all">{error}</p>
          )}

          <Button
            className="w-full"
            onClick={isFirstRun ? handleSetup : handleUnlock}
            disabled={unlocking}
          >
            {unlocking
              ? "处理中..."
              : isFirstRun
              ? "设置密码并进入"
              : "解锁"}
          </Button>
        </div>
      </div>
    </div>
  );
}
