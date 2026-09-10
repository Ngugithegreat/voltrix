"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { BRAND_NAME } from "@/lib/brand";

export default function ResetPasswordPage() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // Read the token from the URL on mount (avoids useSearchParams suspense needs).
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    setToken(t);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don’t match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error || "Could not reset password.");
      else setDone(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm p-7">
        <Link href="/" className="mb-5 flex items-center gap-2">
          <Logo className="h-8 w-8" />
          <span className="text-xl font-bold tracking-tight">{BRAND_NAME}</span>
        </Link>

        {done ? (
          <>
            <h1 className="text-2xl font-bold">Password updated</h1>
            <p className="mt-2 text-sm text-muted">You can now sign in with your new password.</p>
            <Link href="/login" className="btn btn-brand mt-5 w-full py-2.5">
              Sign in
            </Link>
          </>
        ) : token === undefined ? (
          <div className="py-6 text-center text-sm text-muted">Loading…</div>
        ) : token === "" || token === null ? (
          <>
            <h1 className="text-2xl font-bold">Set a new password</h1>
            <p className="mt-2 text-sm text-muted">
              This reset link is missing or invalid. Please request a new one.
            </p>
            <Link href="/forgot-password" className="btn btn-brand mt-5 w-full py-2.5">
              Request new link
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold">Set a new password</h1>
            <p className="mt-1 text-sm text-muted">Choose a new password for your account.</p>
            <form onSubmit={submit} className="mt-5 space-y-3">
              <input
                className="input"
                type="password"
                placeholder="New password"
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <input
                className="input"
                type="password"
                placeholder="Confirm password"
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
              {error && <p className="text-sm text-down">{error}</p>}
              <button type="submit" disabled={busy} className="btn btn-brand w-full py-2.5">
                {busy ? "Updating…" : "Update password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
