"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "./Logo";
import { COUNTRIES } from "@/lib/countries";
import { BRAND_NAME, BRAND_HEX_DARK, BRAND_HEX_LIGHT } from "@/lib/brand";

type Mode = "signin" | "signup";

export function AuthCard({ initial }: { initial: Mode }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initial);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("KE");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Two-step signup for OTP countries (Kenya): "form" collects details, "otp"
  // enters the SMS code. Non-OTP signups skip straight through.
  const [step, setStep] = useState<"form" | "otp">("form");
  const [code, setCode] = useState("");
  const [otpPhone, setOtpPhone] = useState("");
  const [resendIn, setResendIn] = useState(0);

  // Pick up a referral code from the invite link (?ref=ST-100482).
  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get("ref");
    if (r) {
      setRef(r.trim());
      setMode("signup");
    }
  }, []);

  // Resend cooldown countdown.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const headers = { "Content-Type": "application/json" };

  // Sign in.
  async function submit(kind: Mode, e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/login`, {
        method: "POST",
        headers,
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error || "Something went wrong.");
      else {
        router.replace("/trade");
        router.refresh();
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  // Create the account (optionally with an OTP code). Returns true on success.
  async function registerNow(withCode?: string): Promise<boolean> {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers,
      body: JSON.stringify({
        name,
        email,
        password,
        phone: phone || undefined,
        country,
        ref: ref || undefined,
        code: withCode,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Something went wrong.");
      if (json.needOtp) setStep("otp");
      return false;
    }
    router.replace("/trade");
    router.refresh();
    return true;
  }

  // Step 1: from the signup form. Ask the server whether this country needs an
  // SMS code; if so, send it and move to the code step, else register directly.
  async function startSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers,
        body: JSON.stringify({ phone, country, email }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not start signup.");
        return;
      }
      if (json.required) {
        setOtpPhone(json.phone || phone);
        setCode("");
        setStep("otp");
        setResendIn(60);
      } else {
        await registerNow();
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  // Step 2: verify the SMS code and create the account.
  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await registerNow(code);
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    if (resendIn > 0) return;
    setError(null);
    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers,
        body: JSON.stringify({ phone, country, email }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error || "Could not resend the code.");
      else setResendIn(json.retryAfterSec || 60);
    } catch {
      setError("Network error. Try again.");
    }
  }

  const shared = {
    email,
    setEmail,
    password,
    setPassword,
    busy,
    error,
  };

  // OTP verification step (Kenya signups).
  if (mode === "signup" && step === "otp") {
    return (
      <OtpCard
        phone={otpPhone}
        code={code}
        setCode={setCode}
        onSubmit={verifyOtp}
        onResend={resendCode}
        onBack={() => {
          setStep("form");
          setError(null);
        }}
        busy={busy}
        error={error}
        resendIn={resendIn}
      />
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-[900px]">
        {/* Brand (mobile) */}
        <div className="mb-6 flex items-center justify-center gap-2 sm:hidden">
          <Logo className="h-9 w-9" />
          <span className="text-2xl font-bold tracking-tight">{BRAND_NAME}</span>
        </div>

        {/* ---------- Desktop: sliding two-panel ---------- */}
        <div className="relative hidden min-h-[560px] overflow-hidden rounded-3xl border border-border bg-surface shadow-card sm:block">
          {/* Sign-in form (left half) */}
          <div
            className={`absolute inset-y-0 left-0 flex w-1/2 items-center justify-center p-10 transition-all duration-500 ${
              mode === "signup" ? "z-0 opacity-0" : "z-10 opacity-100"
            }`}
          >
            <SignInForm {...shared} onSubmit={(e) => submit("signin", e)} />
          </div>

          {/* Sign-up form (right half) */}
          <div
            className={`absolute inset-y-0 left-0 flex w-1/2 translate-x-full items-center justify-center overflow-y-auto p-10 transition-all duration-500 ${
              mode === "signup" ? "z-10 opacity-100" : "z-0 opacity-0"
            }`}
          >
            <SignUpForm
              {...shared}
              name={name}
              setName={setName}
              phone={phone}
              setPhone={setPhone}
              country={country}
              setCountry={setCountry}
              referral={ref}
              onSubmit={startSignup}
            />
          </div>

          {/* Overlay brand panel */}
          <div
            className={`absolute inset-y-0 left-1/2 z-20 w-1/2 transition-transform duration-500 ${
              mode === "signup" ? "-translate-x-full" : "translate-x-0"
            }`}
          >
            <BrandPanel mode={mode} onToggle={() => setMode(mode === "signin" ? "signup" : "signin")} />
          </div>
        </div>

        {/* ---------- Mobile: stacked ---------- */}
        <div className="card overflow-hidden p-6 sm:hidden">
          {mode === "signin" ? (
            <SignInForm {...shared} onSubmit={(e) => submit("signin", e)} />
          ) : (
            <SignUpForm
              {...shared}
              name={name}
              setName={setName}
              phone={phone}
              setPhone={setPhone}
              country={country}
              setCountry={setCountry}
              referral={ref}
              onSubmit={startSignup}
            />
          )}
          <p className="mt-5 text-center text-sm text-muted">
            {mode === "signin" ? `New to ${BRAND_NAME}? ` : "Already have an account? "}
            <button
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="font-semibold text-brand"
            >
              {mode === "signin" ? "Create account" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

function OtpCard({
  phone,
  code,
  setCode,
  onSubmit,
  onResend,
  onBack,
  busy,
  error,
  resendIn,
}: {
  phone: string;
  code: string;
  setCode: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onResend: () => void;
  onBack: () => void;
  busy: boolean;
  error: string | null;
  resendIn: number;
}) {
  // Show the phone we texted with the middle masked (2547•••••123).
  const masked = phone.length >= 6 ? `${phone.slice(0, 5)}•••••${phone.slice(-3)}` : phone;
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="card w-full max-w-sm p-7">
        <div className="mb-5 flex items-center justify-center gap-2">
          <Logo className="h-9 w-9" />
          <span className="text-2xl font-bold tracking-tight">{BRAND_NAME}</span>
        </div>
        <h2 className="text-center text-lg font-bold">Verify your phone</h2>
        <p className="mt-1 text-center text-sm text-muted">
          Enter the 6-digit code we sent by SMS to <span className="font-semibold text-fg">{masked}</span>.
        </p>

        <form onSubmit={onSubmit} className="mt-5 space-y-3">
          <input
            className="input tabular text-center text-2xl font-bold tracking-[0.5em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="••••••"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            autoFocus
          />
          {error && <p className="text-center text-xs text-down">{error}</p>}
          <button type="submit" disabled={busy || code.length !== 6} className="btn btn-brand w-full py-2.5">
            {busy ? "Verifying…" : "Verify & create account"}
          </button>
        </form>

        <div className="mt-4 flex items-center justify-between text-xs">
          <button onClick={onBack} className="text-muted hover:text-fg">
            ← Change details
          </button>
          <button
            onClick={onResend}
            disabled={resendIn > 0}
            className={resendIn > 0 ? "text-muted" : "font-semibold text-brand"}
          >
            {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BrandPanel({ mode, onToggle }: { mode: Mode; onToggle: () => void }) {
  const signup = mode === "signup";
  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden p-10 text-center text-white">
      {/* animated diagonal gradient */}
      <div
        className="absolute -inset-1/3 opacity-90"
        style={{
          background:
            `conic-gradient(from 0deg at 50% 50%, ${BRAND_HEX_DARK}, #5B8DEF, ${BRAND_HEX_LIGHT}, ${BRAND_HEX_DARK})`,
          animation: "spin 16s linear infinite",
        }}
      />
      <div className="absolute inset-0 bg-black/10" />
      <div className="relative z-10 flex flex-col items-center">
        <Logo className="h-12 w-12" />
        <div className="mt-3 text-2xl font-black tracking-tight">{BRAND_NAME}</div>
        <h3 className="mt-6 text-xl font-bold">
          {signup ? "Welcome back!" : "New here?"}
        </h3>
        <p className="mt-2 max-w-[240px] text-sm text-white/85">
          {signup
            ? "Already trading with us? Sign in to your account."
            : "Create an account and start trading volatility indices in minutes."}
        </p>
        <button
          onClick={onToggle}
          className="mt-6 rounded-full border-2 border-white/80 px-8 py-2.5 text-sm font-semibold transition hover:bg-white/15"
        >
          {signup ? "Sign in" : "Create account"}
        </button>
      </div>
    </div>
  );
}

type SharedProps = {
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  busy: boolean;
  error: string | null;
  onSubmit: (e: React.FormEvent) => void;
};

function SignInForm(p: SharedProps) {
  return (
    <form onSubmit={p.onSubmit} className="w-full max-w-sm space-y-3">
      <div>
        <h1 className="text-2xl font-bold">Welcome back</h1>
        <p className="mt-1 text-sm text-muted">Sign in to your trading account.</p>
      </div>
      <input
        className="input"
        type="email"
        placeholder="Email"
        value={p.email}
        onChange={(e) => p.setEmail(e.target.value)}
        required
      />
      <input
        className="input"
        type="password"
        placeholder="Password"
        value={p.password}
        onChange={(e) => p.setPassword(e.target.value)}
        required
      />
      <div className="text-right">
        <a href="/forgot-password" className="text-xs text-muted hover:text-brand">
          Forgot password?
        </a>
      </div>
      {p.error && <p className="text-sm text-down">{p.error}</p>}
      <button type="submit" disabled={p.busy} className="btn btn-brand w-full py-2.5">
        {p.busy ? "Please wait…" : "Sign in"}
      </button>
    </form>
  );
}

function SignUpForm(
  p: SharedProps & {
    name: string;
    setName: (v: string) => void;
    phone: string;
    setPhone: (v: string) => void;
    country: string;
    setCountry: (v: string) => void;
    referral?: string;
  }
) {
  return (
    <form onSubmit={p.onSubmit} className="w-full max-w-sm space-y-3">
      <div>
        <h1 className="text-2xl font-bold">Create account</h1>
        <p className="mt-1 text-sm text-muted">Start trading in minutes.</p>
      </div>
      {p.referral ? (
        <div className="rounded-lg border border-up/30 bg-up/10 px-3 py-2 text-xs text-up">
          🎁 Invited by <b>{p.referral}</b> — you’re joining with a referral.
        </div>
      ) : null}
      <input
        className="input"
        placeholder="Full name"
        value={p.name}
        onChange={(e) => p.setName(e.target.value)}
        required
      />
      <input
        className="input"
        type="email"
        placeholder="Email"
        value={p.email}
        onChange={(e) => p.setEmail(e.target.value)}
        required
      />
      <input
        className="input"
        type="tel"
        inputMode="tel"
        placeholder="Phone number"
        value={p.phone}
        onChange={(e) => p.setPhone(e.target.value)}
        required
      />
      <input
        className="input"
        type="password"
        placeholder="Password"
        minLength={6}
        value={p.password}
        onChange={(e) => p.setPassword(e.target.value)}
        required
      />
      <div>
        <select
          className="input appearance-none"
          value={p.country}
          onChange={(e) => p.setCountry(e.target.value)}
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.flag} {c.name}
            </option>
          ))}
        </select>
        <p className="mt-1 px-1 text-[11px] text-muted">
          This sets your deposit & withdrawal options.
        </p>
      </div>
      {p.error && <p className="text-sm text-down">{p.error}</p>}
      <button type="submit" disabled={p.busy} className="btn btn-brand w-full py-2.5">
        {p.busy ? "Please wait…" : "Create account"}
      </button>
    </form>
  );
}
