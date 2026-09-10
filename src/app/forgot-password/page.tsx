"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { BRAND_NAME } from "@/lib/brand";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch {
      setSent(true); // generic — never reveal whether the email exists
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

        {sent ? (
          <>
            <h1 className="text-2xl font-bold">Check your email</h1>
            <p className="mt-2 text-sm text-muted">
              If an account exists for <span className="text-fg">{email}</span>, we’ve sent a link to
              reset your password. It expires in 1 hour.
            </p>
            <Link href="/login" className="btn btn-brand mt-5 w-full py-2.5">
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold">Forgot password</h1>
            <p className="mt-1 text-sm text-muted">
              Enter your email and we’ll send you a reset link.
            </p>
            <form onSubmit={submit} className="mt-5 space-y-3">
              <input
                className="input"
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <button type="submit" disabled={busy} className="btn btn-brand w-full py-2.5">
                {busy ? "Sending…" : "Send reset link"}
              </button>
            </form>
            <p className="mt-4 text-center text-sm text-muted">
              Remembered it?{" "}
              <Link href="/login" className="text-brand hover:underline">
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
