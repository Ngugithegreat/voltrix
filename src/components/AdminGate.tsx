"use client";

import { useCallback, useEffect, useState } from "react";
import { Lock, LogOut } from "lucide-react";
import { Logo } from "./Logo";
import { AdminView } from "./AdminView";
import { BRAND_NAME } from "@/lib/brand";

export function AdminGate() {
  const [state, setState] = useState<"loading" | "locked" | "in">("loading");
  const [configured, setConfigured] = useState(true);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/login", { cache: "no-store" });
      const json = await res.json();
      setConfigured(json.configured);
      setState(json.authed ? "in" : "locked");
    } catch {
      setState("locked");
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error || "Sign in failed.");
      else {
        setPassword("");
        setState("in");
      }
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logout: true }),
    });
    setState("locked");
  }

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        Loading…
      </div>
    );
  }

  if (state === "locked") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center justify-center gap-2">
            <Logo className="h-9 w-9" />
            <span className="text-2xl font-bold tracking-tight">
              {BRAND_NAME}
              <span className="ml-1.5 rounded-md bg-brand/15 px-1.5 py-0.5 align-middle text-[11px] font-semibold text-brand">
                ADMIN
              </span>
            </span>
          </div>
          <div className="card p-6 sm:p-8">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <Lock className="h-4 w-4 text-brand" />
              Operator access
            </div>
            {!configured ? (
              <p className="text-sm text-down">
                The admin panel is disabled. Set{" "}
                <code className="rounded bg-surface2 px-1">ADMIN_PANEL_PASSWORD</code>{" "}
                in your environment and redeploy.
              </p>
            ) : (
              <form onSubmit={signIn} className="space-y-3">
                <input
                  className="input"
                  type="password"
                  autoFocus
                  placeholder="Admin password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {error && <p className="text-sm text-down">{error}</p>}
                <button type="submit" disabled={busy} className="btn btn-brand w-full py-2.5">
                  {busy ? "Checking…" : "Unlock panel"}
                </button>
              </form>
            )}
          </div>
          <p className="mt-4 text-center text-xs text-muted">
            This page is not linked from the app. Bookmark it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Logo className="h-7 w-7" />
            <span className="text-lg font-bold tracking-tight">
              {BRAND_NAME}
              <span className="ml-1.5 rounded-md bg-brand/15 px-1.5 py-0.5 text-[11px] font-semibold text-brand">
                ADMIN
              </span>
            </span>
          </div>
          <button onClick={signOut} className="btn btn-ghost px-3 py-2 text-sm">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <AdminView />
      </main>
    </div>
  );
}
