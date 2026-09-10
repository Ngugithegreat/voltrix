"use client";

import { useState } from "react";
import { MailCheck, X } from "lucide-react";
import { useApp } from "./app-context";

// Non-blocking email verification prompt. A code is emailed at signup; this bar
// lets the user enter it (or resend). Hides once the email is verified.
export function VerifyEmailBanner() {
  const { user, refresh } = useApp();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [resent, setResent] = useState(false);

  if (!user || user.email_verified || dismissed) return null;

  async function confirm() {
    const c = code.replace(/\D/g, "");
    if (c.length !== 6) {
      setMsg({ text: "Enter the 6-digit code.", ok: false });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", code: c }),
      });
      const j = await res.json();
      if (res.ok) {
        setMsg({ text: "Email verified ✓", ok: true });
        await refresh();
      } else {
        setMsg({ text: j.error || "Could not verify.", ok: false });
      }
    } catch {
      setMsg({ text: "Network error. Try again.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setMsg(null);
    try {
      await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send" }),
      });
      setResent(true);
      setMsg({ text: `Code sent to ${user!.email}`, ok: true });
    } catch {
      setMsg({ text: "Could not resend. Try again.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-gold/30 bg-gold/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm">
          <MailCheck className="h-4 w-4 shrink-0 text-gold" />
          <span className="font-medium">Verify your email</span>
          <span className="hidden text-muted sm:inline">— enter the code we sent to {user.email}</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            placeholder="6-digit code"
            className="tabular w-28 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-gold/60"
            onKeyDown={(e) => e.key === "Enter" && confirm()}
          />
          <button onClick={confirm} disabled={busy} className="btn btn-brand px-3 py-1.5 text-xs">
            Verify
          </button>
          <button onClick={resend} disabled={busy} className="btn btn-ghost px-3 py-1.5 text-xs">
            {resent ? "Resent" : "Resend"}
          </button>
          <button onClick={() => setDismissed(true)} title="Later" className="btn btn-ghost h-7 w-7 p-0">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {msg && (
          <div className={`w-full text-right text-[11px] ${msg.ok ? "text-up" : "text-down"}`}>
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
}
