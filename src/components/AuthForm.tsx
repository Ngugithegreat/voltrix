"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "./Logo";
import { BRAND_NAME } from "@/lib/brand";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRegister = mode === "register";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isRegister ? { name, email, password } : { email, password }
        ),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Something went wrong.");
      } else {
        router.replace("/trade");
        router.refresh();
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <Logo className="h-9 w-9" />
          <span className="text-2xl font-bold tracking-tight">{BRAND_NAME}</span>
        </Link>

        <div className="card p-6 sm:p-8">
          <h1 className="text-xl font-bold">
            {isRegister ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {isRegister
              ? "Start trading volatility indices in minutes."
              : "Sign in to your trading account."}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-3">
            {isRegister && (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">
                  Full name
                </label>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                  required
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Email</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                Password
              </label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                minLength={6}
                required
              />
            </div>

            {error && <p className="text-sm text-down">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="btn btn-brand w-full py-2.5"
            >
              {busy
                ? "Please wait…"
                : isRegister
                ? "Create account"
                : "Sign in"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-muted">
            {isRegister ? "Already have an account? " : `New to ${BRAND_NAME}? `}
            <Link
              href={isRegister ? "/login" : "/register"}
              className="font-medium text-brand hover:underline"
            >
              {isRegister ? "Sign in" : "Create one"}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
