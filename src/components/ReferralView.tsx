"use client";

import { useEffect, useState } from "react";
import { Gift, Copy, Check, Users, Share2, Wallet, UserPlus } from "lucide-react";
import { useApp } from "./app-context";
import { money } from "@/lib/format";
import { BRAND_NAME } from "@/lib/brand";

export function ReferralView() {
  const { data, loading } = useApp();
  const referral = data?.referral ?? null;

  const code = referral?.code ?? "";
  const path = code ? `/register?ref=${code}` : "/register";
  const [link, setLink] = useState(path);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") setLink(window.location.origin + path);
  }, [path]);

  async function copy(value: string, which: "link" | "code") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard blocked — user can select manually */
    }
  }

  async function share() {
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({
          title: `Join me on ${BRAND_NAME}`,
          text: `Trade volatility indices on ${BRAND_NAME} — sign up with my link:`,
          url: link,
        });
        return;
      } catch {
        /* fell through to copy */
      }
    }
    copy(link, "link");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Hero */}
      <div className="card relative overflow-hidden p-7 sm:p-9">
        <div className="pointer-events-none absolute -right-10 -top-10 h-52 w-52 rounded-full bg-brand/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-10 h-52 w-52 rounded-full bg-brand/10 blur-3xl" />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
            <Gift className="h-3.5 w-3.5" /> Refer &amp; earn
          </span>
          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
            Invite friends, earn real cash
          </h1>
          <p className="mt-2 max-w-lg text-sm text-muted sm:text-base">
            Share your personal link. When a friend joins and makes their first deposit,
            you earn a reward credited straight to your balance — no limit on how many you invite.
          </p>

          {/* Share link */}
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <div className="tabular flex-1 truncate rounded-xl border border-border bg-surface2/70 px-4 py-3 text-sm">
              {loading && !referral ? "…" : link}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => copy(link, "link")}
                disabled={!referral}
                className="btn btn-ghost shrink-0 px-4 py-3 text-sm"
              >
                {copied === "link" ? <Check className="h-4 w-4 text-up" /> : <Copy className="h-4 w-4" />}
                {copied === "link" ? "Copied" : "Copy"}
              </button>
              <button
                onClick={share}
                disabled={!referral}
                className="btn btn-brand shrink-0 px-5 py-3 text-sm"
              >
                <Share2 className="h-4 w-4" /> Share
              </button>
            </div>
          </div>

          {/* Referral code chip */}
          <div className="mt-3 flex items-center gap-2 text-sm text-muted">
            <span>Your code:</span>
            <button
              onClick={() => code && copy(code, "code")}
              className="tabular inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface2/70 px-2.5 py-1 font-bold text-fg transition hover:border-brand/40"
            >
              {code || "—"}
              {copied === "code" ? <Check className="h-3.5 w-3.5 text-up" /> : <Copy className="h-3.5 w-3.5 text-muted" />}
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted">
            <Users className="h-3.5 w-3.5" /> Friends referred
          </div>
          <div className="tabular mt-1 text-3xl font-black">{referral?.referredCount ?? 0}</div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted">
            <Gift className="h-3.5 w-3.5" /> Rewards earned
          </div>
          <div className="tabular mt-1 text-3xl font-black text-up">{money(referral?.earnedCents ?? 0)}</div>
        </div>
      </div>

      {/* How it works */}
      <div className="card p-6">
        <div className="text-sm font-bold">How it works</div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Step icon={Share2} n={1} title="Share your link" body="Send your personal invite link to friends." />
          <Step icon={UserPlus} n={2} title="They join & deposit" body="Your friend signs up and funds their account." />
          <Step icon={Wallet} n={3} title="You get paid" body="Your reward lands in your balance automatically." />
        </div>
      </div>
    </div>
  );
}

function Step({
  icon: Icon,
  n,
  title,
  body,
}: {
  icon: any;
  n: number;
  title: string;
  body: string;
}) {
  return (
    <div className="relative rounded-2xl border border-border bg-surface2/50 p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/15 text-brand">
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Step {n}</span>
      </div>
      <div className="mt-2 text-sm font-semibold">{title}</div>
      <p className="mt-1 text-xs leading-relaxed text-muted">{body}</p>
    </div>
  );
}
