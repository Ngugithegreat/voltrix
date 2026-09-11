import Link from "next/link";
import {
  Zap,
  ShieldCheck,
  Wallet,
  TrendingUp,
  Clock,
  LineChart,
  ArrowRight,
  Sparkles,
  Orbit,
  Rocket,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NovaField } from "@/components/NovaField";
import { LandingChart } from "@/components/LandingChart";
import { WinsTicker } from "@/components/WinsTicker";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import { RotatingWord } from "@/components/RotatingWord";
import { MARKETS, PAYOUT_MULTIPLIER } from "@/lib/markets";

export default function Landing() {
  return (
    <div className="relative isolate min-h-screen overflow-hidden">
      {/* Ambient starfield + nova flares */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <NovaField className="absolute inset-0 h-full w-full" density={1.1} />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/40 to-transparent" />
      </div>

      {/* Header — centered nav, distinct from a simple left/right split */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <div className="flex items-center gap-2">
          <Logo className="h-8 w-8" />
          <span className="text-xl font-bold tracking-tight">{BRAND_NAME}</span>
        </div>
        <nav className="hidden items-center gap-7 text-sm text-muted md:flex">
          <a href="#markets" className="hover:text-fg">Markets</a>
          <Link href="/how-it-works" className="hover:text-fg">How it works</Link>
          <Link href="/payout-rules" className="hover:text-fg">Payouts</Link>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/login" className="btn btn-ghost hidden px-4 py-2 text-sm sm:inline-flex">
            Sign in
          </Link>
          <Link href="/register" className="btn btn-brand px-4 py-2 text-sm">
            Get started
          </Link>
        </div>
      </header>

      {/* Hero — centered, single column (deliberately not a side-by-side split) */}
      <section className="relative z-10 mx-auto max-w-3xl px-4 pb-10 pt-10 text-center">
        <span className="animate-fade-up relative mx-auto inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-medium text-brand">
          <Sparkles className="h-3.5 w-3.5" /> Live volatility index trading
        </span>
        <h1 className="animate-fade-up mt-5 text-4xl font-black leading-[1.05] tracking-tight [animation-delay:60ms] sm:text-5xl lg:text-6xl">
          Every market has its moment.
          <br />
          <RotatingWord words={["Catch it live.", "Trade it now.", "Ride the burst.", "Own the swing.", "Make it count."]} />
        </h1>
        <p className="animate-fade-up mx-auto mt-5 max-w-xl text-lg text-muted [animation-delay:120ms]">
          {BRAND_TAGLINE}. Predict whether a Volatility Index will rise or fall,
          win up to <span className="font-semibold text-brand">{PAYOUT_MULTIPLIER}×</span>{" "}
          your stake, and cash out instantly.
        </p>
        <div className="animate-fade-up mt-7 flex flex-wrap items-center justify-center gap-3 [animation-delay:180ms]">
          <Link href="/register" className="btn btn-brand px-6 py-3 text-base">
            Start trading <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/login" className="btn btn-ghost px-6 py-3 text-base">
            I have an account
          </Link>
        </div>
        <div className="animate-fade-up mt-6 flex flex-wrap items-center justify-center gap-5 text-xs text-muted [animation-delay:220ms]">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-brand" /> Real live prices
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-brand" /> Trades from 15 seconds
          </span>
          <span className="flex items-center gap-1.5">
            <Wallet className="h-4 w-4 text-brand" /> Instant M-Pesa payouts
          </span>
        </div>
      </section>

      {/* Live proof strip — a real ticking chart, framed centrally under the hero */}
      <section className="relative z-10 mx-auto max-w-lg px-4 pb-14">
        <div className="relative">
          <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-brand/15 blur-3xl" />
          <LandingChart />
        </div>
      </section>

      <WinsTicker />

      {/* Markets — auto-scrolling belt (marquee), not a static wrap */}
      <section id="markets" className="relative z-10 border-y border-border bg-surface/40 py-5">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4">
          <span className="shrink-0 text-xs uppercase tracking-wider text-muted">
            Live markets
          </span>
          <div className="relative flex-1 overflow-hidden">
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-bg to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-bg to-transparent" />
            <div className="ticker-track flex w-max items-center gap-3">
              {[...MARKETS, ...MARKETS].map((m, i) => (
                <span
                  key={i}
                  className="shrink-0 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-semibold"
                >
                  {m.short}
                  <span className="ml-1 text-[11px] font-normal text-muted">
                    {m.name.replace(" Index", "")}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Nova stats — radial rings instead of flat cards */}
      <section className="relative z-10 mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-8 sm:grid-cols-4">
          <StatRing pct={100} value={`${PAYOUT_MULTIPLIER}×`} label="Rise/Fall payout" />
          <StatRing pct={62} value="15s" label="Fastest contract" />
          <StatRing pct={85} value="1000×" label="Max multiplier" />
          <StatRing pct={100} value="24/7" label="Markets open" />
        </div>
      </section>

      {/* Features — alternating rows, not a grid of cards */}
      <section className="relative z-10 mx-auto max-w-4xl px-4 py-10">
        <h2 className="text-center text-3xl font-bold">Built to feel instant</h2>
        <p className="mx-auto mt-2 max-w-lg text-center text-muted">
          A professional trading experience without the complexity.
        </p>
        <div className="mt-12 space-y-10">
          <FeatureRow
            icon={LineChart}
            title="Real live prices"
            desc="Volatility indices streamed live from the genuine Deriv market feed. Your trades settle on real ticks — no games, no simulated numbers."
          />
          <FeatureRow
            icon={Zap}
            title="Trade in one tap"
            desc="Pick a market, set your stake and duration, then tap Rise or Fall. Contracts run from 15 seconds up to 5 minutes."
            reverse
          />
          <FeatureRow
            icon={Wallet}
            title="Instant deposits & withdrawals"
            desc="Fund your account and cash out your winnings via M-Pesa or crypto — no waiting on manual approval."
          />
          <FeatureRow
            icon={ShieldCheck}
            title="Secure by design"
            desc="Every stake and payout is recorded to a tamper-proof ledger tied to your account, so your balance always matches your history."
            reverse
          />
        </div>
      </section>

      {/* Security / integrity band */}
      <section className="relative z-10 border-t border-border bg-surface/30">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <div className="card relative mx-auto max-w-3xl overflow-hidden p-8 text-center">
            <div className="pointer-events-none absolute -top-10 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-brand/20 blur-3xl" />
            <Orbit className="mx-auto h-8 w-8 text-brand" />
            <h2 className="mt-4 text-2xl font-bold">
              Every price, every stake, every payout — accounted for.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-muted">
              Trades settle server-side against the live market feed. Entry and
              exit prices are stamped from the real tick, and every winning
              trade pays out above your stake, always.
            </p>
          </div>
        </div>
      </section>

      {/* How it works — horizontal timeline */}
      <section className="relative z-10 mx-auto max-w-4xl px-4 py-16">
        <h2 className="text-center text-3xl font-bold">Start in 3 steps</h2>
        <div className="relative mt-12 grid gap-8 sm:grid-cols-3">
          <div className="absolute left-0 right-0 top-6 hidden h-px bg-border sm:block" />
          <TimelineStep n={1} icon={Rocket} title="Create an account" desc="Sign up free in under a minute." />
          <TimelineStep n={2} icon={Wallet} title="Deposit funds" desc="Add money with your preferred method." />
          <TimelineStep n={3} icon={TrendingUp} title="Trade & withdraw" desc="Predict Rise or Fall, win, and cash out." />
        </div>
        <div className="mt-10 text-center">
          <Link href="/register" className="btn btn-brand px-8 py-3 text-base">
            Create free account <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Footer — multi-column, distinct from a single centered block */}
      <footer className="relative z-10 border-t border-border">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3">
          <div>
            <div className="flex items-center gap-2">
              <Logo className="h-6 w-6" />
              <span className="font-bold">{BRAND_NAME}</span>
            </div>
            <p className="mt-3 max-w-xs text-xs text-muted">
              Trading volatility indices involves risk and may not be suitable
              for everyone. Only trade with money you can afford to lose.
            </p>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted">Product</div>
            <div className="mt-3 flex flex-col gap-2 text-sm">
              <Link href="/how-it-works" className="hover:text-brand">How it works</Link>
              <Link href="/payout-rules" className="hover:text-brand">Payout rules</Link>
              <a href="#markets" className="hover:text-brand">Markets</a>
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted">Account</div>
            <div className="mt-3 flex flex-col gap-2 text-sm">
              <Link href="/login" className="hover:text-brand">Sign in</Link>
              <Link href="/register" className="hover:text-brand">Create account</Link>
            </div>
          </div>
        </div>
        <div className="border-t border-border py-6 text-center text-xs text-muted">
          Prices are provided by the Deriv synthetic-index feed. © {new Date().getFullYear()} {BRAND_NAME}. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

function FeatureRow({
  icon: Icon,
  title,
  desc,
  reverse = false,
}: {
  icon: any;
  title: string;
  desc: string;
  reverse?: boolean;
}) {
  return (
    <div className={`flex items-start gap-5 ${reverse ? "sm:flex-row-reverse sm:text-right" : ""}`}>
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <h3 className="font-bold">{title}</h3>
        <p className="mt-1 text-sm text-muted">{desc}</p>
      </div>
    </div>
  );
}

function StatRing({ pct, value, label }: { pct: number; value: string; label: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div
        className="flex h-24 w-24 items-center justify-center rounded-full"
        style={{
          background: `conic-gradient(rgb(var(--brand)) ${pct}%, rgb(var(--border)) ${pct}%)`,
        }}
      >
        <div className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-bg">
          <span className="text-lg font-black text-gradient">{value}</span>
        </div>
      </div>
      <div className="mt-3 text-xs text-muted">{label}</div>
    </div>
  );
}

function TimelineStep({
  n,
  icon: Icon,
  title,
  desc,
}: {
  n: number;
  icon: any;
  title: string;
  desc: string;
}) {
  return (
    <div className="relative text-center">
      <div className="relative z-10 mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand text-white shadow-glow">
        <Icon className="h-5 w-5" />
      </div>
      <div className="mt-4 text-xs font-semibold uppercase tracking-wider text-brand">Step {n}</div>
      <h3 className="mt-1 font-bold">{title}</h3>
      <p className="mt-1 text-sm text-muted">{desc}</p>
    </div>
  );
}
