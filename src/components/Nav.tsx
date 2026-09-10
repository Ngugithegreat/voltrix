"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LineChart,
  Wallet,
  History,
  LogOut,
  ArrowDownToLine,
  ArrowUpFromLine,
  Gift,
  ChevronDown,
  Check,
  BadgeCheck,
  FlaskConical,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useApp, AccountMode } from "./app-context";
import { money } from "@/lib/format";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { BRAND_NAME } from "@/lib/brand";

const links = [
  { href: "/trade", label: "Trade", icon: LineChart },
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/history", label: "History", icon: History },
  { href: "/referrals", label: "Refer", icon: Gift },
];

/**
 * A single button that alternates between Deposit and Withdraw, sliding
 * between the two so it takes the space of one button. Tapping it opens the
 * wallet on whichever action is currently showing.
 */
function DepositWithdrawButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [i, setI] = useState(0); // 0 = deposit, 1 = withdraw

  useEffect(() => {
    const t = setInterval(() => setI((v) => (v === 0 ? 1 : 0)), 3200);
    return () => clearInterval(t);
  }, []);

  return (
    <button
      onClick={() => router.push(`/wallet?action=${i === 0 ? "deposit" : "withdraw"}`)}
      aria-label="Deposit or withdraw"
      className={`btn btn-brand relative h-9 w-[120px] overflow-hidden px-0 text-sm ${className}`}
    >
      <span
        className="absolute left-0 top-0 flex w-full flex-col transition-transform duration-500 ease-in-out"
        style={{ transform: i === 0 ? "translateY(0)" : "translateY(-50%)" }}
      >
        <span className="flex h-9 shrink-0 items-center justify-center gap-1.5">
          <ArrowDownToLine className="h-4 w-4" /> Deposit
        </span>
        <span className="flex h-9 shrink-0 items-center justify-center gap-1.5">
          <ArrowUpFromLine className="h-4 w-4" /> Withdraw
        </span>
      </span>
    </button>
  );
}

/**
 * Real ⇄ Demo account switcher — like the big brokers. Shows the active
 * account and its balance; the dropdown lists both with their balances.
 */
function AccountSwitcher() {
  const { mode, setMode, realBalance, demoBalance, loading, refresh } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const demo = mode === "demo";

  function choose(m: AccountMode) {
    if (m !== mode) {
      setMode(m);
      refresh();
    }
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 transition ${
          demo ? "border-gold/50 bg-gold/10" : "border-border bg-surface2/60 hover:border-brand/40"
        }`}
      >
        <span className="flex flex-col items-start leading-none">
          <span className={`text-[9px] font-bold uppercase tracking-wider ${demo ? "text-gold" : "text-up"}`}>
            {demo ? "Demo" : "Real"}
          </span>
          <span className={`tabular mt-0.5 text-sm font-bold ${demo ? "text-gold" : "text-brand"}`}>
            {loading ? "—" : money(demo ? demoBalance : realBalance)}
          </span>
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          <div className="border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
            Switch account
          </div>
          <AccountRow
            active={!demo}
            icon={BadgeCheck}
            label="Real account"
            sub="Your live funds"
            amount={money(realBalance)}
            accent="text-brand"
            onClick={() => choose("real")}
          />
          <AccountRow
            active={demo}
            icon={FlaskConical}
            label="Demo account"
            sub="Practice · virtual funds"
            amount={money(demoBalance)}
            accent="text-gold"
            onClick={() => choose("demo")}
          />
        </div>
      )}
    </div>
  );
}

function AccountRow({
  active,
  icon: Icon,
  label,
  sub,
  amount,
  accent,
  onClick,
}: {
  active: boolean;
  icon: any;
  label: string;
  sub: string;
  amount: string;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-surface2 ${
        active ? "bg-surface2/60" : ""
      }`}
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface2 ${accent}`}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          {label}
          {active && <Check className="h-3.5 w-3.5 text-up" />}
        </span>
        <span className="block text-[11px] text-muted">{sub}</span>
      </span>
      <span className={`tabular text-sm font-bold ${accent}`}>{amount}</span>
    </button>
  );
}

export function Nav() {
  const pathname = usePathname();
  const { logout, user, demo } = useApp();

  // Auto-hide the mobile bottom bar: tuck it away while scrolling down through
  // content, slide it back the moment the user scrolls up (or nears the top).
  const [barHidden, setBarHidden] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (y < 48) setBarHidden(false);
        else if (y > last + 6) setBarHidden(true);
        else if (y < last - 6) setBarHidden(false);
        last = y;
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      {/* ---------------------------- Top header ---------------------------- */}
      <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href="/trade" className="flex items-center gap-2">
              <Logo className="h-7 w-7" />
              {/* Wordmark hides on the tightest phones so the action row fits */}
              <span className="hidden text-lg font-bold tracking-tight min-[380px]:inline">
                {BRAND_NAME}
              </span>
            </Link>
            {/* Desktop primary nav */}
            <nav className="hidden items-center gap-1 md:flex">
              {links.map((l) => {
                const active = pathname === l.href;
                const Icon = l.icon;
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                      active ? "bg-surface2 text-fg" : "text-muted hover:text-fg"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {l.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Live-account chip — desktop only */}
            {user?.account_no && (
              <div className="hidden items-center gap-1.5 rounded-lg border border-up/30 bg-up/10 px-2.5 py-1.5 lg:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-up" />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-up">
                  Live account
                </span>
                <span className="tabular text-[10px] text-muted">{user.account_no}</span>
              </div>
            )}

            {/* Real ⇄ Demo account switcher + active balance */}
            <AccountSwitcher />

            {/* Sliding Deposit / Withdraw action (real account only) */}
            {!demo && <DepositWithdrawButton />}

            {/* Profile avatar */}
            <Link
              href="/profile"
              title="Profile"
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white transition ${
                pathname === "/profile" ? "ring-2 ring-brand ring-offset-2 ring-offset-bg" : ""
              }`}
              style={{ background: "linear-gradient(135deg, rgb(var(--brand-light)), rgb(var(--brand-dark)))" }}
            >
              {(user?.name || "U").split(" ").filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("") || "U"}
            </Link>

            <ThemeToggle />
            <button
              onClick={logout}
              title="Log out"
              className="btn btn-ghost hidden h-9 w-9 p-0 md:inline-flex"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ------------------------ Mobile bottom tab bar ------------------------ */}
      <nav
        className={`fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur transition-transform duration-300 md:hidden ${
          barHidden ? "translate-y-full" : "translate-y-0"
        }`}
      >
        <div className="mx-auto flex max-w-md items-stretch justify-around px-2">
          {links.map((l) => {
            const active = pathname === l.href;
            const Icon = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
                  active ? "text-brand" : "text-muted"
                }`}
              >
                {active && (
                  <span className="absolute top-0 h-0.5 w-8 rounded-full bg-brand" />
                )}
                <Icon className="h-5 w-5" />
                {l.label}
              </Link>
            );
          })}
          <button
            onClick={logout}
            className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted transition active:text-down"
          >
            <LogOut className="h-5 w-5" />
            Log out
          </button>
        </div>
      </nav>
    </>
  );
}
