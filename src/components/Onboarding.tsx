"use client";

import { useEffect, useState } from "react";
import { LineChart, Hash, Wallet, Rocket } from "lucide-react";
import { Logo } from "./Logo";
import { BRAND_NAME } from "@/lib/brand";

const KEY = "st_onboarded_v1";

const STEPS = [
  {
    icon: LineChart,
    title: `Welcome to ${BRAND_NAME}`,
    body: "Trade live Volatility Indices in seconds. Predict where the price goes and win when you're right — all on a real-time market feed.",
  },
  {
    icon: Hash,
    title: "Pick how you trade",
    body: "Rise/Fall — will the price go up or down? Digits — bet on the last digit (Over/Under, Even/Odd, Matches). Multipliers — amplify your move. Choose one, set a stake, and go.",
  },
  {
    icon: Wallet,
    title: "Deposit & withdraw instantly",
    body: "Fund your account with M-Pesa, card, or crypto and cash out just as fast. Your balance updates the moment a payment confirms.",
  },
  {
    icon: Rocket,
    title: "You're all set",
    body: "Start small, learn the markets, and only trade what you can afford to lose. Good luck out there!",
  },
];

export function Onboarding() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setOpen(true);
    } catch {
      /* ignore */
    }
  }, []);

  function close() {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  if (!open) return null;
  const s = STEPS[step];
  const Icon = s.icon;
  const last = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="card w-full max-w-md overflow-hidden p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo className="h-7 w-7" />
            <span className="text-lg font-bold tracking-tight">{BRAND_NAME}</span>
          </div>
          <button onClick={close} className="text-xs text-muted hover:text-fg">
            Skip
          </button>
        </div>

        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/15 text-brand">
          <Icon className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-xl font-bold">{s.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>

        <div className="mt-6 flex items-center justify-between">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? "w-5 bg-brand" : "w-1.5 bg-border"
                }`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {step > 0 && (
              <button onClick={() => setStep((v) => v - 1)} className="btn btn-ghost px-4 py-2 text-sm">
                Back
              </button>
            )}
            <button
              onClick={() => (last ? close() : setStep((v) => v + 1))}
              className="btn btn-brand px-5 py-2 text-sm"
            >
              {last ? "Start trading" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
